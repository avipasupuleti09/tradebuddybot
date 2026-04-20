from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


load_dotenv(override=True)


@dataclass(frozen=True)
class Settings:
    client_id: str
    secret_key: str
    redirect_uri: str
    user_id: str
    totp_key: str
    pin: str
    token_file: Path
    order_static_ip: str
    enforce_static_ip_check: bool
    ip_check_url: str
    paper_trade_mode: bool

    @classmethod
    def from_env(cls) -> "Settings":
        token_file = Path(os.getenv("FYERS_TOKEN_FILE", ".tokens/fyers_token.json")).resolve()
        return cls(
            client_id=_required("FYERS_CLIENT_ID"),
            secret_key=_required("FYERS_SECRET_KEY"),
            redirect_uri=_required("FYERS_REDIRECT_URI"),
            user_id=_required("FYERS_USER_ID"),
            totp_key=_required("FYERS_TOTP_KEY"),
            pin=_required("FYERS_PIN"),
            token_file=token_file,
            order_static_ip=os.getenv("FYERS_ORDER_STATIC_IP", "").strip(),
            enforce_static_ip_check=_as_bool(os.getenv("FYERS_ENFORCE_STATIC_IP_CHECK", "true")),
            ip_check_url=os.getenv("PUBLIC_IP_CHECK_URL", "https://api.ipify.org").strip(),
            paper_trade_mode=_as_bool(os.getenv("FYERS_PAPER_TRADE_MODE", "true")),
        )



def _required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise ValueError(f"Missing required environment variable: {name}")
    return value


def _as_bool(raw: str) -> bool:
    return raw.strip().lower() in {"1", "true", "yes", "on"}
