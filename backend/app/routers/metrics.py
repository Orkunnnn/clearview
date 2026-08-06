from __future__ import annotations

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.services.metrics_service import MetricsService

router = APIRouter(tags=["metrics"])

metrics_service = MetricsService()


@router.post("/api/metrics/no-reference")
async def calculate_no_reference_metrics(
    image: UploadFile = File(...),  # noqa: B008
    include_fade: bool = Form(False),  # noqa: B008
) -> dict[str, float | None]:
    image_bytes = await image.read()
    try:
        metrics = metrics_service.calculate_no_reference(image_bytes, include_fade)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "entropy": metrics.entropy,
        "niqe": metrics.niqe,
        "brisque": metrics.brisque,
        "piqe": metrics.piqe,
        "fade": metrics.fade,
    }


@router.post("/api/metrics/full-reference")
async def calculate_full_reference_metrics(
    reference: UploadFile = File(...),  # noqa: B008
    output: UploadFile = File(...),  # noqa: B008
) -> dict[str, float | int | None]:
    reference_bytes = await reference.read()
    output_bytes = await output.read()
    try:
        metrics = metrics_service.calculate_full_reference(
            reference_bytes,
            output_bytes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "mse": metrics.mse,
        "psnr": metrics.psnr,
        "ssim": metrics.ssim,
        "comparedWidth": metrics.compared_width,
        "comparedHeight": metrics.compared_height,
    }
