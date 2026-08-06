# ClearView (NetGör)

Görüntülerde sis ve yağmur giderme uygulaması. Bitirme projesi.

## Yapı

```
clearview/
├── backend/    # FastAPI — dehazing, deraining ve metrik servisleri
├── frontend/   # TanStack Start (React + Vite) arayüzü
└── docker-compose.yml
```

## Çalıştırma

```bash
docker compose up
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000

> Not: `docker-compose.yml` içindeki bazı model depoları (Depth-Anything-V2, DehazeFormer, MPRNet, fog-maker) makineye özel mutlak yollarla bağlanmıştır; kendi ortamınıza göre güncellemeniz gerekir.

## Geliştirme

**Backend** (Python, [uv](https://docs.astral.sh/uv/)):

```bash
cd backend
uv run fastapi dev app/main.py
uv run pytest
```

**Frontend** (Node):

```bash
cd frontend
npm install
npm run dev
```
