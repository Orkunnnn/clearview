from __future__ import annotations

from dataclasses import dataclass
from functools import cached_property
from pathlib import Path

import cv2
import numpy as np
from scipy.io import loadmat
from scipy.signal import convolve2d

FADE_MODEL_DIR = Path(__file__).resolve().parents[2] / "models" / "fade"
PATCH_SIZE = 8


@dataclass(frozen=True)
class FadeModel:
    mu: np.ndarray
    covariance: np.ndarray


class FadeMetric:
    """Python port of LIVE FADE 1.0.

    Original source: L. K. Choi, J. You, and A. C. Bovik, "FADE Software
    Release", Laboratory for Image and Video Engineering, UT Austin, 2015.
    The bundled parameter files come from FADE_release.zip.

    Copyright (c) 2015 The University of Texas at Austin. Permission is granted
    to use, copy, modify, and distribute the original code and documentation for
    any purpose provided the copyright notice appears in copies and LIVE/UT
    Austin is acknowledged in publications that report research using the code.
    """

    def __init__(self, model_dir: Path = FADE_MODEL_DIR) -> None:
        self._model_dir = model_dir

    def calculate(self, rgb: np.ndarray) -> float | None:
        if rgb.ndim != 3 or rgb.shape[2] < 3:
            return None

        cropped = self._crop_to_patch_grid(rgb[:, :, :3])
        if cropped is None:
            return None

        features = self._extract_features(cropped)
        if features.size == 0:
            return None

        fogfree_distance, _ = self._distance(features, self.fogfree_model)
        foggy_distance, _ = self._distance(features, self.foggy_model)
        if not np.isfinite(fogfree_distance) or not np.isfinite(foggy_distance):
            return None

        return float(fogfree_distance / (foggy_distance + 1.0))

    @cached_property
    def fogfree_model(self) -> FadeModel:
        mat = loadmat(self._model_dir / "natural_fogfree_image_features_ps8.mat")
        return FadeModel(
            mu=np.asarray(mat["mu_fogfreeparam"], dtype=np.float64).reshape(-1),
            covariance=np.asarray(mat["cov_fogfreeparam"], dtype=np.float64),
        )

    @cached_property
    def foggy_model(self) -> FadeModel:
        mat = loadmat(self._model_dir / "natural_foggy_image_features_ps8.mat")
        return FadeModel(
            mu=np.asarray(mat["mu_foggyparam"], dtype=np.float64).reshape(-1),
            covariance=np.asarray(mat["cov_foggyparam"], dtype=np.float64),
        )

    def _crop_to_patch_grid(self, rgb: np.ndarray) -> np.ndarray | None:
        patch_rows = rgb.shape[0] // PATCH_SIZE
        patch_cols = rgb.shape[1] // PATCH_SIZE
        if patch_rows == 0 or patch_cols == 0:
            return None
        return np.ascontiguousarray(
            rgb[: patch_rows * PATCH_SIZE, : patch_cols * PATCH_SIZE, :3],
        )

    def _extract_features(self, rgb_uint8: np.ndarray) -> np.ndarray:
        rgb = rgb_uint8.astype(np.float64)
        height, width = rgb.shape[:2]

        red = rgb[:, :, 0]
        green = rgb[:, :, 1]
        blue = rgb[:, :, 2]
        gray = cv2.cvtColor(rgb_uint8, cv2.COLOR_RGB2GRAY).astype(np.float64)

        dark_channel = np.min(rgb / 255.0, axis=2)
        saturation = cv2.cvtColor(
            (rgb / 255.0).astype(np.float32),
            cv2.COLOR_RGB2HSV,
        )[:, :, 1].astype(np.float64)

        gaussian_window = self._matlab_gaussian_kernel(7, 7 / 6)
        mean = cv2.filter2D(
            gray,
            ddepth=-1,
            kernel=gaussian_window,
            borderType=cv2.BORDER_REPLICATE,
        )
        variance = (
            cv2.filter2D(
                gray * gray,
                ddepth=-1,
                kernel=gaussian_window,
                borderType=cv2.BORDER_REPLICATE,
            )
            - mean * mean
        )
        sigma = np.sqrt(np.abs(variance))
        mscn = (gray - mean) / (sigma + 1.0)
        coefficient_variance = np.divide(
            sigma,
            mean,
            out=np.full_like(sigma, np.nan, dtype=np.float64),
            where=mean != 0,
        )

        red_green = red - green
        blue_yellow = 0.5 * (red + green) - blue

        mscn_patches = self._patches(mscn)
        mscn_vertical_pairs = self._patches(mscn * np.roll(mscn, shift=1, axis=0))
        mscn_vertical_left = mscn_vertical_pairs.copy()
        mscn_vertical_left[mscn_vertical_left > 0] = np.nan
        mscn_vertical_right = mscn_vertical_pairs.copy()
        mscn_vertical_right[mscn_vertical_right < 0] = np.nan

        ce_gray, ce_by, ce_rg = self._contrast_energy(rgb)

        with np.errstate(invalid="ignore", divide="ignore"):
            features = np.column_stack(
                [
                    self._matlab_nanvar(mscn_patches, axis=1),
                    self._matlab_nanvar(mscn_vertical_right, axis=1),
                    self._matlab_nanvar(mscn_vertical_left, axis=1),
                    np.mean(self._patches(sigma), axis=1),
                    np.mean(self._patches(coefficient_variance), axis=1),
                    np.mean(self._patches(ce_gray), axis=1),
                    np.mean(self._patches(ce_by), axis=1),
                    np.mean(self._patches(ce_rg), axis=1),
                    self._patch_entropy(self._patches(gray.astype(np.uint8))),
                    np.mean(self._patches(dark_channel), axis=1),
                    np.mean(self._patches(saturation), axis=1),
                    self._colorfulness(
                        self._patches(red_green),
                        self._patches(blue_yellow),
                    ),
                ]
            )
            features = np.log1p(features)

        return features.reshape((height // PATCH_SIZE) * (width // PATCH_SIZE), 12)

    def _contrast_energy(
        self, rgb: np.ndarray
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        sigma = 3.25
        semisaturation = 0.1
        thresholds = (
            9.225496406318721e-004 * 255,
            8.969246659629488e-004 * 255,
            2.069284034165411e-004 * 255,
        )

        red = rgb[:, :, 0]
        green = rgb[:, :, 1]
        blue = rgb[:, :, 2]
        channels = (
            0.299 * red + 0.587 * green + 0.114 * blue,
            0.5 * red + 0.5 * green - blue,
            red - green,
        )

        break_off_sigma = 3
        filtersize = break_off_sigma * sigma
        x = np.arange(-filtersize, filtersize + np.finfo(np.float64).eps, 1.0)
        gaussian = (
            1 / (np.sqrt(2 * np.pi) * sigma) * np.exp((x * x) / (-2 * sigma * sigma))
        )
        gaussian = gaussian / np.sum(gaussian)
        log_kernel = (x * x / sigma**4 - 1 / sigma**2) * gaussian
        log_kernel = log_kernel - np.sum(log_kernel) / x.size
        log_kernel = log_kernel / np.sum(0.5 * x * x * log_kernel)

        energies = []
        for channel, threshold in zip(channels, thresholds, strict=True):
            padded = np.pad(channel, ((10, 10), (10, 10)), mode="edge")
            cx = convolve2d(
                padded,
                log_kernel[np.newaxis, :],
                mode="same",
                boundary="fill",
                fillvalue=0,
            )
            cy = convolve2d(
                padded,
                log_kernel[:, np.newaxis],
                mode="same",
                boundary="fill",
                fillvalue=0,
            )
            contrast = np.sqrt(cx * cx + cy * cy)[10:-10, 10:-10]
            max_contrast = float(np.max(contrast))
            if max_contrast == 0:
                energies.append(np.zeros_like(contrast))
                continue
            response = (contrast * max_contrast) / (
                contrast + max_contrast * semisaturation
            )
            energy = np.maximum(response - threshold, 0)
            energies.append(energy)

        return energies[0], energies[1], energies[2]

    def _distance(
        self, features: np.ndarray, model: FadeModel
    ) -> tuple[float, np.ndarray]:
        feature_size = features.shape[1]
        patch_variance = self._matlab_nanvar(features, axis=1)
        distances = np.full(features.shape[0], np.nan, dtype=np.float64)

        for index, (feature, variance) in enumerate(
            zip(features, patch_variance, strict=True)
        ):
            if not np.isfinite(variance) or not np.all(np.isfinite(feature)):
                continue

            delta = model.mu - feature
            covariance = (model.covariance + variance) / 2.0
            if covariance.shape != (feature_size, feature_size):
                continue

            try:
                solved = np.linalg.solve(covariance, delta)
            except np.linalg.LinAlgError:
                solved = np.linalg.pinv(covariance) @ delta
            distance = float(delta @ solved)
            if distance >= 0 and np.isfinite(distance):
                distances[index] = np.sqrt(distance)

        return float(np.nanmean(distances)), distances

    def _patches(self, image: np.ndarray) -> np.ndarray:
        height, width = image.shape[:2]
        patch_rows = height // PATCH_SIZE
        patch_cols = width // PATCH_SIZE
        return (
            image[: patch_rows * PATCH_SIZE, : patch_cols * PATCH_SIZE]
            .reshape(patch_rows, PATCH_SIZE, patch_cols, PATCH_SIZE)
            .transpose(0, 2, 1, 3)
            .reshape(patch_rows * patch_cols, PATCH_SIZE * PATCH_SIZE)
        )

    def _patch_entropy(self, patches: np.ndarray) -> np.ndarray:
        entropy_values = np.empty(patches.shape[0], dtype=np.float64)
        for index, patch in enumerate(patches):
            counts = np.bincount(patch.ravel(), minlength=256).astype(np.float64)
            probabilities = counts[counts > 0] / np.sum(counts)
            entropy_values[index] = -np.sum(probabilities * np.log2(probabilities))
        return entropy_values

    def _colorfulness(
        self, red_green: np.ndarray, blue_yellow: np.ndarray
    ) -> np.ndarray:
        return np.sqrt(
            np.std(red_green, axis=1, ddof=1) ** 2
            + np.std(blue_yellow, axis=1, ddof=1) ** 2
        ) + 0.3 * np.sqrt(
            np.mean(red_green, axis=1) ** 2 + np.mean(blue_yellow, axis=1) ** 2
        )

    def _matlab_gaussian_kernel(self, size: int, sigma: float) -> np.ndarray:
        radius = (size - 1) / 2
        axis = np.arange(-radius, radius + 1)
        xx, yy = np.meshgrid(axis, axis)
        kernel = np.exp(-(xx * xx + yy * yy) / (2 * sigma * sigma))
        return (kernel / np.sum(kernel)).astype(np.float64)

    def _matlab_nanvar(self, values: np.ndarray, axis: int) -> np.ndarray:
        valid = np.isfinite(values)
        count = np.sum(valid, axis=axis)
        count_for_mean = np.sum(valid, axis=axis, keepdims=True)
        with np.errstate(invalid="ignore", divide="ignore"):
            mean = np.divide(
                np.where(valid, values, 0.0).sum(axis=axis, keepdims=True),
                count_for_mean,
                out=np.full_like(count_for_mean, np.nan, dtype=np.float64),
                where=count_for_mean != 0,
            )
            squared_error = np.where(valid, (values - mean) ** 2, 0.0)
            variance = np.sum(squared_error, axis=axis) / np.maximum(count - 1, 1)
        return np.where(count == 0, np.nan, variance)
