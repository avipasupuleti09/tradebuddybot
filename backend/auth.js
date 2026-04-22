import { Buffer } from 'node:buffer';
import { generate } from 'otplib';

import { createSessionClient } from './api.js';

const OTP_URL = 'https://api-t2.fyers.in/vagator/v2/send_login_otp_v2';
const VERIFY_OTP_URL = 'https://api-t2.fyers.in/vagator/v2/verify_otp';
const VERIFY_PIN_URL = 'https://api-t2.fyers.in/vagator/v2/verify_pin_v2';
const TOKEN_URL = 'https://api-t1.fyers.in/api/v3/token';

export class MissingBrokerPinError extends Error {}
export class PinVerificationError extends Error {}

function buildAuthResult(settings, tokenResponse) {
  const accessToken = String(tokenResponse?.access_token || '').trim();
  if (!accessToken) {
    throw new Error(`Token exchange failed: ${JSON.stringify(tokenResponse || {})}`);
  }

  return {
    access_token: accessToken,
    refresh_token: tokenResponse?.refresh_token || null,
    expires_at: tokenResponse?.expires_at || null,
    generated_at: new Date().toISOString(),
    client_id: settings.clientId,
  };
}

async function postJson(url, payload, headers = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(payload),
  });

  const raw = await response.text();
  let data = {};
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = {};
    }
  }

  if (!response.ok) {
    throw new Error(data?.message || raw || `Request failed (${response.status})`);
  }

  const status = String(data?.s || '').toLowerCase();
  if (!['ok', 'success'].includes(status) && !('request_key' in data) && !data?.data) {
    throw new Error(`Request failed for ${url}: ${JSON.stringify(data)}`);
  }

  return data;
}

export class FyersAuthService {
  constructor(settings) {
    this.settings = settings;
  }

  getManualAuthUrl() {
    const client = createSessionClient(this.settings);
    return client.generateAuthCode({
      client_id: this.settings.clientId,
      redirect_uri: this.settings.redirectUri,
      state: 'tradebuddy_state',
    });
  }

  async exchangeAuthCode(authCode) {
    const client = createSessionClient(this.settings);
    const tokenResponse = await client.generate_access_token({
      client_id: this.settings.clientId,
      secret_key: this.settings.secretKey,
      auth_code: authCode,
    });

    return buildAuthResult(this.settings, tokenResponse);
  }

  async loginWithTotp(pin = null) {
    const requestKey = await this.#sendLoginOtp();
    const otpRequestKey = await this.#verifyTotp(requestKey);
    const pinToken = await this.#verifyPin(otpRequestKey, pin);
    const authCode = await this.#getAuthCode(pinToken);
    return this.exchangeAuthCode(authCode);
  }

  async #sendLoginOtp() {
    const payload = {
      fy_id: Buffer.from(this.settings.userId, 'ascii').toString('base64'),
      app_id: '2',
    };

    const data = await postJson(OTP_URL, payload);
    if (!data.request_key) {
      throw new Error(`Failed to send OTP: ${JSON.stringify(data)}`);
    }
    return data.request_key;
  }

  async #verifyTotp(requestKey) {
    const data = await postJson(VERIFY_OTP_URL, {
      request_key: requestKey,
      otp: await generate({ secret: this.settings.totpKey, strategy: 'totp' }),
    });

    if (!data.request_key) {
      throw new Error(`Failed to verify TOTP: ${JSON.stringify(data)}`);
    }
    return data.request_key;
  }

  async #verifyPin(requestKey, pin = null) {
    const brokerPin = String(pin || this.settings.pin || '').trim();
    if (!brokerPin) {
      throw new MissingBrokerPinError('Enter your broker account PIN to continue.');
    }

    const candidates = [
      brokerPin,
      Buffer.from(brokerPin, 'ascii').toString('base64'),
    ];

    let lastError = null;
    for (const identifier of candidates) {
      try {
        const data = await postJson(VERIFY_PIN_URL, {
          request_key: requestKey,
          identity_type: 'pin',
          identifier,
        });
        const token = data?.data?.access_token;
        if (token) {
          return token;
        }
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) {
      throw new PinVerificationError('Broker PIN verification failed. Please check the PIN and try again.');
    }

    throw new PinVerificationError('Broker PIN verification failed. Please check the PIN and try again.');
  }

  async #getAuthCode(pinToken) {
    const appId = this.settings.clientId.split('-')[0];
    const payload = {
      fyers_id: this.settings.userId,
      app_id: appId,
      redirect_uri: this.settings.redirectUri,
      appType: '100',
      code_challenge: 'tradebuddy_challenge',
      state: 'tradebuddy_state',
      scope: '',
      nonce: '',
      response_type: 'code',
      create_cookie: true,
    };

    const data = await postJson(TOKEN_URL, payload, {
      Authorization: `Bearer ${pinToken}`,
    });

    const redirectUrl = data.Url || data.url;
    if (!redirectUrl) {
      const directAuth = data?.data?.auth;
      if (directAuth) {
        return directAuth;
      }
      throw new Error(`Failed to get auth code URL: ${JSON.stringify(data)}`);
    }

    const parsed = new URL(redirectUrl);
    const authCode = parsed.searchParams.get('auth_code') || '';
    if (!authCode) {
      throw new Error(`auth_code not found in redirect URL: ${redirectUrl}`);
    }
    return authCode;
  }
}
