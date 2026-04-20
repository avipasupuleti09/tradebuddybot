from __future__ import annotations

import base64
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.parse import parse_qs, urlparse

import pyotp
import requests
from fyers_apiv3 import fyersModel

from .config import Settings


OTP_URL = "https://api-t2.fyers.in/vagator/v2/send_login_otp_v2"
VERIFY_OTP_URL = "https://api-t2.fyers.in/vagator/v2/verify_otp"
VERIFY_PIN_URL = "https://api-t2.fyers.in/vagator/v2/verify_pin_v2"
TOKEN_URL = "https://api-t1.fyers.in/api/v3/token"


@dataclass
class AuthResult:
    access_token: str
    refresh_token: str | None
    expires_at: str | None
    generated_at: str
    client_id: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class MissingBrokerPinError(RuntimeError):
    pass


class PinVerificationError(RuntimeError):
    pass


class FyersAuthService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.session = requests.Session()

    def login_with_totp(self, pin: str | None = None) -> AuthResult:
        request_key = self._send_login_otp()
        request_key = self._verify_totp(request_key)
        pin_token = self._verify_pin(request_key, pin)
        auth_code = self._get_auth_code(pin_token)
        token_response = self._exchange_auth_code(auth_code)

        access_token = token_response.get("access_token", "")
        if not access_token:
            raise RuntimeError(f"Token exchange failed: {token_response}")

        return AuthResult(
            access_token=access_token,
            refresh_token=token_response.get("refresh_token"),
            expires_at=token_response.get("expires_at"),
            generated_at=datetime.now(timezone.utc).isoformat(),
            client_id=self.settings.client_id,
        )

    def get_manual_auth_url(self) -> str:
        session_model = fyersModel.SessionModel(
            client_id=self.settings.client_id,
            redirect_uri=self.settings.redirect_uri,
            response_type="code",
            state="tradebuddy_state",
        )
        return session_model.generate_authcode()

    def exchange_auth_code(self, auth_code: str) -> AuthResult:
        token_response = self._exchange_auth_code(auth_code)
        access_token = token_response.get("access_token", "")
        if not access_token:
            raise RuntimeError(f"Token exchange failed: {token_response}")

        return AuthResult(
            access_token=access_token,
            refresh_token=token_response.get("refresh_token"),
            expires_at=token_response.get("expires_at"),
            generated_at=datetime.now(timezone.utc).isoformat(),
            client_id=self.settings.client_id,
        )

    def _send_login_otp(self) -> str:
        payload = {
            "fy_id": base64.b64encode(self.settings.user_id.encode("ascii")).decode("ascii"),
            "app_id": "2",
        }
        data = self._post_json(OTP_URL, payload)
        request_key = data.get("request_key")
        if not request_key:
            raise RuntimeError(f"Failed to send OTP: {data}")
        return request_key

    def _verify_totp(self, request_key: str) -> str:
        otp = pyotp.TOTP(self.settings.totp_key).now()
        payload = {
            "request_key": request_key,
            "otp": otp,
        }
        data = self._post_json(VERIFY_OTP_URL, payload)
        next_request_key = data.get("request_key")
        if not next_request_key:
            raise RuntimeError(f"Failed to verify TOTP: {data}")
        return next_request_key

    def _verify_pin(self, request_key: str, pin: str | None = None) -> str:
        broker_pin = str(pin or self.settings.pin or "").strip()
        if not broker_pin:
            raise MissingBrokerPinError("Enter your broker account PIN to continue.")

        pin_candidates = [
            broker_pin,
            base64.b64encode(broker_pin.encode("ascii")).decode("ascii"),
        ]
        last_error: Exception | None = None

        for identifier in pin_candidates:
            payload = {
                "request_key": request_key,
                "identity_type": "pin",
                "identifier": identifier,
            }
            try:
                data = self._post_json(VERIFY_PIN_URL, payload)
            except Exception as exc:
                last_error = exc
                continue

            token = data.get("data", {}).get("access_token")
            if token:
                return token

        if last_error:
            raise PinVerificationError("Broker PIN verification failed. Please check the PIN and try again.") from last_error
        raise PinVerificationError("Broker PIN verification failed. Please check the PIN and try again.")

    def _get_auth_code(self, pin_token: str) -> str:
        app_id = self.settings.client_id.split("-")[0]
        payload = {
            "fyers_id": self.settings.user_id,
            "app_id": app_id,
            "redirect_uri": self.settings.redirect_uri,
            "appType": "100",
            "code_challenge": "tradebuddy_challenge",
            "state": "tradebuddy_state",
            "scope": "",
            "nonce": "",
            "response_type": "code",
            "create_cookie": True,
        }
        headers = {
            "Authorization": f"Bearer {pin_token}",
            "Content-Type": "application/json",
        }
        response = self.session.post(TOKEN_URL, json=payload, headers=headers, timeout=20)
        response.raise_for_status()
        data = response.json()

        url = data.get("Url") or data.get("url")
        if not url:
            # Some FYERS responses return a short-lived auth token directly.
            direct_auth = data.get("data", {}).get("auth")
            if direct_auth:
                return direct_auth
            raise RuntimeError(f"Failed to get auth code URL: {data}")

        auth_code = parse_qs(urlparse(url).query).get("auth_code", [""])[0]
        if not auth_code:
            raise RuntimeError(f"auth_code not found in redirect URL: {url}")
        return auth_code

    def _exchange_auth_code(self, auth_code: str) -> dict[str, Any]:
        session_model = fyersModel.SessionModel(
            client_id=self.settings.client_id,
            secret_key=self.settings.secret_key,
            redirect_uri=self.settings.redirect_uri,
            response_type="code",
            grant_type="authorization_code",
        )
        session_model.set_token(auth_code)
        return session_model.generate_token()

    def _post_json(self, url: str, payload: dict[str, Any]) -> dict[str, Any]:
        response = self.session.post(url, json=payload, timeout=20)
        try:
            data = response.json()
        except ValueError:
            data = {}

        response.raise_for_status()
        if str(data.get("s", "")).lower() not in {"ok", "success"} and "request_key" not in data and "data" not in data:
            raise RuntimeError(f"Request failed for {url}: {data}")
        return data
