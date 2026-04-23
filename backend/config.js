import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const projectRoot = path.resolve(__dirname, '..');
export const projectEnvFile = path.join(projectRoot, '.env');

dotenv.config({ path: projectEnvFile });

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name) {
  const value = String(process.env[name] || '').trim();
  return value || null;
}

function asBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

let cachedSettings = null;

export function getSettings() {
  if (cachedSettings) {
    return cachedSettings;
  }

  cachedSettings = {
    clientId: required('FYERS_CLIENT_ID'),
    secretKey: required('FYERS_SECRET_KEY'),
    redirectUri: required('FYERS_REDIRECT_URI'),
    userId: required('FYERS_USER_ID'),
    totpKey: required('FYERS_TOTP_KEY'),
    pin: optional('FYERS_PIN'),
    tokenFile: path.resolve(projectRoot, process.env.FYERS_TOKEN_FILE || '.tokens/fyers_token.json'),
    orderStaticIp: String(process.env.FYERS_ORDER_STATIC_IP || '').trim(),
    enforceStaticIpCheck: asBool(process.env.FYERS_ENFORCE_STATIC_IP_CHECK, true),
    ipCheckUrl: String(process.env.PUBLIC_IP_CHECK_URL || 'https://api.ipify.org').trim(),
    paperTradeMode: asBool(process.env.FYERS_PAPER_TRADE_MODE, true),
  };

  return cachedSettings;
}

export function readFrontendUrl() {
  return String(process.env.FRONTEND_URL || '').trim().replace(/\/$/, '');
}

export function resolveProjectPath(relativePath) {
  return path.resolve(projectRoot, relativePath);
}
