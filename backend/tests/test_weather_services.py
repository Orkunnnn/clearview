from __future__ import annotations

from io import BytesIO

import numpy as np
from PIL import Image

from app.services.weather.depth_cache import DepthCache
from app.services.weather.fog_service import FogService
from app.services.weather.rain_service import RainService


def make_test_image_bytes() -> bytes:
    image = Image.new("RGB", (32, 24), color=(120, 140, 160))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def test_depth_cache_reuses_item() -> None:
    cache = DepthCache(max_items=2)
    value = object()
    cache.set("a", value)

    assert cache.get("a") is value


def test_fog_intensity_mapping() -> None:
    service = FogService()

    assert service._map_intensity_to_beta(0) == 0.5
    assert service._map_intensity_to_beta(100) == 4.0


def test_rain_config_mapping() -> None:
    service = RainService()
    low = service._build_config(0)
    high = service._build_config(100)

    assert low.rain_rate_mm_h == 2.0
    assert high.rain_rate_mm_h == 30.0
    assert low.exposure_ms == 6.0
    assert high.exposure_ms == 16.0


def test_rain_service_preserves_size_and_changes_pixels() -> None:
    service = RainService()
    source = make_test_image_bytes()
    output = service.synthesize(source, 80)

    original = np.asarray(Image.open(BytesIO(source)).convert("RGB"))
    generated = np.asarray(Image.open(BytesIO(output)).convert("RGB"))

    assert generated.shape == original.shape
    assert np.any(generated != original)
