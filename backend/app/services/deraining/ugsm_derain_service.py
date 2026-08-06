from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np


@dataclass(frozen=True)
class UgsmDerainResult:
    image_bytes: bytes
    iterations: int
    relative_change: float


@dataclass(frozen=True)
class UgsmOptions:
    lambda1: float = 0.08
    lambda2: float = 0.95
    beta1: float = 100.0
    beta2: float = 100.0
    beta3: float = 100.0
    tolerance: float = 1.0e-3
    max_iterations: int = 200


class UgsmDerainService:
    """Directional Global Sparse Model single-image rain removal.

    Python port of `UGSM_v3.0/Functions/ugsm.m` and the real-image demo flow:
    remove the estimated rain streak layer from the Y channel, then preserve Cb/Cr.
    """

    def __init__(self, options: UgsmOptions | None = None) -> None:
        self.options = options or UgsmOptions()

    def synthesize(self, image_bytes: bytes) -> UgsmDerainResult:
        image_array = np.frombuffer(image_bytes, dtype=np.uint8)
        rainy_bgr = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
        if rainy_bgr is None:
            raise ValueError("Görsel okunamadı.")

        rainy_rgb = cv2.cvtColor(rainy_bgr, cv2.COLOR_BGR2RGB).astype(np.float32)
        rainy_rgb /= 255.0

        ycbcr = self._rgb_to_ycbcr(rainy_rgb)
        rain_layer, iterations, relative_change = self._ugsm(
            ycbcr[:, :, 0], self.options
        )

        derained_ycbcr = ycbcr.copy()
        derained_ycbcr[:, :, 0] = np.clip(ycbcr[:, :, 0] - rain_layer, 0.0, 1.0)
        derained_rgb = np.clip(self._ycbcr_to_rgb(derained_ycbcr), 0.0, 1.0)

        derained_bgr = cv2.cvtColor(
            np.uint8(np.round(derained_rgb * 255.0)), cv2.COLOR_RGB2BGR
        )
        ok, encoded = cv2.imencode(".png", derained_bgr)
        if not ok:
            raise RuntimeError("Yağmur giderme çıktısı görsel olarak kodlanamadı.")

        return UgsmDerainResult(
            image_bytes=encoded.tobytes(),
            iterations=iterations,
            relative_change=relative_change,
        )

    def _ugsm(
        self, image: np.ndarray, options: UgsmOptions
    ) -> tuple[np.ndarray, int, float]:
        f = image.astype(np.float32, copy=False)
        height, width = f.shape

        s = np.zeros((height, width), dtype=np.float32)
        p1 = np.zeros_like(s)
        p2 = np.zeros_like(s)
        p3 = np.zeros_like(s)

        eigs_d1td1 = np.abs(np.fft.fft2(np.array([[1.0, -1.0]]), s=f.shape)) ** 2
        eigs_d2td2 = np.abs(np.fft.fft2(np.array([[1.0], [-1.0]]), s=f.shape)) ** 2
        denominator = (
            options.beta3 * eigs_d1td1
            + options.beta2 * np.ones((height, width), dtype=np.float32)
            + options.beta1 * eigs_d2td2
        )

        d2s = self._forward_d2(s)
        d1fs = self._forward_d1(f - s)
        d1f = self._forward_d1(f)

        relative_change = 1.0
        iteration = 0

        while (
            relative_change > options.tolerance and iteration < options.max_iterations
        ):
            v1 = d2s + p1 / options.beta1
            v2 = d1fs + p3 / options.beta3
            v3 = s + p2 / options.beta2

            x = self._soft_threshold(v1, 1.0 / options.beta1)
            z = self._soft_threshold(v2, options.lambda2 / options.beta3)
            y = self._soft_threshold(v3, options.lambda1 / options.beta2)

            previous_s = s
            temp1 = options.beta3 * d1f - options.beta3 * z + p3
            temp2 = options.beta2 * y - p2
            temp3 = options.beta1 * x - p1
            rhs = self._dive(temp1, temp3) + temp2

            s = np.real(np.fft.ifft2(np.fft.fft2(rhs) / denominator)).astype(np.float32)
            s = np.clip(s, 0.0, f)

            current_u = f - s
            previous_u = f - previous_s
            denominator_norm = max(
                float(np.linalg.norm(current_u, ord="fro")),
                np.finfo(np.float32).eps,
            )
            relative_change = float(
                np.linalg.norm(current_u - previous_u, ord="fro") / denominator_norm
            )
            iteration += 1

            d2s = self._forward_d2(s)
            d1fs = self._forward_d1(f - s)

            p1 = p1 + 1.618 * options.beta1 * (d2s - x)
            p2 = p2 + 1.618 * options.beta2 * (s - y)
            p3 = p3 + 1.618 * options.beta3 * (d1fs - z)

        return s, iteration, relative_change

    def _forward_d1(self, array: np.ndarray) -> np.ndarray:
        return np.roll(array, -1, axis=1) - array

    def _forward_d2(self, array: np.ndarray) -> np.ndarray:
        return np.roll(array, -1, axis=0) - array

    def _dive(self, x: np.ndarray, y: np.ndarray) -> np.ndarray:
        return np.roll(x, 1, axis=1) - x + np.roll(y, 1, axis=0) - y

    def _soft_threshold(self, array: np.ndarray, threshold: float) -> np.ndarray:
        return np.sign(array) * np.maximum(0.0, np.abs(array) - threshold)

    def _rgb_to_ycbcr(self, rgb: np.ndarray) -> np.ndarray:
        output = np.empty_like(rgb, dtype=np.float32)
        output[:, :, 0] = (
            16.0
            + 65.481 * rgb[:, :, 0]
            + 128.553 * rgb[:, :, 1]
            + 24.966 * rgb[:, :, 2]
        ) / 255.0
        output[:, :, 1] = (
            128.0 - 37.797 * rgb[:, :, 0] - 74.203 * rgb[:, :, 1] + 112.0 * rgb[:, :, 2]
        ) / 255.0
        output[:, :, 2] = (
            128.0 + 112.0 * rgb[:, :, 0] - 93.786 * rgb[:, :, 1] - 18.214 * rgb[:, :, 2]
        ) / 255.0
        return output

    def _ycbcr_to_rgb(self, ycbcr: np.ndarray) -> np.ndarray:
        y = ycbcr[:, :, 0] - 16.0 / 255.0
        cb = ycbcr[:, :, 1] - 128.0 / 255.0
        cr = ycbcr[:, :, 2] - 128.0 / 255.0

        output = np.empty_like(ycbcr, dtype=np.float32)
        output[:, :, 0] = 1.164383 * y + 1.596027 * cr
        output[:, :, 1] = 1.164383 * y - 0.391762 * cb - 0.812968 * cr
        output[:, :, 2] = 1.164383 * y + 2.017232 * cb
        return output
