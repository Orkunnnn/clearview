from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import health, metrics, process, weather

app = FastAPI(
    title="NetGör API",
    description="Görüntülerde sis ve yağmur giderme API'si",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "X-Dehazing-Backend",
        "X-Transmission-Mean",
        "X-DehazeFormer-Checkpoint",
        "X-DehazeFormer-Elapsed-Ms",
        "X-DehazeFormer-Original-Size",
        "X-DehazeFormer-Inference-Size",
        "X-Deraining-Backend",
        "X-MPRNet-Checkpoint",
        "X-MPRNet-Elapsed-Ms",
        "X-MPRNet-Original-Size",
        "X-MPRNet-Inference-Size",
        "X-UGSM-Iterations",
        "X-UGSM-Relative-Change",
    ],
)

app.include_router(health.router)
app.include_router(metrics.router)
app.include_router(process.router)
app.include_router(weather.router)
