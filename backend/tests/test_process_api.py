from __future__ import annotations

from io import BytesIO

import numpy as np
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.routers import process as process_router
from app.services.dehazing.dehazeformer_service import (
    DehazeFormerResult,
    DehazeFormerUnavailableError,
)
from app.services.deraining.mprnet_derain_service import (
    MPRNetDerainResult,
    MPRNetUnavailableError,
)

client = TestClient(app)


def make_test_image_bytes() -> bytes:
    x = np.linspace(40, 220, 32, dtype=np.uint8)
    gradient = np.tile(x, (24, 1))
    image = np.dstack([gradient, np.flipud(gradient), np.full_like(gradient, 180)])
    buffer = BytesIO()
    Image.fromarray(image, mode="RGB").save(buffer, format="PNG")
    return buffer.getvalue()


def test_dehazing_process_returns_image() -> None:
    response = client.post(
        "/api/process",
        data={"algorithm": "fast-single-image-dehazing"},
        files={"image": ("sample.png", make_test_image_bytes(), "image/png")},
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert "x-transmission-mean" in response.headers
    assert Image.open(BytesIO(response.content)).convert("RGB").size == (32, 24)


def test_dehazeformer_process_returns_image(monkeypatch) -> None:
    class FakeDehazeFormerService:
        def synthesize(self, image_bytes: bytes) -> DehazeFormerResult:
            return DehazeFormerResult(
                image_bytes=image_bytes,
                checkpoint="/fake/dehazeformer/weights.pth",
                elapsed_ms=23.5,
                original_size=(32, 24),
                inference_size=(32, 24),
            )

    monkeypatch.setattr(
        process_router, "dehazeformer_service", FakeDehazeFormerService()
    )
    response = client.post(
        "/api/process",
        data={"algorithm": "dehazeformer"},
        files={"image": ("sample.png", make_test_image_bytes(), "image/png")},
    )

    assert response.status_code == 200
    assert response.headers["x-dehazing-backend"] == "dehazeformer"
    assert (
        response.headers["x-dehazeformer-checkpoint"]
        == "/fake/dehazeformer/weights.pth"
    )
    assert "x-dehazeformer-elapsed-ms" in response.headers
    assert Image.open(BytesIO(response.content)).convert("RGB").size == (32, 24)


def test_dehazeformer_unavailable_returns_503(monkeypatch) -> None:
    class UnavailableDehazeFormerService:
        def synthesize(self, image_bytes: bytes) -> DehazeFormerResult:
            raise DehazeFormerUnavailableError("DehazeFormer test ortamı yok.")

    monkeypatch.setattr(
        process_router, "dehazeformer_service", UnavailableDehazeFormerService()
    )
    response = client.post(
        "/api/process",
        data={"algorithm": "dehazeformer"},
        files={"image": ("sample.png", make_test_image_bytes(), "image/png")},
    )
    assert response.status_code == 503


def test_deraining_process_returns_image() -> None:
    response = client.post(
        "/api/process",
        data={"algorithm": "ugsm"},
        files={"image": ("sample.png", make_test_image_bytes(), "image/png")},
    )

    assert response.status_code == 200
    assert response.headers["x-deraining-backend"] == "ugsm"
    assert "x-ugsm-iterations" in response.headers
    assert Image.open(BytesIO(response.content)).convert("RGB").size == (32, 24)


def test_mprnet_process_returns_image(monkeypatch) -> None:
    class FakeMPRNetService:
        def synthesize(self, image_bytes: bytes) -> MPRNetDerainResult:
            return MPRNetDerainResult(
                image_bytes=image_bytes,
                checkpoint="/fake/mprnet/model_deraining.pth",
                elapsed_ms=12.5,
                original_size=(32, 24),
                inference_size=(32, 24),
            )

    monkeypatch.setattr(process_router, "mprnet_derain_service", FakeMPRNetService())
    response = client.post(
        "/api/process",
        data={"algorithm": "mprnet"},
        files={"image": ("sample.png", make_test_image_bytes(), "image/png")},
    )

    assert response.status_code == 200
    assert response.headers["x-deraining-backend"] == "mprnet"
    assert response.headers["x-mprnet-checkpoint"] == "/fake/mprnet/model_deraining.pth"
    assert "x-mprnet-elapsed-ms" in response.headers
    assert Image.open(BytesIO(response.content)).convert("RGB").size == (32, 24)


def test_mprnet_unavailable_returns_503(monkeypatch) -> None:
    class UnavailableMPRNetService:
        def synthesize(self, image_bytes: bytes) -> MPRNetDerainResult:
            raise MPRNetUnavailableError("MPRNet test ortamı yok.")

    monkeypatch.setattr(
        process_router, "mprnet_derain_service", UnavailableMPRNetService()
    )
    response = client.post(
        "/api/process",
        data={"algorithm": "mprnet"},
        files={"image": ("sample.png", make_test_image_bytes(), "image/png")},
    )
    assert response.status_code == 503


def test_unsupported_process_algorithm_returns_501() -> None:
    response = client.post(
        "/api/process",
        data={"algorithm": "mspfn"},
        files={"image": ("sample.png", make_test_image_bytes(), "image/png")},
    )
    assert response.status_code == 501


def test_empty_process_image_returns_400() -> None:
    response = client.post(
        "/api/process",
        data={"algorithm": "fast-single-image-dehazing"},
        files={"image": ("empty.png", b"", "image/png")},
    )
    assert response.status_code == 400


def test_legacy_dehazing_algorithm_returns_501() -> None:
    response = client.post(
        "/api/process",
        data={"algorithm": "light-dehazenet"},
        files={"image": ("sample.png", make_test_image_bytes(), "image/png")},
    )
    assert response.status_code == 501
