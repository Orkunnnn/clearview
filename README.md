# ClearView 

## Structure

```
clearview/
├── backend/    # FastAPI — dehazing, deraining and metrics services
├── frontend/   # TanStack Start (React + Vite) UI
└── docker-compose.yml
```

## Running

```bash
cp .env.example .env  # then edit the paths for your machine
docker compose up
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000

The backend mounts a few external model repositories (Depth-Anything-V2, DehazeFormer, MPRNet, fog-maker checkpoints) from the host; their locations are configured via the `.env` file — see `.env.example` for details.

## Development

**Backend**:

```bash
cd backend
uv run fastapi dev app/main.py
uv run pytest
```

**Frontend**:

```bash
cd frontend
npm install
npm run dev
```
