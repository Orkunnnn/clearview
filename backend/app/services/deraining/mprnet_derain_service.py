from __future__ import annotations

import importlib.util
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class MPRNetUnavailableError(RuntimeError):
    pass


@dataclass(frozen=True)
class MPRNetDerainResult:
    image_bytes: bytes
    checkpoint: str
    elapsed_ms: float
    original_size: tuple[int, int]
    inference_size: tuple[int, int]


class MPRNetDerainService:
    def __init__(
        self,
        checkpoint_path: str | Path | None = None,
        repository_path: str | Path | None = None,
        max_inference_side: int | None = None,
    ) -> None:
        self._configured_checkpoint_path = (
            Path(checkpoint_path) if checkpoint_path else None
        )
        self._configured_repository_path = (
            Path(repository_path) if repository_path else None
        )
        self._max_inference_side = max_inference_side or int(
            os.getenv("NETGOR_MPRNET_MAX_SIDE", "1024")
        )
        self._model: Any | None = None
        self._device: Any | None = None
        self._checkpoint_path: Path | None = None

    def synthesize(self, image_bytes: bytes) -> MPRNetDerainResult:
        try:
            import cv2
            import numpy as np
            import torch
            import torch.nn.functional as functional
        except ImportError as exc:
            raise MPRNetUnavailableError(
                f"MPRNet bağımlılığı eksik: {exc.name}"
            ) from exc

        model = self._load_model()
        image_array = np.frombuffer(image_bytes, dtype=np.uint8)
        rainy_bgr = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
        if rainy_bgr is None:
            raise ValueError("Görsel okunamadı.")

        start = time.perf_counter()
        original_height, original_width = rainy_bgr.shape[:2]
        inference_bgr = _resize_for_inference(rainy_bgr, self._max_inference_side, cv2)
        inference_height, inference_width = inference_bgr.shape[:2]
        rainy_rgb = cv2.cvtColor(inference_bgr, cv2.COLOR_BGR2RGB).astype(np.float32)
        tensor = (
            torch.from_numpy(
                np.ascontiguousarray((rainy_rgb / 255.0).transpose(2, 0, 1))
            )
            .unsqueeze(0)
            .to(self._device)
        )
        padded, padded_size = _pad_to_multiple(tensor, 8, functional)

        with torch.inference_mode():
            output = model(padded)[0].clamp(0.0, 1.0)

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
            raise RuntimeError("MPRNet çıktısı görsel olarak kodlanamadı.")
        if self._checkpoint_path is None:
            raise MPRNetUnavailableError("MPRNet model ağırlıkları yüklenemedi.")

        return MPRNetDerainResult(
            image_bytes=encoded.tobytes(),
            checkpoint=str(self._checkpoint_path),
            elapsed_ms=(time.perf_counter() - start) * 1000,
            original_size=(original_width, original_height),
            inference_size=padded_size,
        )

    def _load_model(self) -> Any:
        if self._model is not None:
            return self._model

        try:
            import torch
        except ImportError as exc:
            raise MPRNetUnavailableError(
                f"MPRNet bağımlılığı eksik: {exc.name}"
            ) from exc

        checkpoint_path = self._resolve_checkpoint_path()
        model_class = _load_model_class(self._resolve_repository_path())
        self._device = _select_device(torch)
        model = model_class().to(self._device)
        checkpoint = _torch_load(torch, checkpoint_path, self._device)
        model.load_state_dict(checkpoint.get("state_dict", checkpoint))
        model.eval()
        self._model = model
        self._checkpoint_path = checkpoint_path
        return model

    def _resolve_repository_path(self) -> Path:
        candidates = [
            self._configured_repository_path,
            _path_from_env("NETGOR_MPRNET_REPOSITORY"),
            Path("/opt/mprnet/Deraining"),
            Path("/Users/orkun/Desktop/bitirme/code/MPRNet/Deraining"),
        ]
        for candidate in candidates:
            if candidate and (candidate / "MPRNet.py").is_file():
                return candidate
        checked = ", ".join(str(candidate) for candidate in candidates if candidate)
        raise MPRNetUnavailableError(
            f"MPRNet depo yolu bulunamadı. Kontrol edilen yollar: {checked}"
        )

    def _resolve_checkpoint_path(self) -> Path:
        backend_root = Path(__file__).resolve().parents[3]
        candidates = [
            self._configured_checkpoint_path,
            _path_from_env("NETGOR_MPRNET_CHECKPOINT"),
            backend_root / "models" / "mprnet" / "model_deraining.pth",
            Path("/app/models/mprnet/model_deraining.pth"),
            Path(
                "/Users/orkun/Desktop/bitirme/code/MPRNet/Deraining/"
                "pretrained_models/model_deraining.pth"
            ),
        ]
        for candidate in candidates:
            if candidate and candidate.is_file():
                return candidate
        checked = ", ".join(str(candidate) for candidate in candidates if candidate)
        raise MPRNetUnavailableError(
            f"MPRNet model ağırlıkları bulunamadı. Kontrol edilen yollar: {checked}"
        )


def _load_model_class(repository_path: Path) -> Any:
    module_name = "_netgor_mprnet"
    if module_name not in sys.modules:
        model_path = repository_path / "MPRNet.py"
        spec = importlib.util.spec_from_file_location(module_name, model_path)
        if spec is None or spec.loader is None:
            raise MPRNetUnavailableError("MPRNet modeli içe aktarılamadı.")
        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        spec.loader.exec_module(module)
    return sys.modules[module_name].MPRNet


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
