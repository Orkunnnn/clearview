from __future__ import annotations

from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.routers import weather

client = TestClient(app)


def make_test_image_bytes() -> bytes:
    image = Image.new("RGB", (24, 24), color=(64, 96, 128))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def test_capabilities_shape(monkeypatch) -> None:
    monkeypatch.setattr(
        weather.fog_service,
        "get_capability",
        lambda: type("Capability", (), {"available": False, "reason": "missing"})(),
    )

    response = client.get("/api/capabilities")

    assert response.status_code == 200
    assert response.json() == {
        "fog": {"available": False, "reason": "missing"},
        "rain": {"available": True, "reason": None},
    }


def test_rain_synthesis_returns_image(monkeypatch) -> None:
    monkeypatch.setattr(weather.rain_service, "synthesize", lambda *_args: b"png-bytes")

    response = client.post(
        "/api/synthesize/weather",
        data={"effect": "rain", "intensity": "40"},
        files={"image": ("sample.png", make_test_image_bytes(), "image/png")},
    )

    assert response.status_code == 200
    assert response.content == b"png-bytes"
    assert response.headers["content-type"] == "image/png"


def test_fog_unavailable_returns_503(monkeypatch) -> None:
    def raise_error(*_args):
        raise RuntimeError("weights missing")

    monkeypatch.setattr(weather.fog_service, "synthesize", raise_error)

    response = client.post(
        "/api/synthesize/weather",
        data={"effect": "fog", "intensity": "40"},
        files={"image": ("sample.png", make_test_image_bytes(), "image/png")},
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "weights missing"


def test_invalid_intensity_returns_422() -> None:
    response = client.post(
        "/api/synthesize/weather",
        data={"effect": "rain", "intensity": "120"},
        files={"image": ("sample.png", make_test_image_bytes(), "image/png")},
    )

    assert response.status_code == 422
