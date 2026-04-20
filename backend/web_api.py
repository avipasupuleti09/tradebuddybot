from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from bisect import bisect_left
import json
import os
from threading import Lock
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.parse import urlencode

from flask import Flask, jsonify, redirect, request
from flask_cors import CORS
from flask_sock import Sock
from dotenv import dotenv_values

from .api import FyersApiService
from .auth import FyersAuthService, MissingBrokerPinError, PinVerificationError
from .config import Settings
from .network import ensure_static_ip
from .symbols import SymbolMaster
from .token_store import TokenStore


PROJECT_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ENV_FILE = PROJECT_ROOT / ".env"


def read_frontend_url() -> str:
    if PROJECT_ENV_FILE.exists():
        file_value = dotenv_values(PROJECT_ENV_FILE).get("FRONTEND_URL", "")
        if file_value:
            return str(file_value).strip().rstrip("/")

    return os.getenv("FRONTEND_URL", "").strip().rstrip("/")



def create_app() -> Flask:
    app = Flask(__name__)
    CORS(app, resources={r"/api/*": {"origins": "*"}})
    sock = Sock(app)

    settings = Settings.from_env()
    frontend_url = read_frontend_url()
    symbol_master = SymbolMaster()
    watchlist_file = Path(os.getenv("WATCHLIST_FILE", ".data/watchlists.json")).resolve()
    analytics_cache_file = Path(os.getenv("NSE_ANALYTICS_CACHE_FILE", ".cache/nse_analytics_cache.json")).resolve()
    history_signal_cache: dict[str, tuple[float, dict]] = {}
    history_signal_cache_lock = Lock()

    _MAX_ANALYTICS_SYMBOLS = 50
    _MAX_DIRECT_SCREENER_SYMBOLS = 350
    _ANALYTICS_HISTORY_YEARS = 8
    _ANALYTICS_CHUNK_DAYS = 1500
    _ANALYTICS_CACHE_TTL_SECONDS = 6 * 60 * 60
    _DIRECT_DAILY_HISTORY_DAYS = 1095
    _DIRECT_INTRADAY_HISTORY_DAYS = 60
    _DIRECT_INTRADAY_RESOLUTION = "5"
    _DIRECT_LOOKBACK_52W = 252
    _DIRECT_NEAR_PCT_52W = 0.25
    _DIRECT_MA50 = 50
    _DIRECT_MA200 = 200
    _DIRECT_VOL_SPIKE_MULT = 1.5
    _DIRECT_VOL_BREAKOUT_MULT = 2.0
    _DIRECT_GAP_UP_PCT = 2.0
    _DIRECT_ATR_PERIOD = 14
    _DIRECT_ATR_STOP_MULT = 2.0
    _DIRECT_RISK_PER_TRADE_INR = 1000
    _DIRECT_SR_LOOKBACK_DAYS = 60
    _DIRECT_CMF_PERIOD = 20
    _DIRECT_OBV_SLOPE_DAYS = 20
    _DIRECT_ACCUM_SCORE_MIN = 60
    _DIRECT_AI_PROB_MIN = 0.55
    _DIRECT_BENCHMARK_SYMBOL = "NSE:NIFTY50-INDEX"

    direct_sector_map = {
        "RELIANCE": "Oil & Gas",
        "TCS": "Information Technology",
        "INFY": "Information Technology",
        "HDFCBANK": "Financial Services",
        "ICICIBANK": "Financial Services",
        "SBIN": "Financial Services",
        "KOTAKBANK": "Financial Services",
        "AXISBANK": "Financial Services",
        "BAJFINANCE": "Financial Services",
        "BAJAJFINSV": "Financial Services",
        "HCLTECH": "Information Technology",
        "WIPRO": "Information Technology",
        "TECHM": "Information Technology",
        "LTIMINDTREE": "Information Technology",
        "LTIM": "Information Technology",
        "ITC": "FMCG",
        "HINDUNILVR": "FMCG",
        "NESTLEIND": "FMCG",
        "BRITANNIA": "FMCG",
        "DABUR": "FMCG",
        "MARICO": "FMCG",
        "COLPAL": "FMCG",
        "GODREJCP": "FMCG",
        "TATACONSUM": "FMCG",
        "BHARTIARTL": "Telecommunication",
        "JIOFIN": "Financial Services",
        "MARUTI": "Automobile",
        "TATAMOTORS": "Automobile",
        "M&M": "Automobile",
        "BAJAJ-AUTO": "Automobile",
        "HEROMOTOCO": "Automobile",
        "EICHERMOT": "Automobile",
        "ASHOKLEY": "Automobile",
        "SUNPHARMA": "Healthcare",
        "DRREDDY": "Healthcare",
        "CIPLA": "Healthcare",
        "DIVISLAB": "Healthcare",
        "APOLLOHOSP": "Healthcare",
        "BIOCON": "Healthcare",
        "LUPIN": "Healthcare",
        "LT": "Construction",
        "ADANIENT": "Metals & Mining",
        "ADANIPORTS": "Services",
        "ADANIGREEN": "Power",
        "ADANIPOWER": "Power",
        "NTPC": "Power",
        "POWERGRID": "Power",
        "TATAPOWER": "Power",
        "TATASTEEL": "Metals & Mining",
        "JSWSTEEL": "Metals & Mining",
        "HINDALCO": "Metals & Mining",
        "COALINDIA": "Metals & Mining",
        "VEDL": "Metals & Mining",
        "NMDC": "Metals & Mining",
        "ULTRACEMCO": "Construction",
        "SHREECEM": "Construction",
        "AMBUJACEM": "Construction",
        "ACC": "Construction",
        "GRASIM": "Construction",
        "TITAN": "Consumer Durables",
        "ASIANPAINT": "Consumer Durables",
        "BERGEPAINT": "Consumer Durables",
        "PIDILITIND": "Chemicals",
        "UPL": "Chemicals",
        "SRF": "Chemicals",
        "BPCL": "Oil & Gas",
        "ONGC": "Oil & Gas",
        "IOC": "Oil & Gas",
        "HINDPETRO": "Oil & Gas",
        "GAIL": "Oil & Gas",
        "INDUSINDBK": "Financial Services",
        "BANKBARODA": "Financial Services",
        "PNB": "Financial Services",
        "IDFCFIRSTB": "Financial Services",
        "FEDERALBNK": "Financial Services",
        "CANBK": "Financial Services",
        "HDFCLIFE": "Financial Services",
        "SBILIFE": "Financial Services",
        "ICICIPRULI": "Financial Services",
        "ICICIGI": "Financial Services",
        "SBICARD": "Financial Services",
        "HAVELLS": "Consumer Durables",
        "VOLTAS": "Consumer Durables",
        "WHIRLPOOL": "Consumer Durables",
        "ZOMATO": "Services",
        "NYKAA": "Services",
        "PAYTM": "Financial Services",
        "POLICYBZR": "Financial Services",
        "DMART": "FMCG",
        "TRENT": "FMCG",
        "PERSISTENT": "Information Technology",
        "COFORGE": "Information Technology",
        "MPHASIS": "Information Technology",
        "HAPPSTMNDS": "Information Technology",
        "LTTS": "Information Technology",
        "HAL": "Capital Goods",
        "BEL": "Capital Goods",
        "BHEL": "Capital Goods",
        "IRCTC": "Services",
        "INDIANHOTEL": "Services",
        "LEMONTREE": "Services",
        "SIEMENS": "Capital Goods",
        "ABB": "Capital Goods",
        "CUMMINSIND": "Capital Goods",
    }

    def resolve_frontend_url() -> str:
        if frontend_url:
            return frontend_url

        forwarded_proto = request.headers.get("X-Forwarded-Proto", request.scheme)
        forwarded_host = request.headers.get("X-Forwarded-Host", request.host)
        return f"{forwarded_proto}://{forwarded_host}".rstrip("/")

    def load_api() -> FyersApiService:
        token_payload = TokenStore(settings.token_file).load()
        access_token = token_payload.get("access_token", "")
        if not access_token:
            raise RuntimeError("No access token found. Please login first.")
        return FyersApiService(client_id=settings.client_id, access_token=access_token)

    def map_side(raw: str) -> int:
        return 1 if raw.upper() == "BUY" else -1

    def map_order_type(raw: str) -> int:
        mapping = {
            "LIMIT": 1,
            "MARKET": 2,
            "SL-M": 3,
            "SL-L": 4,
        }
        return mapping[raw.upper()]

    def check_trigger(side: str, ltp: float, trigger_ltp: float) -> bool:
        if side.upper() == "BUY":
            return ltp >= trigger_ltp
        return ltp <= trigger_ltp

    def as_float(value) -> float | None:
        try:
            if value is None or value == "":
                return None
            return float(value)
        except (TypeError, ValueError):
            return None

    def simple_moving_average(values: list[float], period: int) -> float | None:
        if len(values) < period:
            return None
        return sum(values[-period:]) / period

    def percent_change(current: float | None, previous: float | None) -> float | None:
        if current is None or previous in (None, 0):
            return None
        return ((current - previous) / previous) * 100

    def safe_round(value: float | None, digits: int = 2) -> float | None:
        number = as_float(value)
        if number is None:
            return None
        return round(number, digits)

    def mean(values: list[float | None]) -> float | None:
        valid = [value for value in values if value is not None]
        if not valid:
            return None
        return sum(valid) / len(valid)

    def min_max_normalize(value: float | None, minimum: float, maximum: float) -> float | None:
        number = as_float(value)
        if number is None:
            return None
        if maximum == minimum:
            return 0.5
        normalized = (number - minimum) / (maximum - minimum)
        if normalized < 0:
            return 0.0
        if normalized > 1:
            return 1.0
        return normalized

    def linear_slope(values: list[float | None]) -> float | None:
        numeric = [value for value in values if value is not None]
        if len(numeric) < 2:
            return None
        size = len(numeric)
        x_mean = (size - 1) / 2
        y_mean = sum(numeric) / size
        denominator = sum((index - x_mean) ** 2 for index in range(size))
        if denominator == 0:
            return None
        numerator = sum((index - x_mean) * (numeric[index] - y_mean) for index in range(size))
        return numerator / denominator

    def rolling_mean(values: list[float | None], period: int) -> float | None:
        if len(values) < period:
            return None
        slice_values = [value for value in values[-period:] if value is not None]
        if len(slice_values) < period:
            return None
        return sum(slice_values) / period

    def compute_rsi(values: list[float], period: int = 14) -> float | None:
        if len(values) <= period:
            return None

        gains = 0.0
        losses = 0.0
        for idx in range(len(values) - period, len(values)):
            delta = values[idx] - values[idx - 1]
            if delta >= 0:
                gains += delta
            else:
                losses -= delta

        if gains == 0 and losses == 0:
            return 50.0
        if losses == 0:
            return 100.0

        rs = (gains / period) / (losses / period)
        return 100 - (100 / (1 + rs))

    def summarize_dashboard(holdings: dict, positions: dict, funds: dict) -> dict:
        holdings_rows = holdings.get("holdings", []) or []
        position_rows = positions.get("netPositions", []) or []
        fund_rows = funds.get("fund_limit", []) or []

        holdings_pnl = sum(float(item.get("pnl", 0) or 0) for item in holdings_rows)
        positions_pnl = sum(float(item.get("pl", 0) or item.get("pnl", 0) or 0) for item in position_rows)
        invested_value = sum(float(item.get("costPrice", 0) or 0) * float(item.get("quantity", 0) or 0) for item in holdings_rows)
        available_balance = float(fund_rows[0].get("equityAmount", 0) or 0) if fund_rows else 0

        return {
            "holdings_pnl": holdings_pnl,
            "positions_pnl": positions_pnl,
            "total_pnl": holdings_pnl + positions_pnl,
            "invested_value": invested_value,
            "available_balance": available_balance,
        }

    def build_dashboard_payload(api: FyersApiService) -> dict:
        profile = api.profile()
        holdings = api.holdings()
        positions = api.positions()
        funds = api.funds()
        orderbook = api.orderbook()
        tradebook = api.tradebook()
        summary = summarize_dashboard(holdings, positions, funds)

        return {
            "status": "ok",
            "profile": profile,
            "holdings": holdings,
            "positions": positions,
            "funds": funds,
            "orderbook": orderbook,
            "tradebook": tradebook,
            "summary": summary,
        }

    @app.get("/api/health")
    def health() -> tuple[dict, int]:
        return {"status": "ok"}, 200

    @app.post("/api/login")
    def login() -> tuple[dict, int]:
        payload = request.get_json(silent=True) or {}
        broker_pin = str(payload.get("pin", "")).strip() or None
        if not broker_pin:
            return {"status": "error", "message": "Enter your 4-digit broker account PIN to continue."}, 400
        if not broker_pin.isdigit() or len(broker_pin) != 4:
            return {"status": "error", "message": "Broker PIN must be exactly 4 digits."}, 400

        auth_service = FyersAuthService(settings)
        try:
            result = auth_service.login_with_totp(broker_pin)
            TokenStore(settings.token_file).save(result.to_dict())
            return {"status": "ok", "mode": "totp"}, 200
        except PinVerificationError as exc:
            return {"status": "error", "message": str(exc)}, 401
        except MissingBrokerPinError as exc:
            return {"status": "error", "message": str(exc)}, 400
        except Exception as exc:
            auth_url = auth_service.get_manual_auth_url()
            return {
                "status": "redirect_required",
                "message": str(exc),
                "auth_url": auth_url,
            }, 202

    @app.get("/api/auth-url")
    def auth_url() -> tuple[dict, int]:
        auth_service = FyersAuthService(settings)
        return {"auth_url": auth_service.get_manual_auth_url()}, 200

    @app.get("/api/auth/callback")
    def auth_callback():
        auth_code = request.args.get("auth_code", "")
        if not auth_code:
            return jsonify({"status": "error", "message": "auth_code missing"}), 400

        target_frontend_url = resolve_frontend_url()
        auth_service = FyersAuthService(settings)
        try:
            result = auth_service.exchange_auth_code(auth_code)
            TokenStore(settings.token_file).save(result.to_dict())
            query = urlencode({"login": "success"})
            return redirect(f"{target_frontend_url}/?{query}")
        except Exception as exc:
            query = urlencode({"login": "error", "reason": str(exc)})
            return redirect(f"{target_frontend_url}/?{query}")

    @app.get("/api/session")
    def session_status() -> tuple[dict, int]:
        try:
            api = load_api()
        except Exception as exc:
            return {"authenticated": False, "message": str(exc)}, 200

        profile = api.profile()
        if str(profile.get("s", "")).lower() == "ok":
            return {
                "authenticated": True,
                "profile": profile.get("data", {}),
            }, 200

        funds = api.funds()
        if str(funds.get("s", "")).lower() == "ok":
            return {
                "authenticated": True,
                "profile": {},
                "warning": profile.get("message") or "Profile details are temporarily unavailable.",
            }, 200

        return {
            "authenticated": False,
            "message": profile.get("message") or "Unable to validate FYERS session.",
        }, 200

    @app.post("/api/logout")
    def logout() -> tuple[dict, int]:
        TokenStore(settings.token_file).delete()
        return {"status": "ok", "authenticated": False}, 200

    @app.get("/api/dashboard")
    def dashboard() -> tuple[dict, int]:
        try:
            api = load_api()
        except Exception as exc:
            return {"status": "error", "message": str(exc)}, 401

        return build_dashboard_payload(api), 200

    @sock.route("/api/live")
    def live(socket) -> None:
        try:
            api = load_api()
            query_symbols = request.args.get("symbols", "")
            symbols = [symbol.strip() for symbol in query_symbols.split(",") if symbol.strip()]
            if not symbols:
                symbols = ["NSE:NIFTY50-INDEX", "NSE:NIFTYBANK-INDEX", "NSE:SBIN-EQ", "NSE:RELIANCE-EQ"]

            while True:
                payload = build_dashboard_payload(api)
                payload["watchlist"] = api.quotes(symbols)
                socket.send(json.dumps(payload))
                time.sleep(5)
        except Exception as exc:
            try:
                socket.send(json.dumps({"status": "error", "message": str(exc)}))
            except Exception:
                pass

    @app.post("/api/orders")
    def place_order() -> tuple[dict, int]:
        payload = request.get_json(silent=True) or {}

        try:
            symbol = str(payload.get("symbol", "")).strip()
            qty = int(payload.get("qty", 0))
            side = str(payload.get("side", "BUY")).strip().upper()
            order_type = str(payload.get("orderType", "MARKET")).strip().upper()
            product_type = str(payload.get("productType", "INTRADAY")).strip()
            limit_price = float(payload.get("limitPrice", 0) or 0)
            stop_price = float(payload.get("stopPrice", 0) or 0)
            validity = str(payload.get("validity", "DAY")).strip()
            disclosed_qty = int(payload.get("disclosedQty", 0) or 0)
            offline_order = bool(payload.get("offlineOrder", False))
            stop_loss = float(payload.get("stopLoss", 0) or 0)
            take_profit = float(payload.get("takeProfit", 0) or 0)
            force_live = bool(payload.get("forceLive", False))
        except (TypeError, ValueError) as exc:
            return {"status": "error", "message": f"Invalid order payload: {exc}"}, 400

        if not symbol or qty < 1:
            return {"status": "error", "message": "symbol and qty are required."}, 400

        try:
            api = load_api()
        except Exception as exc:
            return {"status": "error", "message": str(exc)}, 400

        order_payload = {
            "symbol": symbol,
            "qty": qty,
            "type": map_order_type(order_type),
            "side": map_side(side),
            "productType": product_type,
            "limitPrice": limit_price,
            "stopPrice": stop_price,
            "validity": validity,
            "disclosedQty": disclosed_qty,
            "offlineOrder": offline_order,
            "stopLoss": stop_loss,
            "takeProfit": take_profit,
        }

        if order_type == "LIMIT" and limit_price <= 0:
            return {"status": "error", "message": "limitPrice must be > 0 for LIMIT orders."}, 400

        validated_ip = None
        if settings.paper_trade_mode and not force_live:
            return {
                "status": "ok",
                "paper_trade": True,
                "validated_public_ip": validated_ip,
                "simulated_order": order_payload,
            }, 200

        try:
            validated_ip = ensure_static_ip(settings)
        except Exception as exc:
            return {"status": "error", "message": str(exc)}, 400

        response = api.place_order(order_payload)
        return {
            "status": "ok",
            "paper_trade": False,
            "validated_public_ip": validated_ip,
            "order_response": response,
        }, 200

    @app.post("/api/strategy/run")
    def run_strategy() -> tuple[dict, int]:
        try:
            api = load_api()
        except Exception as exc:
            return {"status": "error", "message": str(exc)}, 400

        payload = request.get_json(silent=True) or {}

        try:
            symbol = str(payload.get("symbol", "")).strip()
            qty = int(payload.get("qty", 0))
            side = str(payload.get("side", "BUY")).strip().upper()
            trigger_ltp = float(payload.get("triggerLtp", 0))
            product_type = str(payload.get("productType", "INTRADAY")).strip()
            validity = str(payload.get("validity", "DAY")).strip()
            force_live = bool(payload.get("forceLive", False))
        except (TypeError, ValueError) as exc:
            return {"status": "error", "message": f"Invalid strategy payload: {exc}"}, 400

        if not symbol or qty < 1 or trigger_ltp <= 0:
            return {"status": "error", "message": "symbol, qty, and triggerLtp are required."}, 400

        validated_ip = None

        quotes_response = api.quotes([symbol])
        data = quotes_response.get("d", [])
        if not data:
            return {"status": "error", "message": f"No quote data returned for {symbol}."}, 400

        quote = data[0].get("v", {})
        ltp = quote.get("lp")
        if ltp is None:
            return {"status": "error", "message": "LTP missing in quote response."}, 400

        ltp_value = float(ltp)
        if not check_trigger(side, ltp_value, trigger_ltp):
            return {
                "status": "ok",
                "triggered": False,
                "validated_public_ip": validated_ip,
                "current_ltp": ltp_value,
                "trigger_ltp": trigger_ltp,
                "message": "Trigger condition not met. No order sent.",
            }, 200

        order_payload = {
            "symbol": symbol,
            "qty": qty,
            "type": map_order_type("MARKET"),
            "side": map_side(side),
            "productType": product_type,
            "limitPrice": 0,
            "stopPrice": 0,
            "validity": validity,
            "disclosedQty": 0,
            "offlineOrder": False,
            "stopLoss": 0,
            "takeProfit": 0,
        }

        if settings.paper_trade_mode and not force_live:
            return {
                "status": "ok",
                "triggered": True,
                "paper_trade": True,
                "validated_public_ip": validated_ip,
                "current_ltp": ltp_value,
                "simulated_order": order_payload,
            }, 200

        try:
            validated_ip = ensure_static_ip(settings)
        except Exception as exc:
            return {"status": "error", "message": str(exc)}, 400

        response = api.place_order(order_payload)
        return {
            "status": "ok",
            "triggered": True,
            "paper_trade": False,
            "validated_public_ip": validated_ip,
            "current_ltp": ltp_value,
            "order_response": response,
        }, 200

    # ── Symbol search ──────────────────────────────────────────────────────────
    @app.get("/api/symbols/search")
    def symbol_search() -> tuple[dict, int]:
        query = request.args.get("q", "").strip()
        limit = min(int(request.args.get("limit", "30")), 100)
        if not query:
            return {"results": []}, 200
        try:
            results = symbol_master.search(query, limit=limit)
            return {"results": results}, 200
        except Exception as exc:
            return {"status": "error", "message": str(exc)}, 500

    @app.get("/api/symbols/all")
    def all_symbols() -> tuple[dict, int]:
        try:
            results = symbol_master.all_symbols()
            return {"results": results}, 200
        except Exception as exc:
            return {"status": "error", "message": str(exc)}, 500

    # ── Quotes for arbitrary symbols ───────────────────────────────────────────
    @app.get("/api/quotes")
    def get_quotes() -> tuple[dict, int]:
        raw = request.args.get("symbols", "").strip()
        if not raw:
            return {"d": []}, 200
        symbols = [s.strip() for s in raw.split(",") if s.strip()]
        try:
            api = load_api()
            data = api.quotes(symbols)
            return data, 200
        except Exception as exc:
            return {"status": "error", "message": str(exc)}, 400

    # ── History for chart ──────────────────────────────────────────────────────
    # FYERS API limits: intraday ~100 days, daily can go back years but
    # returns max ~2000 candles per request. We chunk and merge for large ranges.
    _MAX_INTRADAY_DAYS = 100   # FYERS intraday history limit
    _CHUNK_DAYS = 365          # fetch daily data in 1-year chunks

    @app.get("/api/history")
    def get_history() -> tuple[dict, int]:
        symbol = request.args.get("symbol", "").strip()
        resolution = request.args.get("resolution", "5")
        days = int(request.args.get("days", "5"))
        if not symbol:
            return {"status": "error", "message": "symbol is required"}, 400
        try:
            api = load_api()
            end_date = date.today()
            is_daily = resolution == "D"

            # Force daily for ranges that exceed intraday limits
            if not is_daily and days > _MAX_INTRADAY_DAYS:
                resolution = "D"
                is_daily = True

            start_date = end_date - timedelta(days=max(days, 1))

            # For daily resolution with large ranges, fetch in chunks and merge
            if is_daily and days > _CHUNK_DAYS:
                all_candles = []
                chunk_end = end_date
                while chunk_end > start_date:
                    chunk_start = max(start_date, chunk_end - timedelta(days=_CHUNK_DAYS))
                    data = api.history(symbol, resolution, chunk_start, chunk_end)
                    candles = data.get("candles") or []
                    all_candles = candles + all_candles  # prepend older data
                    chunk_end = chunk_start - timedelta(days=1)
                # Deduplicate by timestamp (first element of each candle)
                seen = set()
                unique = []
                for c in all_candles:
                    if c[0] not in seen:
                        seen.add(c[0])
                        unique.append(c)
                unique.sort(key=lambda c: c[0])
                return {"s": "ok", "candles": unique}, 200
            else:
                data = api.history(symbol, resolution, start_date, end_date)
                candles = data.get("candles")
                if not candles:
                    app.logger.warning(
                        "FYERS history empty: symbol=%s res=%s days=%d s=%s msg=%s",
                        symbol, resolution, days,
                        data.get("s", "?"), data.get("message", ""),
                    )
                return data, 200
        except Exception as exc:
            return {"status": "error", "message": str(exc)}, 400

    # ── Watchlist CRUD (persisted to JSON file) ────────────────────────────────
    def _load_watchlists() -> dict:
        if watchlist_file.exists():
            return json.loads(watchlist_file.read_text(encoding="utf-8"))
        return {}

    def _save_watchlists(data: dict) -> None:
        watchlist_file.parent.mkdir(parents=True, exist_ok=True)
        watchlist_file.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def _normalize_symbol(raw: str) -> str:
        sym = str(raw or "").strip().upper()
        if not sym:
            return ""
        if ":" in sym:
            return sym
        return f"NSE:{sym}"

    def _load_history_signal_cache() -> None:
        if not analytics_cache_file.exists():
            return

        try:
            raw = json.loads(analytics_cache_file.read_text(encoding="utf-8"))
        except Exception as exc:
            app.logger.warning("Unable to load analytics cache file %s: %s", analytics_cache_file, exc)
            return

        if not isinstance(raw, dict):
            return

        now = time.time()
        restored: dict[str, tuple[float, dict]] = {}
        for symbol, item in raw.items():
            if not isinstance(item, dict):
                continue
            expires_at = as_float(item.get("expires_at"))
            payload = item.get("payload")
            normalized_symbol = _normalize_symbol(symbol)
            if normalized_symbol and expires_at and expires_at > now and isinstance(payload, dict):
                restored[normalized_symbol] = (expires_at, payload)

        with history_signal_cache_lock:
            history_signal_cache.clear()
            history_signal_cache.update(restored)

    def _persist_history_signal_cache() -> None:
        now = time.time()
        with history_signal_cache_lock:
            snapshot = {
                symbol: {"expires_at": expires_at, "payload": payload}
                for symbol, (expires_at, payload) in history_signal_cache.items()
                if expires_at > now and isinstance(payload, dict)
            }

        analytics_cache_file.parent.mkdir(parents=True, exist_ok=True)
        analytics_cache_file.write_text(json.dumps(snapshot, indent=2, sort_keys=True), encoding="utf-8")

    def _get_cached_history_signal(symbol: str) -> dict | None:
        cache_key = _normalize_symbol(symbol)
        now = time.time()
        with history_signal_cache_lock:
            cached = history_signal_cache.get(cache_key)
            if not cached:
                return None
            if cached[0] <= now:
                history_signal_cache.pop(cache_key, None)
                return None
            return cached[1]

    def _set_cached_history_signal(symbol: str, payload: dict) -> None:
        cache_key = _normalize_symbol(symbol)
        expires_at = time.time() + _ANALYTICS_CACHE_TTL_SECONDS
        with history_signal_cache_lock:
            history_signal_cache[cache_key] = (expires_at, payload)

    _load_history_signal_cache()

    def _daily_history_for_signal(symbol: str) -> list[list]:
        api = load_api()
        end_date = date.today()
        start_date = end_date - timedelta(days=_ANALYTICS_HISTORY_YEARS * 365)
        all_candles: list[list] = []
        chunk_end = end_date

        while chunk_end >= start_date:
            chunk_start = max(start_date, chunk_end - timedelta(days=_ANALYTICS_CHUNK_DAYS))
            data = api.history(symbol, "D", chunk_start, chunk_end)
            candles = data.get("candles") or []
            all_candles.extend(candles)
            chunk_end = chunk_start - timedelta(days=1)

        deduped = {int(candle[0]): candle for candle in all_candles if isinstance(candle, list) and len(candle) >= 5}
        return [deduped[key] for key in sorted(deduped)]

    def _history_rows(symbol: str, resolution: str, days: int) -> list[dict]:
        api = load_api()
        end_date = date.today()
        start_date = end_date - timedelta(days=max(days, 1))
        is_daily = resolution == "D"
        all_candles: list[list] = []

        if is_daily and days > _CHUNK_DAYS:
            chunk_end = end_date
            while chunk_end > start_date:
                chunk_start = max(start_date, chunk_end - timedelta(days=_CHUNK_DAYS))
                data = api.history(symbol, resolution, chunk_start, chunk_end)
                all_candles.extend(data.get("candles") or [])
                chunk_end = chunk_start - timedelta(days=1)
        else:
            data = api.history(symbol, resolution, start_date, end_date)
            all_candles = data.get("candles") or []

        deduped: dict[int, list] = {}
        for candle in all_candles:
            if isinstance(candle, list) and len(candle) >= 6:
                deduped[int(candle[0])] = candle

        rows: list[dict] = []
        for key in sorted(deduped):
            candle = deduped[key]
            rows.append({
                "symbol": _normalize_symbol(symbol),
                "open": as_float(candle[1]),
                "high": as_float(candle[2]),
                "low": as_float(candle[3]),
                "close": as_float(candle[4]),
                "volume": as_float(candle[5]),
                "date": datetime.utcfromtimestamp(key).isoformat() + "Z",
            })
        return [row for row in rows if row.get("close") is not None]

    def _calculate_atr(rows: list[dict], period: int = _DIRECT_ATR_PERIOD) -> float | None:
        if len(rows) < period + 1:
            return None
        true_ranges: list[float] = []
        for index in range(len(rows) - period, len(rows)):
            row = rows[index]
            prev_close = as_float(rows[index - 1].get("close"))
            high = as_float(row.get("high"))
            low = as_float(row.get("low"))
            if high is None or low is None or prev_close is None:
                continue
            true_ranges.append(max(high - low, abs(high - prev_close), abs(low - prev_close)))
        return mean(true_ranges)

    def _calculate_cmf(rows: list[dict], period: int = _DIRECT_CMF_PERIOD) -> float | None:
        if len(rows) < period:
            return None
        money_flow_volume = 0.0
        volume_total = 0.0
        for row in rows[-period:]:
            high = as_float(row.get("high"))
            low = as_float(row.get("low"))
            close = as_float(row.get("close"))
            volume = as_float(row.get("volume"))
            if None in (high, low, close, volume):
                continue
            spread = high - low
            if spread == 0:
                continue
            money_flow_multiplier = ((close - low) - (high - close)) / spread
            money_flow_volume += money_flow_multiplier * volume
            volume_total += volume
        if volume_total == 0:
            return None
        return money_flow_volume / volume_total

    def _calculate_obv_slope(rows: list[dict], period: int = _DIRECT_OBV_SLOPE_DAYS) -> float | None:
        if len(rows) < period + 1:
            return None
        obv = 0.0
        values: list[float] = []
        for index in range(len(rows) - period, len(rows)):
            prev_close = as_float(rows[index - 1].get("close"))
            current_close = as_float(rows[index].get("close"))
            volume = as_float(rows[index].get("volume")) or 0.0
            if prev_close is None or current_close is None:
                continue
            if current_close > prev_close:
                obv += volume
            elif current_close < prev_close:
                obv -= volume
            values.append(obv)
        return linear_slope(values)

    def _compute_support_resistance(rows: list[dict], lookback_days: int = _DIRECT_SR_LOOKBACK_DAYS) -> tuple[float | None, float | None]:
        slice_rows = rows[-lookback_days:]
        if not slice_rows:
            return None, None
        lows = [as_float(row.get("low")) for row in slice_rows if as_float(row.get("low")) is not None]
        highs = [as_float(row.get("high")) for row in slice_rows if as_float(row.get("high")) is not None]
        return (safe_round(min(lows), 2) if lows else None, safe_round(max(highs), 2) if highs else None)

    def _classify_direct_signal(row: dict) -> str:
        ai_pick = bool(row.get("AI_Pick"))
        accumulation = bool(row.get("Accumulation"))
        vol_breakout = bool(row.get("VolBreakout"))
        above_200dma = bool(row.get("Above200DMA"))
        day_change = as_float(row.get("DayChange_%"))
        rs_rating = as_float(row.get("RS_rating_1_100"))

        if ai_pick and accumulation and vol_breakout and above_200dma:
            return "STRONG BUY"
        if ai_pick and accumulation and above_200dma:
            return "BUY"
        if day_change is not None and day_change < 0 and rs_rating is not None and rs_rating < 40 and not accumulation and not above_200dma:
            return "SELL"
        if not ai_pick and not accumulation and not vol_breakout and day_change is not None and day_change < 0:
            return "AVOID"
        return "HOLD"

    def _intraday_signal(rows: list[dict]) -> dict:
        if not rows:
            return {
                "prob": None,
                "momentum": None,
                "ret1": None,
                "ret6": None,
                "dayRet": None,
                "vwapDist": None,
                "timestamp": None,
            }

        closes = [as_float(row.get("close")) for row in rows if as_float(row.get("close")) is not None]
        volumes = [as_float(row.get("volume")) for row in rows if as_float(row.get("volume")) is not None]
        latest = rows[-1]
        ret1 = percent_change(closes[-1], closes[-2]) if len(closes) > 1 else None
        ret6 = percent_change(closes[-1], closes[-7]) if len(closes) > 6 else None
        recent_volume_avg = mean(volumes[-5:]) if len(volumes) >= 5 else None
        latest_volume = as_float(latest.get("volume"))
        vol_ratio5 = latest_volume / recent_volume_avg if recent_volume_avg not in (None, 0) and latest_volume is not None else None
        rsi14 = compute_rsi(closes, 14)
        slope = linear_slope(closes[-12:]) if len(closes) >= 12 else None
        session_open = as_float(rows[0].get("open"))
        day_ret = percent_change(closes[-1], session_open) if closes and session_open not in (None, 0) else None

        cumulative_tpv = 0.0
        cumulative_volume = 0.0
        for row in rows:
            high = as_float(row.get("high"))
            low = as_float(row.get("low"))
            close = as_float(row.get("close"))
            volume = as_float(row.get("volume"))
            if None in (high, low, close, volume):
                continue
            cumulative_tpv += ((high + low + close) / 3) * volume
            cumulative_volume += volume
        vwap = cumulative_tpv / cumulative_volume if cumulative_volume else None
        vwap_dist = percent_change(closes[-1], (vwap or 0) + 0.000001) if closes and vwap is not None else None

        probability = mean([
            min_max_normalize(ret1 or 0, -1.5, 1.5),
            min_max_normalize(ret6 or 0, -3, 3),
            min_max_normalize(day_ret or 0, -3, 3),
            min_max_normalize(vwap_dist or 0, -2, 2),
            min_max_normalize((vol_ratio5 or 1) - 1, 0, 2),
            min_max_normalize((rsi14 or 50) - 50, -20, 20),
            min_max_normalize(slope or 0, -2, 2),
        ])
        momentum = mean([
            probability * 100 if probability is not None else None,
            min_max_normalize(day_ret or 0, -3, 3) * 100,
            min_max_normalize(vwap_dist or 0, -2, 2) * 100,
        ])

        return {
            "prob": safe_round(probability, 4),
            "momentum": safe_round(momentum, 2),
            "ret1": safe_round(ret1, 3),
            "ret6": safe_round(ret6, 3),
            "dayRet": safe_round(day_ret, 3),
            "vwapDist": safe_round(vwap_dist, 3),
            "timestamp": latest.get("date"),
        }

    def _sector_name(symbol: str) -> str:
        bare = str(symbol or "").replace("NSE:", "").replace("BSE:", "").replace("-EQ", "").replace("-INDEX", "").upper()
        if bare.endswith("INDEX") or "INDEX" in bare:
            return "Index"
        return direct_sector_map.get(bare, "Unknown")

    def _build_direct_row(symbol: str, benchmark_rows: list[dict]) -> dict | None:
        daily_rows = _history_rows(symbol, "D", _DIRECT_DAILY_HISTORY_DAYS)
        if len(daily_rows) < 80:
            return None

        intraday_rows = _history_rows(symbol, _DIRECT_INTRADAY_RESOLUTION, _DIRECT_INTRADAY_HISTORY_DAYS)
        intraday = _intraday_signal(intraday_rows)

        closes = [as_float(row.get("close")) for row in daily_rows if as_float(row.get("close")) is not None]
        volumes = [as_float(row.get("volume")) for row in daily_rows if as_float(row.get("volume")) is not None]
        latest = daily_rows[-1]
        previous = daily_rows[-2] if len(daily_rows) > 1 else None
        current_price = as_float(latest.get("close"))
        day_open = as_float(latest.get("open"))
        prev_close = as_float(previous.get("close")) if previous else None
        day_change_pct = percent_change(current_price, prev_close)
        window_rows = daily_rows[-_DIRECT_LOOKBACK_52W:]
        high52 = max(as_float(row.get("high")) for row in window_rows if as_float(row.get("high")) is not None)
        low52 = min(as_float(row.get("low")) for row in window_rows if as_float(row.get("low")) is not None)
        dist_high = ((high52 - current_price) / high52) * 100 if current_price is not None and high52 else None
        dist_low = ((current_price - low52) / low52) * 100 if current_price is not None and low52 else None
        near_high = dist_high is not None and dist_high <= _DIRECT_NEAR_PCT_52W
        near_low = dist_low is not None and dist_low <= _DIRECT_NEAR_PCT_52W
        avg20 = mean(volumes[-20:])
        latest_volume = as_float(latest.get("volume"))
        vol_ratio = latest_volume / avg20 if avg20 not in (None, 0) and latest_volume is not None else None
        vol_spike = vol_ratio is not None and vol_ratio >= _DIRECT_VOL_SPIKE_MULT
        vol_breakout = vol_ratio is not None and vol_ratio >= _DIRECT_VOL_BREAKOUT_MULT
        ma50 = rolling_mean(closes, _DIRECT_MA50)
        ma200 = rolling_mean(closes, _DIRECT_MA200)
        above_200dma = current_price > ma200 if current_price is not None and ma200 is not None else None
        high20 = max(as_float(row.get("high")) for row in daily_rows[-20:] if as_float(row.get("high")) is not None)
        breakout20d = current_price is not None and current_price >= high20
        gap_up_pct = percent_change(day_open, prev_close)
        gap_up = gap_up_pct is not None and gap_up_pct >= _DIRECT_GAP_UP_PCT
        sma5 = rolling_mean(closes, 5)
        reversal_low = bool(near_low and sma5 is not None and current_price is not None and current_price > sma5)
        atr = _calculate_atr(daily_rows, _DIRECT_ATR_PERIOD)
        stop_loss = current_price - _DIRECT_ATR_STOP_MULT * atr if current_price is not None and atr is not None else None
        risk_per_share = current_price - stop_loss if current_price is not None and stop_loss is not None else None
        qty = int(_DIRECT_RISK_PER_TRADE_INR // risk_per_share) if risk_per_share not in (None, 0) and risk_per_share > 0 else None
        support, resistance = _compute_support_resistance(daily_rows, _DIRECT_SR_LOOKBACK_DAYS)
        cmf20 = _calculate_cmf(daily_rows, _DIRECT_CMF_PERIOD)
        obv_slope = _calculate_obv_slope(daily_rows, _DIRECT_OBV_SLOPE_DAYS)
        rsi14 = compute_rsi(closes, 14)
        accum_score = mean([
            (min_max_normalize(cmf20 or 0, -0.2, 0.2) or 0) * 100,
            (min_max_normalize(obv_slope or 0, -1000000, 1000000) or 0) * 100,
            (min_max_normalize(vol_ratio or 0, 0.5, 2.5) or 0) * 100,
            (min_max_normalize(rsi14 or 50, 40, 80) or 0) * 100,
        ])
        accumulation = bool(accum_score is not None and accum_score >= _DIRECT_ACCUM_SCORE_MIN and above_200dma)
        rs3 = None
        rs6 = None
        if len(benchmark_rows) > 63 and len(closes) > 63:
            rs3 = percent_change(current_price, closes[-64])
            benchmark_rs3 = percent_change(as_float(benchmark_rows[-1].get("close")), as_float(benchmark_rows[-64].get("close")))
            if rs3 is not None and benchmark_rs3 is not None:
                rs3 -= benchmark_rs3
        if len(benchmark_rows) > 126 and len(closes) > 126:
            rs6 = percent_change(current_price, closes[-127])
            benchmark_rs6 = percent_change(as_float(benchmark_rows[-1].get("close")), as_float(benchmark_rows[-127].get("close")))
            if rs6 is not None and benchmark_rs6 is not None:
                rs6 -= benchmark_rs6
        ai_prob = mean([
            intraday.get("prob"),
            min_max_normalize(vol_ratio or 0, 0.5, 2.5),
            min_max_normalize(rsi14 or 50, 40, 80),
            min_max_normalize(rs3 or 0, -10, 10),
            min_max_normalize(rs6 or 0, -15, 15),
            min_max_normalize(day_change_pct or 0, -5, 5),
        ])
        ai_pick = ai_prob is not None and ai_prob >= _DIRECT_AI_PROB_MIN
        score = 0
        if near_high:
            score += 35
        if breakout20d:
            score += 20
        if vol_spike:
            score += 15
        if above_200dma:
            score += 10
        if vol_breakout:
            score += 10
        if gap_up:
            score += 5
        if accumulation:
            score += 5
        if (intraday.get("momentum") or 0) > 60:
            score += 10

        row = {
            "Ticker": _normalize_symbol(symbol),
            "LastDate": str(latest.get("date") or "")[:10] or None,
            "DayOpen": safe_round(day_open, 2),
            "CurrentPrice": safe_round(current_price, 2),
            "DayClosePrice": safe_round(current_price, 2),
            "DayChange_%": safe_round(day_change_pct, 3),
            "Sector": _sector_name(symbol),
            "DeliveryPct": None,
            "52W_High": safe_round(high52, 2),
            "52W_Low": safe_round(low52, 2),
            "DistFrom52WHigh_%": safe_round(dist_high, 4),
            "DistFrom52WLow_%": safe_round(dist_low, 4),
            "Volume": latest_volume,
            "AvgVol20": safe_round(avg20, 0),
            "VolRatio": safe_round(vol_ratio, 3),
            "VolSpike": bool(vol_spike),
            "VolBreakout": bool(vol_breakout),
            "MA50": safe_round(ma50, 2),
            "MA200": safe_round(ma200, 2),
            "Above200DMA": above_200dma,
            "GapUp": bool(gap_up),
            "GapUp_%": safe_round(gap_up_pct, 3),
            "Near52WHigh": bool(near_high),
            "Near52WLow": bool(near_low),
            "Breakout20D": bool(breakout20d),
            "ReversalFromLow": bool(reversal_low),
            "Support": support,
            "Resistance": resistance,
            "RS_3M_vs_NIFTY_%": safe_round(rs3, 3),
            "RS_6M_vs_NIFTY_%": safe_round(rs6, 3),
            "CMF20": safe_round(cmf20, 4),
            "OBV_Slope20": safe_round(obv_slope, 2),
            "RSI14": safe_round(rsi14, 2),
            "AccumScore": safe_round(accum_score, 1),
            "Accumulation": bool(accumulation),
            "ATR14": safe_round(atr, 3),
            "StopLoss_ATR": safe_round(stop_loss, 2),
            "RiskPerShare": safe_round(risk_per_share, 2),
            "Qty_for_Risk(INR)": qty,
            "AI_Prob": safe_round(ai_prob, 4),
            "AI_Pick": bool(ai_pick),
            "Intraday_AI_Prob": intraday.get("prob"),
            "IntradayMomentumScore": intraday.get("momentum"),
            "IntradayRet_1Bar_%": intraday.get("ret1"),
            "IntradayRet_6Bar_%": intraday.get("ret6"),
            "DayRetFromOpen_%": intraday.get("dayRet"),
            "VWAPDist_%": intraday.get("vwapDist"),
            "IntradayTimestamp": intraday.get("timestamp"),
            "Score": score,
            "RS_rating_1_100": None,
        }
        row["Signal"] = _classify_direct_signal(row)
        return row

    def _add_direct_rs_rating(rows: list[dict]) -> list[dict]:
        valid = sorted(
            as_float(row.get("RS_3M_vs_NIFTY_%"))
            for row in rows
            if as_float(row.get("RS_3M_vs_NIFTY_%")) is not None
        )
        if not valid:
            return rows

        rated_rows: list[dict] = []
        total = len(valid)
        for row in rows:
            value = as_float(row.get("RS_3M_vs_NIFTY_%"))
            if value is None:
                rated_rows.append({**row, "RS_rating_1_100": None})
                continue
            position = bisect_left(valid, value)
            rating = round(((position + 1) / total) * 99 + 1)
            rated_rows.append({**row, "RS_rating_1_100": rating})
        return rated_rows

    def _direct_live_row(row: dict) -> dict:
        combined_ai = mean([as_float(row.get("Intraday_AI_Prob")), as_float(row.get("AI_Prob"))])
        return {
            "Ticker": row.get("Ticker"),
            "Sector": row.get("Sector") or "Unknown",
            "Signal": row.get("Signal") or "HOLD",
            "Price": row.get("CurrentPrice"),
            "Change_%": row.get("DayChange_%"),
            "Gap_%": row.get("GapUp_%"),
            "DayRetFromOpen_%": row.get("DayRetFromOpen_%"),
            "VWAPDist_%": row.get("VWAPDist_%"),
            "IntradayRet_1Bar_%": row.get("IntradayRet_1Bar_%"),
            "IntradayRet_6Bar_%": row.get("IntradayRet_6Bar_%"),
            "Intraday_AI_Prob": row.get("Intraday_AI_Prob"),
            "AI_Prob": row.get("AI_Prob"),
            "Combined_AI_Prob": safe_round(combined_ai, 4),
            "IntradayMomentumScore": row.get("IntradayMomentumScore"),
            "RS_rating_1_100": row.get("RS_rating_1_100"),
            "Score": row.get("Score"),
            "Volume": row.get("Volume"),
            "IntradayTimestamp": row.get("IntradayTimestamp"),
        }

    def _direct_overview(rows: list[dict]) -> dict:
        strong_buy = sum(1 for row in rows if row.get("Signal") == "STRONG BUY")
        buy = sum(1 for row in rows if row.get("Signal") == "BUY")
        sell = sum(1 for row in rows if row.get("Signal") == "SELL")
        avoid = sum(1 for row in rows if row.get("Signal") == "AVOID")
        accumulation = sum(1 for row in rows if row.get("Accumulation"))
        ai_picks = sum(1 for row in rows if row.get("AI_Pick"))
        sector_counts: dict[str, int] = {}
        for row in rows:
            sector = str(row.get("Sector") or "Unknown")
            sector_counts[sector] = sector_counts.get(sector, 0) + 1
        best_sector = max(sector_counts, key=sector_counts.get) if sector_counts else None
        return {
            "totalScanned": len(rows),
            "strongBuy": strong_buy,
            "buy": buy,
            "sell": sell,
            "avoid": avoid,
            "accumulation": accumulation,
            "aiPicks": ai_picks,
            "bestSector": best_sector,
        }

    def _previous_session(candles: list[list]) -> dict:
        today = date.today()
        previous_candle = None

        for candle in reversed(candles):
            candle_date = datetime.utcfromtimestamp(int(candle[0])).date()
            if candle_date < today:
                previous_candle = candle
                break

        if previous_candle is None:
            previous_candle = candles[-2] if len(candles) >= 2 else (candles[-1] if candles else None)

        if not previous_candle:
            return {"date": None, "open": None, "close": None}

        candle_date = datetime.utcfromtimestamp(int(previous_candle[0])).date().isoformat()
        return {
            "date": candle_date,
            "open": as_float(previous_candle[1]),
            "close": as_float(previous_candle[4]),
        }

    def _signal_from_candles(candles: list[list]) -> dict:
        closes = [as_float(candle[4]) for candle in candles if len(candle) >= 5]
        closes = [value for value in closes if value is not None]

        if len(closes) < 60:
            return {
                "signal": "Skip",
                "score": 0,
                "note": "Insufficient long-range daily history",
                "history_points": len(closes),
            }

        last_close = closes[-1]
        sma20 = simple_moving_average(closes, 20)
        sma50 = simple_moving_average(closes, 50)
        sma200 = simple_moving_average(closes, 200)
        rsi14 = compute_rsi(closes, 14)
        ret20 = percent_change(last_close, closes[-21] if len(closes) > 20 else None)
        ret60 = percent_change(last_close, closes[-61] if len(closes) > 60 else None)
        ret252 = percent_change(last_close, closes[-253] if len(closes) > 252 else None)
        high52 = max(closes[-252:]) if len(closes) >= 252 else max(closes)
        low52 = min(closes[-252:]) if len(closes) >= 252 else min(closes)

        score = 0
        notes: list[str] = []

        if sma20 is not None:
            if last_close > sma20:
                score += 1
                notes.append("price above 20DMA")
            else:
                score -= 1
        if sma50 is not None:
            if last_close > sma50:
                score += 1
                notes.append("price above 50DMA")
            else:
                score -= 1
        if sma200 is not None:
            if last_close > sma200:
                score += 2
                notes.append("price above 200DMA")
            else:
                score -= 2

        if sma20 is not None and sma50 is not None:
            score += 1 if sma20 > sma50 else -1
        if sma50 is not None and sma200 is not None:
            score += 2 if sma50 > sma200 else -2

        for ret in (ret20, ret60, ret252):
            if ret is None:
                continue
            if ret > 0:
                score += 1
            elif ret < 0:
                score -= 1

        if last_close >= high52 * 0.92:
            score += 1
            notes.append("trading near 52-week high")
        if last_close <= low52 * 1.08:
            score -= 1

        if rsi14 is not None:
            if 55 <= rsi14 <= 68:
                score += 1
                notes.append("healthy RSI momentum")
            elif rsi14 >= 75 or rsi14 <= 25:
                score -= 1
            elif rsi14 < 45:
                score -= 1

        if score >= 6:
            signal = "Strong Buy"
        elif score <= -6:
            signal = "Strong Sell"
        elif abs(score) <= 1:
            signal = "Skip"
        else:
            signal = "Strong Hold"

        return {
            "signal": signal,
            "score": score,
            "note": ", ".join(notes[:3]) if notes else "Mixed technical structure",
            "history_points": len(closes),
        }

    def _history_analytics_for_symbol(symbol: str) -> tuple[dict, bool]:
        cache_key = _normalize_symbol(symbol)
        cached = _get_cached_history_signal(cache_key)
        if cached is not None:
            return cached, False

        candles = _daily_history_for_signal(cache_key)
        payload = {
            "yesterday": _previous_session(candles),
            **_signal_from_candles(candles),
            "history_window_years": _ANALYTICS_HISTORY_YEARS,
        }
        _set_cached_history_signal(cache_key, payload)
        return payload, True

    def _quote_map(data: dict) -> dict[str, dict]:
        quotes: dict[str, dict] = {}
        for row in data.get("d", []) or []:
            if not isinstance(row, dict):
                continue
            payload = row.get("v") or {}
            symbol = _normalize_symbol(row.get("n") or payload.get("symbol"))
            if symbol:
                quotes[symbol] = payload
        return quotes

    @app.post("/api/symbols/analytics")
    def symbol_analytics() -> tuple[dict, int]:
        payload = request.get_json(silent=True) or {}
        raw_symbols = payload.get("symbols") or []
        if not isinstance(raw_symbols, list):
            return {"status": "error", "message": "symbols must be an array"}, 400

        symbols: list[str] = []
        seen: set[str] = set()
        for raw_symbol in raw_symbols:
            symbol = _normalize_symbol(raw_symbol)
            if symbol and symbol not in seen:
                seen.add(symbol)
                symbols.append(symbol)
            if len(symbols) >= _MAX_ANALYTICS_SYMBOLS:
                break

        if not symbols:
            return {"results": {}}, 200

        try:
            api = load_api()
            quote_payload = api.quotes(symbols)
            quotes = _quote_map(quote_payload)
        except Exception as exc:
            return {"status": "error", "message": f"Unable to load quote snapshot: {exc}"}, 400

        history_data: dict[str, dict] = {}
        cache_updated = False
        workers = min(6, len(symbols))
        with ThreadPoolExecutor(max_workers=max(workers, 1)) as executor:
            futures = {executor.submit(_history_analytics_for_symbol, symbol): symbol for symbol in symbols}
            for future in as_completed(futures):
                symbol = futures[future]
                try:
                    analytics_payload, updated = future.result()
                    history_data[symbol] = analytics_payload
                    cache_updated = cache_updated or updated
                except Exception as exc:
                    history_data[symbol] = {
                        "signal": "Skip",
                        "score": 0,
                        "note": f"Analytics unavailable: {exc}",
                        "history_points": 0,
                        "history_window_years": _ANALYTICS_HISTORY_YEARS,
                        "yesterday": {"date": None, "open": None, "close": None},
                    }

        if cache_updated:
            try:
                _persist_history_signal_cache()
            except Exception as exc:
                app.logger.warning("Unable to persist analytics cache: %s", exc)

        results: dict[str, dict] = {}
        for symbol in symbols:
            quote = quotes.get(symbol, {})
            history = history_data.get(symbol, {})
            results[symbol] = {
                "today": {
                    "open": as_float(quote.get("open_price")),
                    "high": as_float(quote.get("high_price")),
                    "low": as_float(quote.get("low_price")),
                    "ltp": as_float(quote.get("lp")),
                },
                "yesterday": history.get("yesterday", {"date": None, "open": None, "close": None}),
                "signal": history.get("signal", "Skip"),
                "signalScore": history.get("score", 0),
                "signalNote": history.get("note", "Mixed technical structure"),
                "historyPoints": history.get("history_points", 0),
                "historyWindowYears": history.get("history_window_years", _ANALYTICS_HISTORY_YEARS),
            }

        return {"results": results}, 200

    @app.post("/api/screener/direct")
    def direct_screener() -> tuple[dict, int]:
        payload = request.get_json(silent=True) or {}
        raw_symbols = payload.get("symbols") or []
        if not isinstance(raw_symbols, list):
            return {"status": "error", "message": "symbols must be an array"}, 400

        limit = min(int(payload.get("limit") or _MAX_DIRECT_SCREENER_SYMBOLS), _MAX_DIRECT_SCREENER_SYMBOLS)
        symbols: list[str] = []
        seen: set[str] = set()
        for raw_symbol in raw_symbols:
            symbol = _normalize_symbol(raw_symbol)
            if symbol and symbol not in seen:
                seen.add(symbol)
                symbols.append(symbol)
            if len(symbols) >= limit:
                break

        if not symbols:
            return {
                "status": "ok",
                "source": "fyers-direct",
                "overview": _direct_overview([]),
                "datasets": {"allRanked": [], "liveMarket": [], "errors": []},
            }, 200

        try:
            benchmark_rows = _history_rows(_DIRECT_BENCHMARK_SYMBOL, "D", _DIRECT_DAILY_HISTORY_DAYS)
        except Exception as exc:
            return {"status": "error", "message": f"Unable to load benchmark history: {exc}"}, 400

        rows: list[dict] = []
        errors: list[dict] = []
        workers = min(6, len(symbols))
        with ThreadPoolExecutor(max_workers=max(workers, 1)) as executor:
            futures = {executor.submit(_build_direct_row, symbol, benchmark_rows): symbol for symbol in symbols}
            for future in as_completed(futures):
                symbol = futures[future]
                try:
                    row = future.result()
                    if row is None:
                        errors.append({"Ticker": symbol, "Error": "Insufficient history for direct FYERS screener row."})
                        continue
                    rows.append(row)
                except Exception as exc:
                    errors.append({"Ticker": symbol, "Error": str(exc)})

        rated_rows = _add_direct_rs_rating(rows)
        ranked_rows = sorted(
            rated_rows,
            key=lambda row: ((as_float(row.get("Score")) or 0), (as_float(row.get("AI_Prob")) or 0)),
            reverse=True,
        )
        live_rows = sorted(
            (_direct_live_row(row) for row in ranked_rows),
            key=lambda row: as_float(row.get("Combined_AI_Prob")) or 0,
            reverse=True,
        )

        return {
            "status": "ok",
            "source": "fyers-direct",
            "overview": _direct_overview(ranked_rows),
            "datasets": {
                "allRanked": ranked_rows,
                "liveMarket": live_rows,
                "errors": errors,
            },
        }, 200

    def _unique_symbols(rows: list, keys: tuple[str, ...]) -> list[str]:
        out: list[str] = []
        seen: set[str] = set()
        for row in rows or []:
            if not isinstance(row, dict):
                continue
            value = ""
            for key in keys:
                if row.get(key):
                    value = _normalize_symbol(str(row.get(key)))
                    if value:
                        break
            if value and value not in seen:
                seen.add(value)
                out.append(value)
        return out

    def _load_predefined_rules() -> list[dict]:
        default_rules = [
            {
                "id": "indices",
                "name": "Indices",
                "symbols": [
                    "NSE:NIFTY50-INDEX",
                    "NSE:NIFTYBANK-INDEX",
                    "NSE:FINNIFTY-INDEX",
                    "NSE:MIDCPNIFTY-INDEX",
                    "NSE:BANKEX-INDEX",
                ],
            },
            {
                "id": "banking",
                "name": "Banking",
                "queries": ["HDFCBANK", "ICICIBANK", "SBIN", "AXISBANK", "KOTAKBANK", "INDUSINDBK"],
                "limit": 8,
            },
            {
                "id": "it",
                "name": "IT Leaders",
                "queries": ["TCS", "INFY", "HCLTECH", "WIPRO", "TECHM", "LTIM"],
                "limit": 8,
            },
        ]

        rules_path = Path(os.getenv("PREDEFINED_WATCHLIST_RULES_FILE", ".data/predefined_watchlists.json")).resolve()
        rules_json = os.getenv("PREDEFINED_WATCHLIST_RULES_JSON", "").strip()

        if rules_json:
            try:
                loaded = json.loads(rules_json)
                if isinstance(loaded, list) and loaded:
                    return loaded
            except Exception:
                app.logger.warning("Invalid PREDEFINED_WATCHLIST_RULES_JSON. Using defaults.")

        if rules_path.exists():
            try:
                loaded = json.loads(rules_path.read_text(encoding="utf-8"))
                if isinstance(loaded, list) and loaded:
                    return loaded
            except Exception:
                app.logger.warning("Invalid predefined rules file at %s. Using defaults.", rules_path)

        return default_rules

    def _build_predefined_lists() -> list[dict]:
        rules = _load_predefined_rules()
        predefined: list[dict] = []

        for idx, rule in enumerate(rules):
            if not isinstance(rule, dict):
                continue

            list_id = str(rule.get("id") or f"rule-{idx + 1}").strip().lower().replace(" ", "-")
            list_name = str(rule.get("name") or list_id).strip() or list_id
            limit = int(rule.get("limit", 30) or 30)

            symbols: list[str] = []
            seen: set[str] = set()

            explicit_symbols = rule.get("symbols") or []
            if isinstance(explicit_symbols, list):
                for raw in explicit_symbols:
                    sym = _normalize_symbol(raw)
                    if sym and sym not in seen:
                        seen.add(sym)
                        symbols.append(sym)
                        if len(symbols) >= limit:
                            break

            queries = rule.get("queries") or []
            if len(symbols) < limit and isinstance(queries, list):
                for query in queries:
                    if not query:
                        continue
                    try:
                        candidates = symbol_master.search(str(query), limit=max(limit, 30))
                    except Exception:
                        candidates = []
                    for item in candidates:
                        sym = _normalize_symbol(item.get("symbol", ""))
                        if sym and sym not in seen:
                            seen.add(sym)
                            symbols.append(sym)
                            if len(symbols) >= limit:
                                break
                    if len(symbols) >= limit:
                        break

            if symbols:
                predefined.append({
                    "id": list_id,
                    "name": list_name,
                    "symbols": symbols,
                })

        return predefined

    @app.get("/api/watchlists/catalog")
    def watchlist_catalog() -> tuple[dict, int]:
        local_watchlists = _load_watchlists()
        predefined_lists = _build_predefined_lists()

        smart_lists = []
        source = {"broker_connected": False, "message": "Using fallback data"}
        try:
            api = load_api()
            holdings = api.holdings()
            positions = api.positions()
            tradebook = api.tradebook()

            holdings_symbols = _unique_symbols(holdings.get("holdings", []) or [], ("symbol", "n"))
            positions_symbols = _unique_symbols(positions.get("netPositions", []) or [], ("symbol", "n", "tradingsymbol"))
            trades_symbols = _unique_symbols(tradebook.get("tradeBook", []) or [], ("symbol", "n", "tradingsymbol"))

            if holdings_symbols:
                smart_lists.append({
                    "id": "holdings",
                    "name": "From Holdings",
                    "symbols": holdings_symbols[:50],
                })
            if positions_symbols:
                smart_lists.append({
                    "id": "positions",
                    "name": "Open Positions",
                    "symbols": positions_symbols[:50],
                })
            if trades_symbols:
                smart_lists.append({
                    "id": "trades",
                    "name": "Recent Trades",
                    "symbols": trades_symbols[:50],
                })

            source = {"broker_connected": True, "message": "Live broker data"}
        except Exception as exc:
            # Keep API resilient even when auth/session is not available.
            source = {"broker_connected": False, "message": str(exc)}

        if not smart_lists:
            fallback = []
            for name, symbols in local_watchlists.items():
                fallback.append({
                    "id": f"wl-{name.lower().replace(' ', '-')}",
                    "name": name,
                    "symbols": (symbols or [])[:50],
                })
                if len(fallback) >= 3:
                    break
            smart_lists = fallback

        return {
            "tabs": {
                "my": {"watchlists": local_watchlists},
                "predefined": {"lists": predefined_lists},
                "smart": {"lists": smart_lists},
            },
            "source": source,
        }, 200

    @app.get("/api/watchlists")
    def list_watchlists() -> tuple[dict, int]:
        wl = _load_watchlists()
        return {"watchlists": wl}, 200

    @app.post("/api/watchlists")
    def create_watchlist() -> tuple[dict, int]:
        payload = request.get_json(silent=True) or {}
        name = str(payload.get("name", "")).strip()
        if not name:
            return {"status": "error", "message": "name is required"}, 400
        wl = _load_watchlists()
        if name in wl:
            return {"status": "error", "message": f"Watchlist '{name}' already exists"}, 409
        wl[name] = []
        _save_watchlists(wl)
        return {"status": "ok", "watchlists": wl}, 201

    @app.delete("/api/watchlists/<name>")
    def delete_watchlist(name: str) -> tuple[dict, int]:
        wl = _load_watchlists()
        if name not in wl:
            return {"status": "error", "message": "Watchlist not found"}, 404
        del wl[name]
        _save_watchlists(wl)
        return {"status": "ok", "watchlists": wl}, 200

    @app.post("/api/watchlists/<name>/symbols")
    def add_symbol_to_watchlist(name: str) -> tuple[dict, int]:
        payload = request.get_json(silent=True) or {}
        symbol = str(payload.get("symbol", "")).strip()
        if not symbol:
            return {"status": "error", "message": "symbol is required"}, 400
        wl = _load_watchlists()
        if name not in wl:
            return {"status": "error", "message": "Watchlist not found"}, 404
        if symbol not in wl[name]:
            wl[name].append(symbol)
            _save_watchlists(wl)
        return {"status": "ok", "symbols": wl[name]}, 200

    @app.delete("/api/watchlists/<name>/symbols/<path:symbol>")
    def remove_symbol_from_watchlist(name: str, symbol: str) -> tuple[dict, int]:
        wl = _load_watchlists()
        if name not in wl:
            return {"status": "error", "message": "Watchlist not found"}, 404
        wl[name] = [s for s in wl[name] if s != symbol]
        _save_watchlists(wl)
        return {"status": "ok", "symbols": wl[name]}, 200

    return app
