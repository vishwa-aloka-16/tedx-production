# TEDx AI Pictionary

React/Vite frontend and FastAPI backend with PyTorch and TensorFlow drawing recognition.

## Backend

From the repository root, using Python 3.11:

```sh
python -m venv backend/.venv
# Linux/macOS:
source backend/.venv/bin/activate
# Windows PowerShell: backend/.venv/Scripts/Activate.ps1
python -m pip install -r backend/requirements.txt
cp backend/.env.example backend/.env
python -m uvicorn backend.app:app --host 0.0.0.0 --port 8000 --workers 1
```

Set `CORS_ORIGINS` in `backend/.env` to the frontend's actual HTTPS origin
(comma-separated for multiple origins). Set `LEADERBOARD_PATH` to a writable
persistent volume path. Relative paths resolve under `backend/`. Deployment
environment variables take precedence over `.env` values.

Run exactly one backend worker and one instance: matchmaking and active games
are stored in memory. SQLite preserves leaderboard results across restarts;
active games and admin settings do not survive restarts. The database is created
automatically and local player data is excluded from Git.

## Frontend

```sh
cd frontend
cp .env.example .env
npm ci
npm run build
```

Before building, set `VITE_API_URL` to the public backend HTTPS URL without a
trailing slash. This value is embedded at build time. WebSocket URLs are derived
from it automatically. Serve `frontend/dist` using a static hosting service with
SPA fallback to `index.html`. The backend proxy must support WebSocket upgrades
for `/ws/*`. Use TLS for both services. Check backend readiness at `/health`;
startup loads both active models before serving requests.

The existing admin endpoints have no authentication. Restrict `/admin` and
`/admin/*` at the reverse proxy to authorized operators before public exposure.
CORS does not provide authentication.

## Included models

- `backend/models/best_drawing_cnn_20.pt` with `metadata_20.json`: active 20-class model.
- `backend/models/best_model.keras` with `metadata_keras.json`: active 50-class model.
- Other existing checkpoints and metadata are retained for compatibility.

Model weights are committed directly; no separate download or Git LFS is needed.
Local `.env` files are ignored; copy and customize the committed `.env.example`
files on the deployment host. Do not put secrets in frontend environment variables.

## Checks

Production pages open immediately and check backend readiness in the background.
After five seconds without a response, a dismissible connection notice shows an
estimated startup countdown. A successful API or game WebSocket response removes
it immediately. After two minutes without a response, the notice offers a retry.
It never blocks navigation; joining and playing still require backend connectivity.
Development mode and localhost omit the notice. Startup requests allow up to 60
seconds, and checks resume when a mobile tab returns to the foreground.
No additional environment variables are required.

Round prompts are delivered 750 ms ahead of their shared reveal time. Browsers
estimate the server clock from HTTP round trips, and ignore older game snapshots.
This reduces ordinary delivery skew; clients with network delays beyond the lead
time can still receive a prompt late. Deploy frontend and backend together.

```sh
python -m unittest backend.test_game_manager
cd frontend
node --test tests/*.test.js
npm run lint
npm run build
```
