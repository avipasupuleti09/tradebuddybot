# TradeBuddy (Node Backend + React UI)

TradeBuddy now runs as a Node.js stack end to end:

- Express backend for FYERS auth, quotes, history, orders, watchlists, analytics, and live websocket streaming
- React + Vite frontend on `http://localhost:5100`
- Node-based scanner service on `http://localhost:8001`
- Main Node server that can also run in hosted mode to serve `frontend/dist` and mount both `/api` and `/scanner-api`

## Prerequisites

```text
Node.js 22.x
npm 10+
```

## Environment

Create `.env` from `.env.example` and fill these values:

```text
FYERS_CLIENT_ID=...
FYERS_SECRET_KEY=...
FYERS_REDIRECT_URI=http://localhost:5000/api/auth/callback
FYERS_USER_ID=...
FYERS_TOTP_KEY=...
FYERS_PIN=OPTIONAL_FALLBACK_PIN
FYERS_TOKEN_FILE=.tokens/fyers_token.json
FYERS_ORDER_STATIC_IP=YOUR_WHITELISTED_STATIC_IP
FYERS_ENFORCE_STATIC_IP_CHECK=true
PUBLIC_IP_CHECK_URL=https://api.ipify.org
FYERS_PAPER_TRADE_MODE=true
FRONTEND_URL=http://localhost:5100
```

Notes:

- `FYERS_PIN` is optional for non-interactive flows. The UI login asks the user for the 4-digit broker PIN.
- `FYERS_REDIRECT_URI` must match the FYERS app configuration exactly.
- If you do not have a fixed outbound IP for live orders, set `FYERS_ENFORCE_STATIC_IP_CHECK=false` or keep paper trading enabled.

## Install

```powershell
npm install
```

## Local Development

Run the full stack:

```powershell
npm run dev
```

This starts:

- backend API on `http://localhost:5000`
- scanner API on `http://localhost:8001`
- frontend UI on `http://localhost:5100`

Individual services:

```powershell
npm run dev:backend
npm run dev:scanner
npm run dev:frontend
```

## Runtime URLs

- Frontend: `http://localhost:5100`
- Backend health: `http://localhost:5000/api/health`
- Scanner health: `http://localhost:8001/api/health`
- Hosted health: `http://localhost:3000/health`

The Vite frontend proxies:

- `/api` -> `http://localhost:5000`
- `/scanner-api` -> `http://localhost:8001`

## Login Flow

1. Open the frontend.
2. Click **Login with FYERS**.
3. Enter the 4-digit broker PIN when prompted.
4. The backend attempts TOTP login automatically.
5. If FYERS requires browser auth, the app redirects to the FYERS login page.
6. After callback, the backend stores the token and returns to the UI.

## Production / Hosted Mode

Build and start the single hosted Node server:

```powershell
npm run build
npm start
```

Recommended hosted settings:

```text
Root directory: /
Install command: npm install
Build command: npm run build
Start command: npm start
Node version: 22.x
```

## Hostinger Checklist

Use these settings on Hostinger's Node.js plan:

```text
Application root: /
Install command: npm install
Build command: npm run build
Start command: npm start
Node version: 22.x
```

Required production environment values:

```text
FRONTEND_URL=https://your-domain.example
FYERS_REDIRECT_URI=https://your-domain.example/api/auth/callback
FYERS_PAPER_TRADE_MODE=true
HOSTED_MODE=true
```

`HOSTED_MODE=true` is the safest explicit setting for managed hosts. The server will also auto-enable hosted mode when the platform injects `PORT` and `frontend/dist/index.html` exists.

Important runtime notes:

- Do not set `BACKEND_API_BASE` in hosted mode unless you intentionally want the scanner to call a different backend host. Leaving it unset lets `/scanner-api` reuse the same hosted Node process.
- If Hostinger logs mention removed legacy bootstrap files, the platform is deploying an old snapshot or wrong root rather than the current Node-only app.
- Clear Hostinger build cache or remove the old deployed app files before redeploying if stale logs persist.
- Confirm the deployed root contains the current `package.json` where `build` runs the root Vite build and `start` is `node server.js --hosted`.

Hosted runtime behavior:

- serves `frontend/dist`
- exposes backend routes under `/api/*`
- exposes scanner routes under `/scanner-api/*`
- exposes health on `/health`

Implementation note:

- `npm start` now runs `node server.js --hosted`; the separate `hosting` folder is no longer used.
- The root package no longer relies on npm workspaces; `npm run build` now uses a root `vite.config.js` that targets the nested `frontend/` app while keeping the Node server as the runtime entrypoint.
- On managed Node hosts, the server also auto-switches into hosted mode when `PORT` is assigned and the built frontend is present, which avoids `Cannot GET /` if CLI flags are dropped by the platform.

Required environment overrides for a deployed domain:

```text
FRONTEND_URL=https://your-domain.example
FYERS_REDIRECT_URI=https://your-domain.example/api/auth/callback
FYERS_PAPER_TRADE_MODE=true
HOSTED_MODE=true
```

## Features

- FYERS login with TOTP + PIN fallback flow
- portfolio dashboard with holdings, positions, funds, orders, and trades
- websocket quote streaming on `/api/live`
- watchlist CRUD and smart/predefined watchlist catalog
- symbol search, quotes, history, and technical analytics
- direct screener datasets from the Node scanner service
- guarded order placement with paper-trade and static-IP controls

## Notes

- The supported runtime and server code are Node-only.
- Local app state is stored under `.tokens`, `.cache`, and `.data`.
- Keep `.env` and token files private.
