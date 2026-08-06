from __future__ import annotations

from io import BytesIO

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.routers import metrics as metrics_router
from app.services.fade_metric import FadeMetric

client = TestClient(app)


def make_image_bytes(offset: int = 0) -> bytes:
    x = np.linspace(30 + offset, 210 + offset, 32, dtype=np.uint8)
    gradient = np.tile(x, (24, 1))
    image = np.dstack([gradient, np.flipud(gradient), np.full_like(gradient, 140)])
    buffer = BytesIO()
    Image.fromarray(image, mode="RGB").save(buffer, format="PNG")
    return buffer.getvalue()


def test_no_reference_metrics_returns_all_available_scores(monkeypatch) -> None:
    monkeypatch.setattr(
        metrics_router.metrics_service,
        "_to_iqa_tensor",
        lambda rgb: object(),
    )
    monkeypatch.setattr(
        metrics_router.metrics_service,
        "_iqa_score",
        lambda metric_name, tensor: {
            "niqe": 4.2,
            "brisque": 18.5,
            "piqe": 31.0,
        }[metric_name],
    )
    monkeypatch.setattr(
        metrics_router.metrics_service._fade,
        "calculate",
        lambda rgb: 0.7,
    )

    response = client.post(
        "/api/metrics/no-reference",
        data={"include_fade": "true"},
        files={"image": ("output.png", make_image_bytes(), "image/png")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["entropy"] > 0
    assert payload["niqe"] == 4.2
    assert payload["brisque"] == 18.5
    assert payload["piqe"] == 31.0
    assert payload["fade"] == 0.7


def test_no_reference_metrics_skips_fade_when_not_requested(monkeypatch) -> None:
    monkeypatch.setattr(
        metrics_router.metrics_service,
        "_to_iqa_tensor",
        lambda rgb: object(),
    )
    monkeypatch.setattr(
        metrics_router.metrics_service,
        "_iqa_score",
        lambda metric_name, tensor: {
            "niqe": 4.2,
            "brisque": 18.5,
            "piqe": 31.0,
        }[metric_name],
    )

    def fail_fade(rgb: np.ndarray) -> float:
        raise AssertionError("FADE should not run unless it is requested.")

    monkeypatch.setattr(metrics_router.metrics_service._fade, "calculate", fail_fade)

    response = client.post(
        "/api/metrics/no-reference",
        files={"image": ("output.png", make_image_bytes(), "image/png")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["entropy"] > 0
    assert payload["fade"] is None


def test_full_reference_metrics_returns_mse_psnr_and_ssim() -> None:
    response = client.post(
        "/api/metrics/full-reference",
        files={
            "reference": ("clean.png", make_image_bytes(), "image/png"),
            "output": ("output.png", make_image_bytes(offset=8), "image/png"),
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["mse"] > 0
    assert payload["psnr"] > 0
    assert 0 <= payload["ssim"] <= 1
    assert payload["comparedWidth"] == 32
    assert payload["comparedHeight"] == 24


def test_empty_metric_image_returns_400() -> None:
    response = client.post(
        "/api/metrics/no-reference",
        files={"image": ("empty.png", b"", "image/png")},
    )

    assert response.status_code == 400


def test_fade_metric_matches_matlab_reference_for_synthetic_image() -> None:
    x, y = np.meshgrid(
        np.arange(256, dtype=np.uint16),
        np.arange(256, dtype=np.uint16),
    )
    image = np.dstack(((x + y) % 256, x, y)).astype(np.uint8)

    score = FadeMetric().calculate(image)

    assert score is not None
    assert score == pytest.approx(0.700256493848, abs=0.02)
