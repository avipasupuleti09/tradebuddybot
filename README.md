# TradeBuddy (FYERS Backend + React Dashboard)

Full-stack FYERS algo-trading starter with:

- Automated FYERS auth using User ID + TOTP + PIN
- Local token storage
- Quote and historical data fetch commands
- Live websocket market data stream command
- React dashboard (portfolio landing page)
- Login button that generates token from backend

## 1) Setup

```powershell
cd d:/Fyers/tradebuddy
python -m venv .venv
.venv/Scripts/Activate.ps1
pip install -r requirements.txt
```

Create `.env` from `.env.example` and fill values:

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

The app login screen now requires the user to enter the 4-digit broker account PIN before login. `FYERS_PIN` remains optional and is only useful for non-interactive backend login automation outside the UI endpoint.

Important: the same redirect URI must be configured in your FYERS app settings.

## Hosted Deployment

This repository can now be deployed as a single Node entrypoint that serves the built React app, exposes the scanner routes, and proxies `/api/*` to the FYERS backend.

Recommended hosting settings:

```text
Root directory: /
Build command: npm install
Start command: npm start
Node version: 22.x
```

Required environment variables for a deployed domain:

```text
FRONTEND_URL=https://your-domain.example
FYERS_REDIRECT_URI=https://your-domain.example/api/auth/callback
FYERS_PAPER_TRADE_MODE=true
```

Python backend options:

1. Same host, Python available:
Set `PYTHON_AUTOSTART=true` or leave `PYTHON_API_BASE` unset. The Node server will try to start `server.py`.

2. Separate Python API service:
Set `PYTHON_API_BASE=https://your-python-api.example` and optionally `SKIP_PYTHON_BOOTSTRAP=true`.

Static IP guard note:

If your hosting plan does not provide a fixed outbound IP for live trading requests, either set a real value for `FYERS_ORDER_STATIC_IP` or disable the guard with `FYERS_ENFORCE_STATIC_IP_CHECK=false`. Paper mode does not require the static IP check anymore.

## 2) Run Backend API

```powershell
python server.py
```

This starts backend API on `http://localhost:5000`.

## 3) Run React UI

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5100`.

## 4) Run Both With One Command

```powershell
npm install
npm run dev
```

This starts:
- backend API on `http://localhost:5000`
- frontend UI on `http://localhost:5100`

## 5) Login Flow from UI

1. Click **Login with FYERS**.
2. Backend tries automatic TOTP login.
3. If FYERS requires browser auth, backend redirects to FYERS login page.
4. After FYERS callback, backend stores token and redirects back to React UI.
5. Landing page shows portfolio dashboard data.
6. Dashboard auto-refreshes every 10 seconds.
7. Dashboard includes a live P&L pulse chart and guarded order panel.

## 6) CLI Commands (Optional)

```powershell
python app.py auth
```

This stores token JSON at `FYERS_TOKEN_FILE`.

Manual fallback flow (recommended when `auth` fails):

1. Generate FYERS login URL:

```powershell
python app.py auth-url
```

2. Open the returned URL in browser, login, and copy callback URL.

3. Exchange callback URL to token:

```powershell
python app.py auth-code --callback-url "https://127.0.0.1:5000/callback?auth_code=..."
```

You can also pass only auth code:

```powershell
python app.py auth-code --auth-code YOUR_AUTH_CODE
```

If FYERS login flow changes, you can import a manually generated token:

```powershell
python app.py import-token --access-token YOUR_ACCESS_TOKEN
```

## 7) Backend CLI Commands

Get profile:

```powershell
python app.py profile
```

## 8) UI Features

- Login button triggers backend token generation flow.
- Portfolio dashboard shows funds, holdings, positions, and total live P&L.
- Live P&L pulse chart updates from backend websocket feed.
- Watchlist cards stream live quotes for key symbols.
- Positions table shows current net positions.
- Order panel places paper or live orders through backend static-IP and paper/live guards.
- Strategy controls allow one-shot trigger-based execution directly from UI.
- Logout button clears the local token and returns the app to login state.
- Connection badge shows `live`, `connecting`, `reconnecting`, or `offline` websocket status.

Get quotes:

```powershell
python app.py quotes NSE:SBIN-EQ NSE:RELIANCE-EQ
```

Get history:

```powershell
python app.py history NSE:SBIN-EQ --resolution 5 --start 2026-04-01 --end 2026-04-12
```

Start live stream:

```powershell
python app.py stream NSE:SBIN-EQ NSE:NIFTY50-INDEX
```

Check current public IP:

```powershell
python app.py public-ip
```

Place order (will be blocked if static IP does not match):

```powershell
python app.py place-order --symbol NSE:SBIN-EQ --qty 1 --side BUY --order-type MARKET --product-type INTRADAY
```

Run preflight checks before market hours:

```powershell
python app.py preflight
```

Force a live order when paper mode is enabled:

```powershell
python app.py place-order --symbol NSE:SBIN-EQ --qty 1 --side BUY --order-type MARKET --product-type INTRADAY --force-live
```

Run strategy with trigger and shared paper/live safety:

```powershell
python app.py strategy-run --symbol NSE:SBIN-EQ --qty 1 --side BUY --trigger-ltp 900 --product-type INTRADAY
```

Run strategy in live mode intentionally:

```powershell
python app.py strategy-run --symbol NSE:SBIN-EQ --qty 1 --side BUY --trigger-ltp 900 --product-type INTRADAY --force-live
```

Run looped strategy watcher with interval and execution caps:

```powershell
python app.py strategy-watch --symbol NSE:SBIN-EQ --qty 1 --side BUY --trigger-ltp 900 --poll-seconds 5 --max-trades 1 --max-checks 120
```

Live watcher mode (intentional):

```powershell
python app.py strategy-watch --symbol NSE:SBIN-EQ --qty 1 --side BUY --trigger-ltp 900 --poll-seconds 5 --max-trades 1 --max-checks 120 --force-live
```

## Notes

- This is backend-only as requested (no UI).
- You can now run backend and frontend together with a single `npm run dev` from project root.
- Keep `.env` and token files private.
- Order placement enforces static IP check by default using `FYERS_ORDER_STATIC_IP`.
- `FYERS_PAPER_TRADE_MODE=true` prevents accidental live orders; use `--force-live` for intentional live execution.
- `strategy-run` uses the same static IP and paper/live guard as `place-order`.
- `strategy-watch` polls quotes repeatedly and stops after max checks or max trades.
- If FYERS changes internal auth endpoints, update `tradebuddy/auth.py` accordingly.
