import http from 'node:http';
import https from 'node:https';
import { createRequire } from 'node:module';
import fyersPackage from 'fyers-api-v3';

const { fyersModel } = fyersPackage;
const require = createRequire(import.meta.url);
const { axiosInstance } = require('fyers-api-v3/apiService/apiService.js');
const FYERS_QUOTE_BATCH_SIZE = 10;
const QUOTE_CACHE_TTL_MS = 1500;
const QUOTE_REQUEST_GAP_MS = 250;
const inflightQuoteRequests = new Map();
const quoteResponseCache = new Map();
let quoteRequestQueue = Promise.resolve();
let lastQuoteRequestAt = 0;

// FYERS SDK shares one keep-alive axios agent across requests, which can trip
// TLS socket listener warnings under bursty dashboard refreshes. Use plain agents
// here so requests do not accumulate listeners on the same reused socket.
if (axiosInstance?.defaults) {
  axiosInstance.defaults.httpAgent = new http.Agent({ keepAlive: false });
  axiosInstance.defaults.httpsAgent = new https.Agent({ keepAlive: false });
}

function toUnixRange(dateValue, isEndOfDay = false) {
  const date = new Date(dateValue);
  const utcDate = isEndOfDay
    ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999)
    : Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0);
  return Math.floor(utcDate / 1000);
}

function normalizeQuoteSymbols(symbols) {
  const items = Array.isArray(symbols)
    ? symbols
    : String(symbols || '').split(',');

  return [...new Set(items.map((symbol) => String(symbol || '').trim()).filter(Boolean))];
}

function chunkItems(items, chunkSize) {
  const chunks = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function runQueuedQuoteRequest(task) {
  const queuedTask = quoteRequestQueue
    .catch(() => undefined)
    .then(async () => {
      const waitMs = Math.max(0, QUOTE_REQUEST_GAP_MS - (Date.now() - lastQuoteRequestAt));
      if (waitMs > 0) {
        await wait(waitMs);
      }
      const result = await task();
      lastQuoteRequestAt = Date.now();
      return result;
    });

  quoteRequestQueue = queuedTask.catch(() => undefined);
  return queuedTask;
}

export function createSessionClient({ clientId, redirectUri }) {
  const client = new fyersModel({ path: '', enableLogging: false });
  client.setAppId(clientId);
  client.setRedirectUrl(redirectUri);
  return client;
}

export class FyersApiService {
  constructor({ clientId, accessToken }) {
    this.accessToken = accessToken;
    this.client = new fyersModel({ path: '', enableLogging: false });
    this.client.setAppId(clientId);
    this.client.setAccessToken(accessToken);
  }

  profile() {
    return this.client.get_profile();
  }

  funds() {
    return this.client.get_funds();
  }

  holdings() {
    return this.client.get_holdings();
  }

  positions() {
    return this.client.get_positions();
  }

  orderbook() {
    return this.client.get_orders();
  }

  tradebook() {
    return this.client.get_tradebook();
  }

  async quotes(symbols) {
    const normalizedSymbols = normalizeQuoteSymbols(symbols);
    if (!normalizedSymbols.length) {
      return { s: 'ok', code: 200, message: '', d: [] };
    }

    const requestKey = `${this.accessToken}:${normalizedSymbols.join(',')}`;
    const cachedResponse = quoteResponseCache.get(requestKey);
    if (cachedResponse && cachedResponse.expiresAt > Date.now()) {
      return cachedResponse.payload;
    }

    if (inflightQuoteRequests.has(requestKey)) {
      return inflightQuoteRequests.get(requestKey);
    }

    const requestPromise = (async () => {
      const batches = chunkItems(normalizedSymbols, FYERS_QUOTE_BATCH_SIZE);
      let mergedResponse = null;

      for (const batch of batches) {
        const response = await runQueuedQuoteRequest(() => this.client.getQuotes(batch));
        if (!mergedResponse) {
          mergedResponse = {
            ...response,
            d: [...(response?.d || [])],
          };
          continue;
        }

        mergedResponse.d.push(...(response?.d || []));
      }

      const payload = mergedResponse || { s: 'ok', code: 200, message: '', d: [] };
      quoteResponseCache.set(requestKey, {
        expiresAt: Date.now() + QUOTE_CACHE_TTL_MS,
        payload,
      });
      return payload;
    })();

    inflightQuoteRequests.set(requestKey, requestPromise);
    try {
      return await requestPromise;
    } finally {
      inflightQuoteRequests.delete(requestKey);
    }
  }

  getPriceAlert(payload) {
    return this.client.getPriceAlert(payload);
  }

  createPriceAlert(payload) {
    return this.client.createPriceAlert(payload);
  }

  modifyPriceAlert(payload) {
    return this.client.modifyPriceAlert(payload);
  }

  togglePriceAlert(payload) {
    return this.client.togglePriceAlert(payload);
  }

  deletePriceAlert(payload) {
    return this.client.deletePriceAlert(payload);
  }

  history(symbol, resolution, startDate, endDate) {
    return this.client.getHistory({
      symbol,
      resolution,
      date_format: '0',
      range_from: String(toUnixRange(startDate, false)),
      range_to: String(toUnixRange(endDate, true)),
      cont_flag: '1',
    });
  }

  placeOrder(orderData) {
    return this.client.place_order(orderData);
  }
}
