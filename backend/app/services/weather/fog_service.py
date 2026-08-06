from __future__ import annotations

import hashlib
import importlib
import importlib.util
import os
import sys
from dataclasses import dataclass
from pathlib import Path

from app.services.weather.depth_cache import DepthCache

DEFAULT_DEPTH_REPOS = (
    Path("/Users/orkun/Desktop/dev/Depth-Anything-V2"),
    Path("/opt/depth-anything-v2"),
)
DEFAULT_FOG_WEIGHT_PATHS = (
    Path("/Users/orkun/Desktop/dev/fog-maker/checkpoints/depth_anything_v2_vitl.pth"),
    Path("/opt/fog-maker/checkpoints/depth_anything_v2_vitl.pth"),
)


@dataclass(frozen=True)
class CapabilityStatus:
    available: bool
    reason: str | None = None


class FogService:
    def __init__(self) -> None:
        self._cache = DepthCache(max_items=12)
        self._model = None
        self._device: str | None = None

    def get_capability(self) -> CapabilityStatus:
        repo_path = self._depth_repo_path()
        weights_path = self._weights_path()

        if importlib.util.find_spec("cv2") is None:
            return CapabilityStatus(False, "opencv-python-headless yüklü değil.")
        if importlib.util.find_spec("torch") is None:
            return CapabilityStatus(False, "torch yüklü değil.")
        if repo_path is None:
            return CapabilityStatus(False, "Depth Anything V2 depo yolu bulunamadı.")
        if not repo_path.exists():
            return CapabilityStatus(
                False,
                (
                    f"Depth Anything V2 depo yolu bulunamadı: {repo_path}. "
                    "Sunucuyu Docker ile çalıştırıyorsanız depo klasörünü "
                    "kapsayıcıya bağladığınızdan emin olun."
                ),
            )
        if not weights_path.exists():
            return CapabilityStatus(
                False,
                (
                    f"Sis modeli ağırlık dosyası bulunamadı: {weights_path}. "
                    "Sunucuyu Docker ile çalıştırıyorsanız model ağırlıkları "
                    "klasörünü kapsayıcıya bağladığınızdan emin olun."
                ),
            )
        return CapabilityStatus(True)

    def synthesize(self, image_bytes: bytes, intensity: float) -> bytes:
        capability = self.get_capability()
        if not capability.available:
            raise RuntimeError(capability.reason or "Sis üretimi kullanılamıyor.")

        cv2 = importlib.import_module("cv2")
        np = importlib.import_module("numpy")

        image_array = np.frombuffer(image_bytes, dtype=np.uint8)
        image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError("Görsel okunamadı.")

        image_hash = hashlib.sha256(image_bytes).hexdigest()
        depth = self._cache.get(image_hash)
        if depth is None:
            model = self._load_model()
            depth = model.infer_image(image, 512)
            self._cache.set(image_hash, depth)

        beta = self._map_intensity_to_beta(intensity)
        foggy = self._add_fog(image=image, depth=depth, beta=beta, np=np)
        ok, encoded = cv2.imencode(".png", foggy)
        if not ok:
            raise RuntimeError("Sis çıktısı görsel olarak kodlanamadı.")
        return encoded.tobytes()

    def _map_intensity_to_beta(self, intensity: float) -> float:
        return 0.5 + (float(intensity) / 100.0) * 3.5

    def _depth_repo_path(self) -> Path | None:
        raw = os.getenv("NETGOR_DEPTH_ANYTHING_REPO")
        if raw:
            return Path(raw).expanduser()
        return self._first_existing_path(DEFAULT_DEPTH_REPOS)

    def _weights_path(self) -> Path:
        raw = os.getenv("NETGOR_FOG_WEIGHTS_PATH")
        if raw:
            return Path(raw).expanduser()
        return self._first_existing_path(DEFAULT_FOG_WEIGHT_PATHS)

    def _first_existing_path(self, candidates: tuple[Path, ...]) -> Path:
        for candidate in candidates:
            if candidate.exists():
                return candidate
        return candidates[0]

    def _load_model(self):
        if self._model is not None:
            return self._model

        torch = importlib.import_module("torch")
        repo_path = self._depth_repo_path()
        if repo_path is None:
            raise RuntimeError("Depth Anything depo yolu ayarlanamadı.")
        repo_str = str(repo_path)
        if repo_str not in sys.path:
            sys.path.insert(0, repo_str)

        dpt = importlib.import_module("depth_anything_v2.dpt")
        DepthAnythingV2 = dpt.DepthAnythingV2
        config = {
            "encoder": "vitl",
            "features": 256,
            "out_channels": [256, 512, 1024, 1024],
        }
        self._device = self._get_device(torch)
        model = DepthAnythingV2(**config)
        state_dict = torch.load(
            str(self._weights_path()),
            map_location="cpu",
            weights_only=True,
        )
        model.load_state_dict(state_dict)
        self._model = model.to(self._device).eval()
        return self._model

    def _get_device(self, torch) -> str:
        if torch.cuda.is_available():
            return "cuda"
        if torch.backends.mps.is_available():
            return "mps"
        return "cpu"

    def _add_fog(self, image, depth, beta: float, np) -> object:
        d_min, d_max = depth.min(), depth.max()
        if d_max - d_min < 1e-8:
            return image.copy()
        d_norm = 1.0 - (depth - d_min) / (d_max - d_min)
        transmission = np.exp(-beta * d_norm)
        scene = image.astype(np.float64) / 255.0
        t = transmission[..., np.newaxis]
        foggy = scene * t + 1.0 * (1.0 - t)
        return np.clip(foggy * 255.0, 0, 255).astype(np.uint8)
