from __future__ import annotations

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from app.services.dehazing.dehazeformer_service import (
    DehazeFormerService,
    DehazeFormerUnavailableError,
)
from app.services.dehazing.fast_dehaze_service import FastDehazeService
from app.services.deraining.mprnet_derain_service import (
    MPRNetDerainService,
    MPRNetUnavailableError,
)
from app.services.deraining.ugsm_derain_service import UgsmDerainService

router = APIRouter(tags=["process"])

FAST_SINGLE_IMAGE_DEHAZING_ALGORITHM = "fast-single-image-dehazing"
DEHAZEFORMER_ALGORITHM = "dehazeformer"
MPRNET_DERAINING_ALGORITHM = "mprnet"
DEHAZING_ALGORITHMS = {FAST_SINGLE_IMAGE_DEHAZING_ALGORITHM, DEHAZEFORMER_ALGORITHM}
DERAINING_ALGORITHMS = {"ugsm", MPRNET_DERAINING_ALGORITHM}

fast_dehaze_service = FastDehazeService()
dehazeformer_service = DehazeFormerService()
ugsm_derain_service = UgsmDerainService()
mprnet_derain_service = MPRNetDerainService()


@router.post("/api/process")
async def process_image(
    image: UploadFile = File(...),  # noqa: B008
    algorithm: str = Form(...),  # noqa: B008
) -> Response:
    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Boş görsel yüklenemez.")

    if algorithm not in DEHAZING_ALGORITHMS and algorithm not in DERAINING_ALGORITHMS:
        raise HTTPException(
            status_code=501,
            detail=f"Bu algoritma sunucu tarafından henüz desteklenmiyor: {algorithm}",
        )

    try:
        if algorithm == DEHAZEFORMER_ALGORITHM:
            dehazeformer_result = dehazeformer_service.synthesize(image_bytes)
            return Response(
                content=dehazeformer_result.image_bytes,
                media_type="image/png",
                headers={
                    "X-Dehazing-Backend": "dehazeformer",
                    "X-DehazeFormer-Checkpoint": dehazeformer_result.checkpoint,
                    "X-DehazeFormer-Elapsed-Ms": (
                        f"{dehazeformer_result.elapsed_ms:.3f}"
                    ),
                    "X-DehazeFormer-Original-Size": _format_size(
                        dehazeformer_result.original_size
                    ),
                    "X-DehazeFormer-Inference-Size": _format_size(
                        dehazeformer_result.inference_size
                    ),
                },
            )

        if algorithm == MPRNET_DERAINING_ALGORITHM:
            mprnet_result = mprnet_derain_service.synthesize(image_bytes)
            return Response(
                content=mprnet_result.image_bytes,
                media_type="image/png",
                headers={
                    "X-Deraining-Backend": "mprnet",
                    "X-MPRNet-Checkpoint": mprnet_result.checkpoint,
                    "X-MPRNet-Elapsed-Ms": f"{mprnet_result.elapsed_ms:.3f}",
                    "X-MPRNet-Original-Size": _format_size(mprnet_result.original_size),
                    "X-MPRNet-Inference-Size": _format_size(
                        mprnet_result.inference_size
                    ),
                },
            )

        if algorithm == "ugsm":
            derain_result = ugsm_derain_service.synthesize(image_bytes)
            return Response(
                content=derain_result.image_bytes,
                media_type="image/png",
                headers={
                    "X-Deraining-Backend": "ugsm",
                    "X-UGSM-Iterations": str(derain_result.iterations),
                    "X-UGSM-Relative-Change": (f"{derain_result.relative_change:.6f}"),
                },
            )

        result = fast_dehaze_service.synthesize(image_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except DehazeFormerUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except MPRNetUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return Response(
        content=result.image_bytes,
        media_type="image/png",
        headers={
            "X-Dehazing-Backend": "fast-single-image-dehazing",
            "X-Transmission-Mean": f"{result.transmission_mean:.6f}",
        },
    )


def _format_size(size: tuple[int, int]) -> str:
    width, height = size
    return f"{width}x{height}"
