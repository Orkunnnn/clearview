from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from app.services.weather.fog_service import FogService
from app.services.weather.rain_service import RainService

router = APIRouter(tags=["weather"])

fog_service = FogService()
rain_service = RainService()


@router.get("/api/capabilities")
async def get_capabilities() -> dict[str, object]:
    fog = fog_service.get_capability()
    return {
        "fog": {
            "available": fog.available,
            "reason": fog.reason,
        },
        "rain": {
            "available": True,
            "reason": None,
        },
    }


@router.post("/api/synthesize/weather")
async def synthesize_weather(
    image: UploadFile = File(...),  # noqa: B008
    effect: Literal["fog", "rain"] = Form(...),  # noqa: B008
    intensity: float = Form(...),  # noqa: B008
) -> Response:
    if intensity < 0 or intensity > 100:
        raise HTTPException(
            status_code=422, detail="Yoğunluk 0 ile 100 arasında olmalı."
        )

    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Boş görsel yüklenemez.")

    try:
        if effect == "fog":
            output = fog_service.synthesize(image_bytes, intensity)
        else:
            output = rain_service.synthesize(image_bytes, intensity)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        status_code = 503 if effect == "fog" else 500
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc

    return Response(content=output, media_type="image/png")
