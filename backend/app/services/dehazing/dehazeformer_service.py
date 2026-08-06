from __future__ import annotations

import importlib.util
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class DehazeFormerUnavailableError(RuntimeError):
    pass


@dataclass(frozen=True)
class DehazeFormerResult:
    image_bytes: bytes
    checkpoint: str
    elapsed_ms: float
    original_size: tuple[int, int]
    inference_size: tuple[int, int]


class DehazeFormerService:
    def __init__(
        self,
        weights_path: str | Path | None = None,
        repository_path: str | Path | None = None,
        max_inference_side: int | None = None,
    ) -> None:
        self._configured_weights_path = Path(weights_path) if weights_path else None
        self._configured_repository_path = (
            Path(repository_path) if repository_path else None
        )
        self._max_inference_side = max_inference_side or int(
            os.getenv("NETGOR_DEHAZEFORMER_MAX_SIDE", "1024")
        )
        self._model: Any | None = None
        self._device: Any | None = None
        self._checkpoint_path: Path | None = None

    def synthesize(self, image_bytes: bytes) -> DehazeFormerResult:
        try:
            import cv2
            import numpy as np
            import torch
            import torch.nn.functional as functional
        except ImportError as exc:
            raise DehazeFormerUnavailableError(
                f"DehazeFormer bağımlılığı eksik: {exc.name}"
            ) from exc

        model = self._load_model()
        image_array = np.frombuffer(image_bytes, dtype=np.uint8)
        hazy_bgr = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
        if hazy_bgr is None:
            raise ValueError("Görsel okunamadı.")

        start = time.perf_counter()
        original_height, original_width = hazy_bgr.shape[:2]
        inference_bgr = _resize_for_inference(hazy_bgr, self._max_inference_side, cv2)
        inference_height, inference_width = inference_bgr.shape[:2]
        rgb = cv2.cvtColor(inference_bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        tensor = torch.from_numpy(
            np.ascontiguousarray(rgb.transpose(2, 0, 1))
        ).unsqueeze(0)
        tensor = tensor.mul(2).sub(1).to(self._device)
        padded, inference_size = _pad_to_multiple(tensor, 4, functional)

        with torch.inference_mode():
            output = model(padded).clamp(-1.0, 1.0).mul(0.5).add(0.5)

        output = output[:, :, :inference_height, :inference_width]
        output_rgb = (
            output.squeeze(0).detach().cpu().numpy().transpose(1, 2, 0) * 255.0
        ).round()
        output_bgr = cv2.cvtColor(
            np.clip(output_rgb, 0, 255).astype(np.uint8), cv2.COLOR_RGB2BGR
        )
        if (inference_width, inference_height) != (original_width, original_height):
            output_bgr = cv2.resize(
                output_bgr,
                (original_width, original_height),
                interpolation=cv2.INTER_CUBIC,
            )
        ok, encoded = cv2.imencode(".png", output_bgr)
        if not ok:
            raise RuntimeError("DehazeFormer çıktısı görsel olarak kodlanamadı.")
        if self._checkpoint_path is None:
            raise DehazeFormerUnavailableError(
                "DehazeFormer model ağırlıkları yüklenemedi."
            )

        return DehazeFormerResult(
            image_bytes=encoded.tobytes(),
            checkpoint=str(self._checkpoint_path),
            elapsed_ms=(time.perf_counter() - start) * 1000,
            original_size=(original_width, original_height),
            inference_size=inference_size,
        )

    def _load_model(self) -> Any:
        if self._model is not None:
            return self._model

        try:
            import torch
        except ImportError as exc:
            raise DehazeFormerUnavailableError(
                f"DehazeFormer bağımlılığı eksik: {exc.name}"
            ) from exc

        repository_path = self._resolve_repository_path()
        weights_path = self._resolve_weights_path()
        factory = _load_factory(
            repository_path, os.getenv("NETGOR_DEHAZEFORMER_MODEL", "dehazeformer-w")
        )
        self._device = _select_device(torch)
        model = factory().to(self._device)
        checkpoint = _torch_load(torch, weights_path, self._device)
        state_dict = checkpoint.get("state_dict", checkpoint)
        cleaned_state_dict = {
            key.removeprefix("module."): value for key, value in state_dict.items()
        }
        model.load_state_dict(cleaned_state_dict)
        model.eval()
        self._model = model
        self._checkpoint_path = weights_path
        return model

    def _resolve_repository_path(self) -> Path:
        candidates = [
            self._configured_repository_path,
            _path_from_env("NETGOR_DEHAZEFORMER_REPOSITORY"),
            Path("/opt/dehazeformer"),
            Path("/Users/orkun/Desktop/bitirme/code/DehazeFormer"),
        ]
        for candidate in candidates:
            if candidate and (candidate / "models" / "__init__.py").is_file():
                return candidate
        checked = ", ".join(str(candidate) for candidate in candidates if candidate)
        raise DehazeFormerUnavailableError(
            f"DehazeFormer depo yolu bulunamadı. Kontrol edilen yollar: {checked}"
        )

    def _resolve_weights_path(self) -> Path:
        backend_root = Path(__file__).resolve().parents[3]
        candidates = [
            self._configured_weights_path,
            _path_from_env("NETGOR_DEHAZEFORMER_WEIGHTS_PATH"),
            backend_root / "models" / "dehazeformer" / "dehazeformer-w.pth",
            Path("/app/models/dehazeformer/dehazeformer-w.pth"),
            Path(
                "/Users/orkun/Desktop/bitirme/code/DehazeFormer/"
                "save_models/indoor/dehazeformer-w.pth"
            ),
        ]
        for candidate in candidates:
            if candidate and candidate.is_file():
                return candidate
        checked = ", ".join(str(candidate) for candidate in candidates if candidate)
        raise DehazeFormerUnavailableError(
            "DehazeFormer model ağırlıkları bulunamadı. "
            f"Kontrol edilen yollar: {checked}"
        )


def _load_factory(repository_path: Path, model_name: str) -> Any:
    package_name = "_netgor_dehazeformer_models"
    if package_name not in sys.modules:
        init_path = repository_path / "models" / "__init__.py"
        spec = importlib.util.spec_from_file_location(
            package_name,
            init_path,
            submodule_search_locations=[str(init_path.parent)],
        )
        if spec is None or spec.loader is None:
            raise DehazeFormerUnavailableError("DehazeFormer modeli içe aktarılamadı.")
        module = importlib.util.module_from_spec(spec)
        sys.modules[package_name] = module
        spec.loader.exec_module(module)

    model_module = sys.modules[package_name]
    factory = getattr(model_module, model_name.replace("-", "_"), None)
    if factory is None:
        raise DehazeFormerUnavailableError(
            f"Bilinmeyen DehazeFormer model yapılandırması: {model_name}"
        )
    return factory


def _pad_to_multiple(
    tensor: Any, multiple: int, functional: Any
) -> tuple[Any, tuple[int, int]]:
    height, width = tensor.shape[-2:]
    pad_height = (-height) % multiple
    pad_width = (-width) % multiple
    if not pad_height and not pad_width:
        return tensor, (width, height)
    mode = "reflect" if height > 1 and width > 1 else "replicate"
    padded = functional.pad(tensor, (0, pad_width, 0, pad_height), mode=mode)
    return padded, (width + pad_width, height + pad_height)


def _resize_for_inference(image_bgr: Any, max_side: int, cv2: Any) -> Any:
    height, width = image_bgr.shape[:2]
    longest_side = max(width, height)
    if longest_side <= max_side:
        return image_bgr
    scale = max_side / longest_side
    return cv2.resize(
        image_bgr,
        (max(1, round(width * scale)), max(1, round(height * scale))),
        interpolation=cv2.INTER_AREA,
    )


def _torch_load(torch: Any, path: Path, device: Any) -> Any:
    try:
        return torch.load(path, map_location=device, weights_only=True)
    except TypeError:
        return torch.load(path, map_location=device)


def _select_device(torch: Any) -> Any:
    if torch.cuda.is_available():
        return torch.device("cuda")
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def _path_from_env(name: str) -> Path | None:
    value = os.getenv(name)
    return Path(value) if value else None
