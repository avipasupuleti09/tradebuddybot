import fyersPackage from 'fyers-api-v3';

import { TokenStore } from './tokenStore.js';

const { fyersOrderSocket } = fyersPackage;

const DEFAULT_EVENT_CHANNELS = ['orders', 'trades', 'positions', 'edis', 'pricealerts'];
const EVENT_CHANNEL_ALIASES = {
  order: 'orders',
  orders: 'orders',
  trade: 'trades',
  trades: 'trades',
  position: 'positions',
  positions: 'positions',
  edi: 'edis',
  edis: 'edis',
  alert: 'pricealerts',
  alerts: 'pricealerts',
  pricealert: 'pricealerts',
  'price-alert': 'pricealerts',
  'price-alerts': 'pricealerts',
  pricealerts: 'pricealerts',
};

function toSocketAccessToken(settings, rawAccessToken) {
  if (!rawAccessToken) {
    throw new Error('No access token found. Please login first.');
  }
  if (rawAccessToken.includes(':')) {
    return rawAccessToken;
  }
  return `${settings.clientId}:${rawAccessToken}`;
}

function normalizeEventChannel(channel) {
  return EVENT_CHANNEL_ALIASES[String(channel || '').trim().toLowerCase()] || null;
}

function normalizeEventChannels(channels) {
  const normalized = new Set();
  for (const channel of channels || []) {
    const value = normalizeEventChannel(channel);
    if (value) {
      normalized.add(value);
    }
  }
  return normalized.size ? normalized : new Set(DEFAULT_EVENT_CHANNELS);
}

function inferGeneralEventType(message) {
  if (!message || typeof message !== 'object') {
    return 'general';
  }

  const keys = Object.keys(message).map((key) => String(key).toLowerCase());
  if (keys.includes('edis')) {
    return 'edis';
  }
  if (keys.includes('pricealerts') || keys.includes('price_alerts') || keys.includes('pricealert') || keys.includes('price_alert')) {
    return 'pricealerts';
  }
  return 'general';
}

function extractGeneralPayload(message, eventType) {
  if (!message || typeof message !== 'object') {
    return message;
  }

  if (eventType === 'edis') {
    return message.edis || message;
  }
  if (eventType === 'pricealerts') {
    return message.pricealerts || message.price_alerts || message.pricealert || message.price_alert || message;
  }
  return message;
}

export class OrderEventHub {
  constructor(settings) {
    this.settings = settings;
    this.tokenStore = new TokenStore(settings.tokenFile);
    this.socket = null;
    this.connected = false;
    this.connecting = null;
    this.clients = new Map();
    this.channelRefCounts = new Map();
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

      const socket = new fyersOrderSocket(accessToken, '', false);
      socket.on('connect', () => {
        this.connected = true;
        const channels = Array.from(this.channelRefCounts.keys());
        if (channels.length) {
          socket.subscribe(channels);
        }
        socket.autoreconnect?.(6);
        for (const client of this.clients.values()) {
          this.send(client.ws, { mode: 'events', type: 'ready', channels: Array.from(client.channels) });
        }
      });
      socket.on('orders', (payload) => {
        this.broadcastEvent('orders', payload);
      });
      socket.on('trades', (payload) => {
        this.broadcastEvent('trades', payload);
      });
      socket.on('positions', (payload) => {
        this.broadcastEvent('positions', payload);
      });
      socket.on('general', (message) => {
        const eventType = inferGeneralEventType(message);
        this.broadcastEvent(eventType, extractGeneralPayload(message, eventType));
      });
      socket.on('error', (message) => {
        this.connected = false;
        for (const client of this.clients.values()) {
          this.send(client.ws, { mode: 'events', type: 'error', message: String(message?.message || message || 'Broker event stream error') });
        }
      });
      socket.on('close', (message) => {
        this.connected = false;
        for (const client of this.clients.values()) {
          this.send(client.ws, { mode: 'events', type: 'closed', message: String(message?.message || message || 'Broker event stream closed') });
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

  async registerClient(ws, channels) {
    const normalizedChannels = normalizeEventChannels(channels);

    const clientId = this.nextClientId;
    this.nextClientId += 1;

    this.clients.set(clientId, { ws, channels: normalizedChannels });

    const subscribeNow = [];
    for (const channel of normalizedChannels) {
      const currentCount = this.channelRefCounts.get(channel) || 0;
      if (currentCount === 0) {
        subscribeNow.push(channel);
      }
      this.channelRefCounts.set(channel, currentCount + 1);
    }

    const socket = await this.ensureSocket();
    if (this.connected) {
      this.send(ws, { mode: 'events', type: 'ready', channels: Array.from(normalizedChannels) });
      if (subscribeNow.length) {
        try {
          socket.subscribe(subscribeNow);
        } catch {
          // Preserve the shared socket even if an incremental subscribe fails.
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
    for (const channel of client.channels) {
      const currentCount = this.channelRefCounts.get(channel) || 0;
      if (currentCount <= 1) {
        this.channelRefCounts.delete(channel);
        unsubscribeNow.push(channel);
      } else {
        this.channelRefCounts.set(channel, currentCount - 1);
      }
    }

    if (this.socket && this.connected && unsubscribeNow.length && typeof this.socket.unsubscribe === 'function') {
      try {
        this.socket.unsubscribe(unsubscribeNow);
      } catch {
        // A stale subscription is less harmful than breaking the shared order socket.
      }
    }
  }

  broadcastEvent(eventType, payload) {
    for (const client of this.clients.values()) {
      if (eventType === 'general' || client.channels.has(eventType)) {
        this.send(client.ws, { mode: 'events', type: 'event', eventType, payload });
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