from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import cv2
import numpy as np
from skimage.metrics import peak_signal_noise_ratio, structural_similarity

from app.services.fade_metric import FadeMetric


@dataclass(frozen=True)
class NoReferenceMetrics:
    entropy: float
    niqe: float | None
    brisque: float | None
    piqe: float | None
    fade: float | None


@dataclass(frozen=True)
class FullReferenceMetrics:
    mse: float
    psnr: float | None
    ssim: float
    compared_width: int
    compared_height: int


class MetricsService:
    def __init__(self) -> None:
        self._iqa_metrics: dict[str, Any] = {}
        self._fade = FadeMetric()

    def calculate_no_reference(
        self, image_bytes: bytes, include_fade: bool = False
    ) -> NoReferenceMetrics:
        bgr = self._decode_image(image_bytes)
        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        iqa_tensor = self._to_iqa_tensor(rgb)

        return NoReferenceMetrics(
            entropy=self._entropy(gray),
            niqe=self._iqa_score("niqe", iqa_tensor),
            brisque=self._iqa_score("brisque", iqa_tensor),
            piqe=self._iqa_score("piqe", iqa_tensor),
            fade=self._fade.calculate(rgb) if include_fade else None,
        )

    def calculate_full_reference(
        self, reference_bytes: bytes, output_bytes: bytes
    ) -> FullReferenceMetrics:
        reference = self._decode_image(reference_bytes)
        output = self._decode_image(output_bytes)

        reference_rgb = cv2.cvtColor(reference, cv2.COLOR_BGR2RGB)
        output_rgb = cv2.cvtColor(output, cv2.COLOR_BGR2RGB)

        ref_height, ref_width = reference_rgb.shape[:2]
        if output_rgb.shape[:2] != reference_rgb.shape[:2]:
            output_rgb = cv2.resize(
                output_rgb,
                (ref_width, ref_height),
                interpolation=cv2.INTER_AREA,
            )

        diff = reference_rgb.astype(np.float32) - output_rgb.astype(np.float32)
        mse = float(np.mean(np.square(diff)))
        psnr = (
            None
            if mse == 0
            else float(
                peak_signal_noise_ratio(
                    reference_rgb,
                    output_rgb,
                    data_range=255,
                )
            )
        )
        min_side = min(ref_height, ref_width)
        if min_side < 3:
            raise ValueError("SSIM hesaplamak için görsel boyutu çok küçük.")
        win_size = min(7, min_side if min_side % 2 == 1 else min_side - 1)
        ssim = float(
            structural_similarity(
                reference_rgb,
                output_rgb,
                channel_axis=-1,
                data_range=255,
                win_size=win_size,
            )
        )

        return FullReferenceMetrics(
            mse=mse,
            psnr=psnr,
            ssim=ssim,
            compared_width=ref_width,
            compared_height=ref_height,
        )

    def _decode_image(self, image_bytes: bytes) -> np.ndarray:
        if not image_bytes:
            raise ValueError("Boş görsel yüklenemez.")

        image_array = np.frombuffer(image_bytes, dtype=np.uint8)
        bgr = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
        if bgr is None:
            raise ValueError("Görsel okunamadı.")
        return bgr

    def _entropy(self, gray: np.ndarray) -> float:
        hist = cv2.calcHist([gray], [0], None, [256], [0, 256]).ravel()
        total = max(float(np.sum(hist)), np.finfo(np.float32).eps)
        probabilities = hist / total
        probabilities = probabilities[probabilities > 0]
        return float(-np.sum(probabilities * np.log2(probabilities)))

    def _to_iqa_tensor(self, rgb: np.ndarray) -> Any:
        import torch

        contiguous = np.ascontiguousarray(rgb)
        return (
            torch.from_numpy(contiguous)
            .permute(2, 0, 1)
            .unsqueeze(0)
            .float()
            .div(255.0)
        )

    def _iqa_score(self, metric_name: str, tensor: Any) -> float | None:
        import torch

        try:
            metric = self._get_iqa_metric(metric_name)
            with torch.inference_mode():
                score = metric(tensor)
            value = float(score.detach().cpu().reshape(-1)[0])
        except Exception:
            return None

        if not np.isfinite(value):
            return None
        return value

    def _get_iqa_metric(self, metric_name: str) -> Any:
        metric = self._iqa_metrics.get(metric_name)
        if metric is not None:
            return metric

        import pyiqa

        metric = pyiqa.create_metric(metric_name, device="cpu")
        self._iqa_metrics[metric_name] = metric
        return metric
