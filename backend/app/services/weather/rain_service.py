from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass
from io import BytesIO

import numpy as np
from PIL import Image, ImageFilter

AIRLIGHT = np.array([0.88, 0.90, 0.95], dtype=np.float32)


@dataclass(frozen=True)
class RainConfig:
    rain_rate_mm_h: float
    exposure_ms: float
    slant_deg: float
    fov_deg: float
    near_m: float
    far_m: float
    depth_bins: int
    radius_bins: int
    min_radius_mm: float
    max_radius_mm: float
    streak_gain: float
    accumulation_gain: float
    max_streaks: int
    streaks_per_megapixel: float


class RainService:
    def synthesize(self, image_bytes: bytes, intensity: float) -> bytes:
        image = self._load_image(image_bytes)
        config = self._build_config(intensity)
        seed = int.from_bytes(
            hashlib.sha256(image_bytes + f"{intensity:.2f}".encode()).digest()[:8],
            "big",
        )
        rng = np.random.default_rng(seed)
        rainy = self._apply_rain(image, config, rng)
        return self._save_image(rainy)

    def _build_config(self, intensity: float) -> RainConfig:
        return RainConfig(
            rain_rate_mm_h=2.0 + (float(intensity) / 100.0) * 28.0,
            exposure_ms=6.0 + (float(intensity) / 100.0) * 10.0,
            slant_deg=-8.0,
            fov_deg=50.0,
            near_m=2.0,
            far_m=30.0,
            depth_bins=12,
            radius_bins=18,
            min_radius_mm=0.15,
            max_radius_mm=1.25,
            streak_gain=1.0 + (float(intensity) / 100.0) * 1.2,
            accumulation_gain=0.8 + (float(intensity) / 100.0) * 0.8,
            max_streaks=2200,
            streaks_per_megapixel=2800.0,
        )

    def _load_image(self, image_bytes: bytes) -> np.ndarray:
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
        return np.asarray(image, dtype=np.float32) / 255.0

    def _save_image(self, image: np.ndarray) -> bytes:
        buffer = BytesIO()
        Image.fromarray(np.uint8(np.clip(image, 0.0, 1.0) * 255.0), mode="RGB").save(
            buffer, format="PNG"
        )
        return buffer.getvalue()

    def _rgb_to_luma(self, image: np.ndarray) -> np.ndarray:
        return np.clip(
            0.2126 * image[..., 0] + 0.7152 * image[..., 1] + 0.0722 * image[..., 2],
            0.0,
            1.0,
        ).astype(np.float32)

    def _normalize01(self, array: np.ndarray) -> np.ndarray:
        min_value = float(array.min())
        max_value = float(array.max())
        if max_value - min_value < 1e-6:
            return np.zeros_like(array, dtype=np.float32)
        return (array - min_value) / (max_value - min_value)

    def _gaussian_blur_gray(self, array: np.ndarray, radius: float) -> np.ndarray:
        if radius <= 0.0:
            return array.astype(np.float32, copy=True)
        image = Image.fromarray(np.uint8(np.clip(array, 0.0, 1.0) * 255.0), mode="L")
        blurred = image.filter(ImageFilter.GaussianBlur(radius=radius))
        return np.asarray(blurred, dtype=np.float32) / 255.0

    def _marshal_palmer_density(self, radius_m: float, rain_rate_mm_h: float) -> float:
        return 8.0e6 * math.exp(-8200.0 * (rain_rate_mm_h**-0.21) * radius_m)

    def _terminal_velocity(self, radius_m: float) -> float:
        return max(0.8, 200.0 * math.sqrt(max(radius_m, 1e-7)))

    def _render_streak(
        self,
        layer: np.ndarray,
        center_x: float,
        center_y: float,
        length_px: float,
        width_px: float,
        angle_rad: float,
        intensity: float,
        rng: np.random.Generator,
    ) -> None:
        if length_px <= 0.75 or width_px <= 0.2 or intensity <= 0.0:
            return

        half_len = 0.5 * length_px
        sigma = max(0.45, 0.38 * width_px)
        pad = int(math.ceil(half_len + 3.0 * sigma + 2.0))

        x0 = max(0, int(math.floor(center_x - pad)))
        x1 = min(layer.shape[1], int(math.ceil(center_x + pad + 1.0)))
        y0 = max(0, int(math.floor(center_y - pad)))
        y1 = min(layer.shape[0], int(math.ceil(center_y + pad + 1.0)))
        if x0 >= x1 or y0 >= y1:
            return

        xs = np.arange(x0, x1, dtype=np.float32) + 0.5
        ys = np.arange(y0, y1, dtype=np.float32) + 0.5
        grid_x, grid_y = np.meshgrid(xs, ys)

        dx = grid_x - center_x
        dy = grid_y - center_y

        ux = math.cos(angle_rad)
        uy = math.sin(angle_rad)
        vx = -uy
        vy = ux

        longitudinal = dx * ux + dy * uy
        cross = dx * vx + dy * vy

        phase_1 = float(rng.uniform(0.0, 2.0 * math.pi))
        phase_2 = float(rng.uniform(0.0, 2.0 * math.pi))
        freq_1 = float(rng.uniform(2.2, 4.8))
        freq_2 = float(rng.uniform(5.0, 8.0))

        support = np.abs(longitudinal) <= (half_len + 2.5 * sigma)
        if not np.any(support):
            return

        t = longitudinal / max(half_len, 1e-5)
        body = np.exp(-0.5 * (cross / sigma) ** 2)
        taper = np.clip(1.0 - np.abs(t) ** 1.7, 0.0, 1.0) ** 0.35
        ripple = (
            0.9
            + 0.15 * np.sin((t + 1.0) * math.pi * freq_1 + phase_1)
            + 0.08 * np.sin((t + 1.0) * math.pi * freq_2 + phase_2)
        )
        streak = np.clip(body * taper * ripple, 0.0, None) * support
        layer[y0:y1, x0:x1] += (intensity * streak).astype(np.float32)

    def _build_streak_layer(
        self,
        image: np.ndarray,
        config: RainConfig,
        rng: np.random.Generator,
    ) -> tuple[np.ndarray, float]:
        height, width = image.shape[:2]
        megapixels = (height * width) / 1_000_000.0
        effective_max_streaks = max(
            config.max_streaks, int(config.streaks_per_megapixel * megapixels)
        )
        focal_px = width / (2.0 * math.tan(0.5 * math.radians(config.fov_deg)))
        exposure_s = config.exposure_ms / 1000.0
        angle_rad = 0.5 * math.pi + math.radians(config.slant_deg)

        depth_edges = np.linspace(
            config.near_m, config.far_m, config.depth_bins + 1, dtype=np.float32
        )
        radius_edges = (
            np.linspace(
                config.min_radius_mm,
                config.max_radius_mm,
                config.radius_bins + 1,
                dtype=np.float32,
            )
            * 1e-3
        )

        layer = np.zeros((height, width), dtype=np.float32)
        unresolved_energy = 0.0
        rendered = 0

        for depth_index in range(config.depth_bins):
            z0 = float(depth_edges[depth_index])
            z1 = float(depth_edges[depth_index + 1])
            z = 0.5 * (z0 + z1)
            dz = z1 - z0
            frustum_width = 2.0 * z * math.tan(0.5 * math.radians(config.fov_deg))
            frustum_height = frustum_width * height / width
            volume = frustum_width * frustum_height * dz
            depth_weight = 1.08 - 0.5 * (
                (z - config.near_m) / (config.far_m - config.near_m)
            )

            for radius_index in range(config.radius_bins):
                if rendered >= effective_max_streaks:
                    break

                r0 = float(radius_edges[radius_index])
                r1 = float(radius_edges[radius_index + 1])
                radius_m = 0.5 * (r0 + r1)
                dr = r1 - r0

                expected_count = (
                    self._marshal_palmer_density(radius_m, config.rain_rate_mm_h)
                    * dr
                    * volume
                )
                if expected_count < 0.01:
                    continue

                velocity_m_s = self._terminal_velocity(radius_m)
                length_px = focal_px * velocity_m_s * exposure_s / z
                width_px = focal_px * (2.0 * radius_m) / z

                if width_px < 0.4 or length_px < 1.0:
                    unresolved_energy += (
                        expected_count * max(length_px, 0.25) * max(width_px, 0.1)
                    )
                    continue

                draw_count = int(rng.poisson(expected_count))
                if draw_count <= 0:
                    continue

                remaining = effective_max_streaks - rendered
                if draw_count > remaining:
                    unresolved_energy += (draw_count - remaining) * length_px * width_px
                    draw_count = remaining

                radius_weight = 0.9 + 0.35 * (
                    (radius_m - config.min_radius_mm * 1e-3)
                    / ((config.max_radius_mm - config.min_radius_mm) * 1e-3)
                )
                base_intensity = (
                    0.14
                    * config.streak_gain
                    * radius_weight
                    * depth_weight
                    * (0.85 + 0.25 * math.sqrt(config.rain_rate_mm_h / 12.0))
                )

                for _ in range(draw_count):
                    center_x = float(rng.uniform(0.0, width))
                    center_y = float(rng.uniform(0.0, height))
                    jittered_length = float(length_px * rng.uniform(0.8, 1.3))
                    jittered_width = float(max(0.6, width_px * rng.uniform(0.8, 1.4)))
                    jittered_angle = float(
                        angle_rad + math.radians(rng.normal(0.0, 1.25))
                    )
                    intensity = float(base_intensity * rng.uniform(0.85, 1.25))

                    self._render_streak(
                        layer=layer,
                        center_x=center_x,
                        center_y=center_y,
                        length_px=jittered_length,
                        width_px=jittered_width,
                        angle_rad=jittered_angle,
                        intensity=intensity,
                        rng=rng,
                    )
                    rendered += 1
                    if rendered >= effective_max_streaks:
                        break

        luma = self._rgb_to_luma(image)
        coarse_luma = self._gaussian_blur_gray(
            luma, radius=max(2.0, min(height, width) / 220.0)
        )
        detail = np.abs(
            luma
            - self._gaussian_blur_gray(
                luma, radius=max(1.0, min(height, width) / 340.0)
            )
        )
        detail = self._normalize01(detail)
        visibility = 0.55 + 0.45 * (
            1.0 - np.power(np.clip(coarse_luma, 0.0, 1.0), 0.75)
        )
        texture_suppression = 0.92 + 0.08 * (1.0 - detail)

        layer *= visibility * texture_suppression
        layer = self._gaussian_blur_gray(np.clip(layer, 0.0, 1.0), radius=0.55)
        return np.clip(layer, 0.0, 1.0), unresolved_energy

    def _build_accumulation_veil(
        self,
        image: np.ndarray,
        config: RainConfig,
        unresolved_energy: float,
        rng: np.random.Generator,
    ) -> np.ndarray:
        height, width = image.shape[:2]
        luma = self._rgb_to_luma(image)
        smoothed = self._gaussian_blur_gray(
            luma, radius=max(6.0, min(height, width) / 40.0)
        )
        detail = np.abs(
            luma
            - self._gaussian_blur_gray(
                luma, radius=max(2.0, min(height, width) / 160.0)
            )
        )
        detail = self._normalize01(detail)

        y_gradient = np.linspace(0.0, 1.0, height, dtype=np.float32)[:, None]
        depth_proxy = np.clip(0.45 * y_gradient + 0.55 * (1.0 - detail), 0.0, 1.0)

        noise = rng.normal(0.0, 1.0, size=(height, width)).astype(np.float32)
        noise = self._gaussian_blur_gray(
            self._normalize01(noise), radius=max(8.0, min(height, width) / 55.0)
        )
        streaky_noise = self._gaussian_blur_gray(
            noise, radius=max(3.0, min(height, width) / 120.0)
        )

        base_beta = 0.032 * (config.rain_rate_mm_h / 25.0) * config.accumulation_gain
        unresolved_term = min(0.22, unresolved_energy / max(height * width, 1) * 0.02)
        veil = base_beta * (0.35 + 0.65 * depth_proxy) + unresolved_term * (
            0.2 + 0.8 * depth_proxy
        )
        veil *= 0.8 + 0.2 * streaky_noise
        veil *= 0.9 + 0.1 * (1.0 - smoothed)
        return np.clip(veil[..., None], 0.0, 0.3).astype(np.float32)

    def _apply_rain(
        self,
        image: np.ndarray,
        config: RainConfig,
        rng: np.random.Generator,
    ) -> np.ndarray:
        streak_layer, unresolved_energy = self._build_streak_layer(image, config, rng)
        veil = self._build_accumulation_veil(image, config, unresolved_energy, rng)
        rainy = image * (1.0 - veil) + AIRLIGHT[None, None, :] * veil
        streak_rgb = streak_layer[..., None] * np.array(
            [0.92, 0.95, 1.0], dtype=np.float32
        )
        return np.clip(rainy + streak_rgb, 0.0, 1.0)
