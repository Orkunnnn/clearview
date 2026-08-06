# ClearView (NetGör)

## Structure

```
clearview/
├── backend/    # FastAPI — dehazing, deraining and metrics services
├── frontend/   # TanStack Start (React + Vite) UI
└── docker-compose.yml
```

## Running

```bash
docker compose up
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000

> Note: some model repositories in `docker-compose.yml` (Depth-Anything-V2, DehazeFormer, MPRNet, fog-maker) are mounted via machine-specific absolute paths; update them for your own environment.

## Development

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
