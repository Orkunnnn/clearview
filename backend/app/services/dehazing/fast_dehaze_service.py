from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np
from skimage import morphology


@dataclass(frozen=True)
class DehazeResult:
    image_bytes: bytes
    transmission_mean: float


class FastDehazeService:
    def synthesize(self, image_bytes: bytes) -> DehazeResult:
        image_array = np.frombuffer(image_bytes, dtype=np.uint8)
        hazy_bgr = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
        if hazy_bgr is None:
            raise ValueError("Görsel okunamadı.")

        dehazed, transmission = self.dehaze_bgr(hazy_bgr)
        ok, encoded = cv2.imencode(".png", dehazed)
        if not ok:
            raise RuntimeError("Sis giderme çıktısı görsel olarak kodlanamadı.")

        return DehazeResult(
            image_bytes=encoded.tobytes(),
            transmission_mean=float(np.mean(transmission)),
        )

    def dehaze_bgr(self, hazy_bgr: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        hazy_image = self._i2f(hazy_bgr)
        atmospheric_light = self._compute_atmospheric_light(hazy_image)
        atmospheric_span = float(np.max(atmospheric_light) - np.min(atmospheric_light))

        hazy_image_wb = self._gray_world(hazy_image)
        atmospheric_light_wb = self._compute_atmospheric_light(hazy_image_wb)
        atmospheric_span_wb = float(
            np.max(atmospheric_light_wb) - np.min(atmospheric_light_wb)
        )

        epsilon = 0.02
        if atmospheric_span < atmospheric_span_wb + epsilon:
            recovered, transmission = self._recover_normal_phase(
                hazy_image,
                atmospheric_light,
            )
        else:
            recovered, transmission = self._recover_white_balance_phase(
                hazy_image,
                atmospheric_light_wb,
            )

        enhanced = self._clahe(recovered, clip=1.0)
        return self._f2i(enhanced), transmission

    def _recover_normal_phase(
        self,
        hazy_image: np.ndarray,
        atmospheric_light: np.ndarray,
    ) -> tuple[np.ndarray, np.ndarray]:
        normalized = self._normalize_by_atmospheric_light(
            hazy_image,
            atmospheric_light,
        )
        intensity = self._get_intensity(normalized)
        saturation = self._get_saturation(normalized, intensity)
        estimated_saturation = self._estimate_saturation_gamma(saturation, 0.2)
        transmission = self._estimate_transmission(
            intensity,
            saturation,
            estimated_saturation,
        )
        recovered = self._recover(hazy_image, transmission, atmospheric_light)
        return self._adjust(recovered, perh=99.9, perl=0.5), transmission

    def _recover_white_balance_phase(
        self,
        hazy_image: np.ndarray,
        atmospheric_light: np.ndarray,
    ) -> tuple[np.ndarray, np.ndarray]:
        normalized = self._normalize_by_atmospheric_light(
            hazy_image,
            atmospheric_light,
        )
        intensity = self._get_intensity(normalized)
        saturation = self._get_saturation(normalized, intensity)
        estimated_saturation = self._estimate_saturation_gamma(saturation, 0.2)
        transmission = self._estimate_transmission(
            intensity,
            saturation,
            estimated_saturation,
        )
        recovered = self._recover(hazy_image, transmission, atmospheric_light)
        recovered = self._adjust(recovered, perh=99.9, perl=0.5)
        return self._gray_world(recovered), transmission

    def _normalize_by_atmospheric_light(
        self,
        image: np.ndarray,
        atmospheric_light: np.ndarray,
    ) -> np.ndarray:
        normalized = np.empty(image.shape, image.dtype)
        eps = np.finfo(np.float32).eps
        for channel in range(3):
            normalized[:, :, channel] = image[:, :, channel] / max(
                atmospheric_light[0, channel],
                eps,
            )
        return self._normalize(normalized)

    def _i2f(self, image: np.ndarray) -> np.ndarray:
        return np.float32(image) / 255.0

    def _f2i(self, image: np.ndarray) -> np.ndarray:
        return np.uint8(np.clip(image, 0.0, 1.0) * 255.0)

    def _square_footprint(self, size: int) -> np.ndarray:
        if hasattr(morphology, "footprint_rectangle"):
            return morphology.footprint_rectangle((size, size))
        return morphology.square(size)

    def _compute_atmospheric_light(self, image: np.ndarray) -> np.ndarray:
        erosion_window = 15
        n_bins = 200

        red = image[:, :, 2]
        green = image[:, :, 1]
        blue = image[:, :, 0]

        dark = morphology.erosion(
            np.min(image, axis=2),
            self._square_footprint(erosion_window),
        )

        hist, edges = np.histogram(dark, n_bins)
        threshold = image.shape[0] * image.shape[1] * 0.99
        cumulative_sum = np.cumsum(hist)
        threshold_indices = np.nonzero(cumulative_sum > threshold)[0]

        if threshold_indices.size == 0:
            mask = dark >= np.max(dark)
        else:
            mask = dark >= edges[threshold_indices[0]]

        reds = red[mask]
        greens = green[mask]
        blues = blue[mask]

        if reds.size == 0 or greens.size == 0 or blues.size == 0:
            return np.median(image.reshape(-1, 3), axis=0, keepdims=True)

        atmospheric_light = np.zeros((1, 3), dtype=image.dtype)
        atmospheric_light[0, 2] = np.median(reds)
        atmospheric_light[0, 1] = np.median(greens)
        atmospheric_light[0, 0] = np.median(blues)
        return atmospheric_light

    def _get_intensity(self, image: np.ndarray) -> np.ndarray:
        return cv2.divide(image[:, :, 0] + image[:, :, 1] + image[:, :, 2], 3)

    def _get_saturation(self, image: np.ndarray, intensity: np.ndarray) -> np.ndarray:
        min_rgb = cv2.min(cv2.min(image[:, :, 0], image[:, :, 1]), image[:, :, 2])
        eps = np.finfo(np.float32).eps
        return 1.0 - min_rgb / (intensity + eps)

    def _estimate_saturation_gamma(
        self,
        saturation: np.ndarray,
        gamma: float,
    ) -> np.ndarray:
        estimated = (
            np.power(saturation, 1.0 / gamma)
            + 1.0
            - np.power(1.0 - saturation, 1.0 / gamma)
        ) / 2.0
        return np.maximum(estimated, saturation)

    def _estimate_transmission(
        self,
        intensity: np.ndarray,
        saturation: np.ndarray,
        estimated_saturation: np.ndarray,
    ) -> np.ndarray:
        td = intensity * (estimated_saturation - saturation)
        eps = np.finfo(np.float32).eps
        transmission = 1.0 - (td / np.maximum(estimated_saturation, eps))
        return np.clip(transmission, eps, 1.0)

    def _recover(
        self,
        image: np.ndarray,
        transmission: np.ndarray,
        atmospheric_light: np.ndarray,
    ) -> np.ndarray:
        recovered = np.empty(image.shape, image.dtype)
        for channel in range(3):
            recovered[:, :, channel] = (
                image[:, :, channel] - atmospheric_light[0, channel]
            ) / transmission + atmospheric_light[0, channel]
            recovered[:, :, channel] = np.clip(recovered[:, :, channel], 0.0, 1.0)
        return recovered

    def _adjust(self, image: np.ndarray, perh: float, perl: float) -> np.ndarray:
        adjusted = np.empty(image.shape, image.dtype)
        image_high = np.percentile(image, perh)
        image_low = np.percentile(image, perl)
        denominator = max(image_high - image_low, np.finfo(np.float32).eps)

        for channel in range(3):
            adjusted[:, :, channel] = (image[:, :, channel] - image_low) / denominator
            adjusted[:, :, channel] = np.clip(adjusted[:, :, channel], 0.0, 1.0)

        return adjusted

    def _normalize(self, image: np.ndarray) -> np.ndarray:
        normalized = np.empty(image.shape, image.dtype)

        for channel in range(3):
            image_high = np.max(image[:, :, channel])
            image_low = np.min(image[:, :, channel])
            denominator = max(image_high - image_low, np.finfo(np.float32).eps)
            normalized[:, :, channel] = (image[:, :, channel] - image_low) / denominator
            normalized[:, :, channel] = np.clip(
                normalized[:, :, channel],
                0.0,
                1.0,
            )

        return normalized

    def _gray_world(self, image: np.ndarray) -> np.ndarray:
        adjusted = np.empty(image.shape, image.dtype)
        eps = np.finfo(np.float32).eps

        mean_red = np.average(image[:, :, 2])
        mean_green = np.average(image[:, :, 1])
        mean_blue = np.average(image[:, :, 0])
        adjusted[:, :, 0] = np.minimum(
            image[:, :, 0] * (mean_green / max(mean_blue, eps)),
            1.0,
        )
        adjusted[:, :, 2] = np.minimum(
            image[:, :, 2] * (mean_green / max(mean_red, eps)),
            1.0,
        )
        adjusted[:, :, 1] = image[:, :, 1]
        return adjusted

    def _clahe(self, image: np.ndarray, clip: float) -> np.ndarray:
        hsv = cv2.cvtColor(self._f2i(image), cv2.COLOR_BGR2HSV)
        clahe = cv2.createCLAHE(clipLimit=clip, tileGridSize=(8, 8))
        hsv[:, :, 2] = clahe.apply(hsv[:, :, 2])
        return self._i2f(cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR))
