import { fyersDataSocket } from 'fyers-api-v3';

import { TokenStore } from './tokenStore.js';
import { normalizeSymbol } from './utils.js';

function toSocketAccessToken(settings, rawAccessToken) {
  if (!rawAccessToken) {
    throw new Error('No access token found. Please login first.');
  }
  if (rawAccessToken.includes(':')) {
    return rawAccessToken;
  }
  return `${settings.clientId}:${rawAccessToken}`;
}

export class QuoteStreamHub {
  constructor(settings) {
    this.settings = settings;
    this.tokenStore = new TokenStore(settings.tokenFile);
    this.socket = null;
    this.connected = false;
    this.connecting = null;
    this.clients = new Map();
    this.symbolRefCounts = new Map();
    this.depthSymbolRefCounts = new Map();
    this.nextClientId = 1;
  }

  async ensureSocket() {
    if (this.socket) {
      return this.socket;
    }
    if (this.connecting) {
      return this.connecting;
    }

    this.connecting = (async () => {
      const tokenPayload = await this.tokenStore.load();
      const accessToken = toSocketAccessToken(this.settings, String(tokenPayload?.access_token || '').trim());

      const socket = fyersDataSocket.getInstance(accessToken, '', false);
      socket.on('connect', () => {
        this.connected = true;
        const symbols = Array.from(this.symbolRefCounts.keys());
        const depthSymbols = Array.from(this.depthSymbolRefCounts.keys());
        if (symbols.length) {
          socket.subscribe(symbols, false, 1);
        }
        if (depthSymbols.length) {
          socket.subscribe(depthSymbols, true, 1);
        }
        if (symbols.length || depthSymbols.length) {
          socket.mode(socket.FullMode, 1);
        }
        socket.autoreconnect?.(6);
        for (const client of this.clients.values()) {
          this.send(client.ws, { mode: 'quotes', type: 'ready' });
        }
      });
      socket.on('message', (message) => {
        const symbol = normalizeSymbol(message?.symbol || message?.n || message?.v?.symbol);
        if (!symbol) {
          return;
        }
        const quote = { ...(message || {}), symbol };
        for (const client of this.clients.values()) {
          if (client.symbols.has(symbol)) {
            this.send(client.ws, { mode: 'quotes', type: 'quote', quote });
          }
        }
      });
      socket.on('error', (message) => {
        this.connected = false;
        for (const client of this.clients.values()) {
          this.send(client.ws, { mode: 'quotes', type: 'error', message: String(message?.message || message || 'Quote stream error') });
        }
      });
      socket.on('close', (message) => {
        this.connected = false;
        for (const client of this.clients.values()) {
          this.send(client.ws, { mode: 'quotes', type: 'closed', message: String(message?.message || message || 'Quote stream closed') });
        }
      });
      socket.connect();
      this.socket = socket;
      return socket;
    })();

    try {
      return await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  async registerClient(ws, symbols, options = {}) {
    const wantsDepth = Boolean(options.depth);
    const normalizedSymbols = new Set(
      (symbols || []).map((symbol) => normalizeSymbol(symbol)).filter(Boolean),
    );

    if (!normalizedSymbols.size) {
      throw new Error('No symbols provided for quote streaming.');
    }

    const clientId = this.nextClientId;
    this.nextClientId += 1;

    this.clients.set(clientId, { ws, symbols: normalizedSymbols, depth: wantsDepth });

    const subscribeNow = [];
    const depthSubscribeNow = [];
    for (const symbol of normalizedSymbols) {
      const currentCount = this.symbolRefCounts.get(symbol) || 0;
      if (currentCount === 0) {
        subscribeNow.push(symbol);
      }
      this.symbolRefCounts.set(symbol, currentCount + 1);

      if (wantsDepth) {
        const currentDepthCount = this.depthSymbolRefCounts.get(symbol) || 0;
        if (currentDepthCount === 0) {
          depthSubscribeNow.push(symbol);
        }
        this.depthSymbolRefCounts.set(symbol, currentDepthCount + 1);
      }
    }

    const socket = await this.ensureSocket();
    if (this.connected) {
      this.send(ws, { mode: 'quotes', type: 'ready' });
      if (subscribeNow.length) {
        try {
          socket.subscribe(subscribeNow, false, 1);
        } catch {
          // Keep existing subscriptions alive even if an incremental subscribe fails.
        }
      }
      if (depthSubscribeNow.length) {
        try {
          socket.subscribe(depthSubscribeNow, true, 1);
        } catch {
          // Keep existing subscriptions alive even if an incremental depth subscribe fails.
        }
      }
      if (subscribeNow.length || depthSubscribeNow.length) {
        try {
          socket.mode(socket.FullMode, 1);
        } catch {
          // Mode updates are best-effort for the shared socket.
        }
      }
    }

    return clientId;
  }

  unregisterClient(clientId) {
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    this.clients.delete(clientId);

    const unsubscribeNow = [];
    const depthUnsubscribeNow = [];
    for (const symbol of client.symbols) {
      const currentCount = this.symbolRefCounts.get(symbol) || 0;
      if (currentCount <= 1) {
        this.symbolRefCounts.delete(symbol);
        unsubscribeNow.push(symbol);
      } else {
        this.symbolRefCounts.set(symbol, currentCount - 1);
      }

      if (client.depth) {
        const currentDepthCount = this.depthSymbolRefCounts.get(symbol) || 0;
        if (currentDepthCount <= 1) {
          this.depthSymbolRefCounts.delete(symbol);
          depthUnsubscribeNow.push(symbol);
        } else {
          this.depthSymbolRefCounts.set(symbol, currentDepthCount - 1);
        }
      }
    }

    if (this.socket && this.connected && unsubscribeNow.length && typeof this.socket.unsubscribe === 'function') {
      try {
        this.socket.unsubscribe(unsubscribeNow, false, 1);
      } catch {
        // The SDK is stateful; failing to unsubscribe is less harmful than breaking the socket.
      }
    }

    if (this.socket && this.connected && depthUnsubscribeNow.length && typeof this.socket.unsubscribe === 'function') {
      try {
        this.socket.unsubscribe(depthUnsubscribeNow, true, 1);
      } catch {
        // The SDK is stateful; failing to unsubscribe is less harmful than breaking the socket.
      }
    }
  }

  send(ws, payload) {
    if (!ws || ws.readyState !== 1) {
      return;
    }
    ws.send(JSON.stringify(payload));
  }
}
