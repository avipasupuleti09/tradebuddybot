const API_BASE = import.meta.env.VITE_API_BASE || "";

export { API_BASE };

async function request(path, options = {}) {
  try {
    return await fetch(`${API_BASE}${path}`, options);
  } catch {
    throw new Error("Cannot reach the backend API. Ensure the Node server is running and reachable.");
  }
}

async function parse(response) {
  const contentType = response.headers.get("content-type") || "";
  const raw = await response.text();
  let data = null;

  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    if (data?.message) {
      throw new Error(data.message);
    }
    if (contentType.includes("text/html")) {
      throw new Error(`Backend returned HTML (${response.status}) instead of JSON. Ensure the Node server is running and reachable.`);
    }
    throw new Error(raw || `Request failed (${response.status})`);
  }

  if (data !== null) {
    return data;
  }

  if (!raw) {
    return {};
  }

  if (contentType.includes("text/html")) {
    throw new Error("Backend returned HTML instead of JSON. Ensure the Node server is running and reachable.");
  }

  throw new Error("Received an invalid response from the backend API.");
}

export async function login(pin) {
  const response = await request(`/api/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ pin }),
  });

  const data = await response.json();
  if (response.status === 202 && data.auth_url) {
    window.location.href = data.auth_url;
    return { redirected: true };
  }

  if (!response.ok) {
    throw new Error(data.message || "Login failed");
  }

  return data;
}

export async function fetchSession() {
  const response = await request(`/api/session`);
  return parse(response);
}

export async function fetchAccountProfile() {
  const response = await request(`/api/profile`);
  return parse(response);
}

export async function saveAccountProfile(payload) {
  const response = await request(`/api/profile`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parse(response);
}

export async function fetchDashboard() {
  const response = await request(`/api/dashboard`);
  return parse(response);
}

export async function fetchPnlHistory(days = 180) {
  const response = await request(`/api/pnl-history?days=${encodeURIComponent(days)}`);
  return parse(response);
}

export async function logout() {
  const response = await request(`/api/logout`, {
    method: "POST",
  });
  return parse(response);
}

export async function placeOrder(payload) {
  const response = await request(`/api/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parse(response);
}

export async function runStrategy(payload) {
  const response = await request(`/api/strategy/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parse(response);
}

// ── Symbol search ──────────────────────────────────────────────────────────
export async function searchSymbols(query) {
  const response = await request(`/api/symbols/search?q=${encodeURIComponent(query)}&limit=30`);
  return parse(response);
}

// ── All NSE symbols ────────────────────────────────────────────────────────
export async function fetchAllNseSymbols() {
  const response = await request(`/api/symbols/all`);
  return parse(response);
}

export async function fetchNseSymbolAnalytics(symbols) {
  const response = await request(`/api/symbols/analytics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbols }),
  });
  return parse(response);
}

export async function fetchDirectScreener(symbols, limit = 350) {
  const response = await request(`/api/screener/direct`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbols, limit }),
  });
  return parse(response);
}

// ── Quotes ─────────────────────────────────────────────────────────────────
export async function fetchQuotes(symbols) {
  const response = await request(`/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`);
  return parse(response);
}

// ── History for chart ──────────────────────────────────────────────────────
export async function fetchHistory(symbol, resolution = "5", days = 5) {
  const response = await request(`/api/history?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&days=${days}`);
  return parse(response);
}

// ── Watchlist CRUD ─────────────────────────────────────────────────────────
export async function fetchWatchlists() {
  const response = await request(`/api/watchlists`);
  return parse(response);
}

export async function fetchWatchlistCatalog() {
  const response = await request(`/api/watchlists/catalog`);
  return parse(response);
}

export async function fetchPriceAlerts(archive = false) {
  const response = await request(`/api/alerts/price${archive ? "?archive=1" : ""}`);
  return parse(response);
}

export async function createPriceAlertRule(payload) {
  const response = await request(`/api/alerts/price`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parse(response);
}

export async function updatePriceAlertRule(alertId, payload) {
  const response = await request(`/api/alerts/price/${encodeURIComponent(alertId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parse(response);
}

export async function togglePriceAlertRule(alertId) {
  const response = await request(`/api/alerts/price/${encodeURIComponent(alertId)}/toggle`, {
    method: "PUT",
  });
  return parse(response);
}

export async function deletePriceAlertRule(alertId) {
  const response = await request(`/api/alerts/price/${encodeURIComponent(alertId)}`, {
    method: "DELETE",
  });
  return parse(response);
}

export async function createWatchlist(name) {
  const response = await request(`/api/watchlists`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return parse(response);
}

export async function deleteWatchlist(name) {
  const response = await request(`/api/watchlists/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
  return parse(response);
}

export async function addSymbolToWatchlist(name, symbol) {
  const response = await request(`/api/watchlists/${encodeURIComponent(name)}/symbols`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol }),
  });
  return parse(response);
}

export async function removeSymbolFromWatchlist(name, symbol) {
  const response = await request(`/api/watchlists/${encodeURIComponent(name)}/symbols/${encodeURIComponent(symbol)}`, {
    method: "DELETE",
  });
  return parse(response);
}

// ── NSE Scanner API ────────────────────────────────────────────────────────
// In dev, Vite proxies /scanner-api/* -> localhost:8001/api/*
// In production, configure a reverse proxy the same way.
const SCANNER_PREFIX = "/scanner-api";

async function scannerRequest(path, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120_000); // 2 min timeout
  try {
    const response = await fetch(`${SCANNER_PREFIX}${path}`, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      signal: controller.signal,
      ...options,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Scanner request failed: ${response.status}`);
    }
    return response.json();
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Scanner request timed out after 2 minutes. The backend may still be processing — try refreshing.");
    if (err.message.includes("Scanner request failed")) throw err;
    throw new Error("Cannot reach scanner backend. Ensure it is running (npm run dev starts it automatically).");
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getScannerDashboard(limit = 300) {
  return scannerRequest(`/dashboard?limit=${limit}`);
}

export async function runScannerScan(limit = 300, payload = null) {
  return scannerRequest(`/scan/run?limit=${limit}`, {
    method: "POST",
    body: payload ? JSON.stringify(payload) : undefined,
  });
}

export async function getScannerLive(limit = 25, payload = null) {
  if (!payload) {
    return scannerRequest(`/live?limit=${limit}`);
  }
  return scannerRequest(`/live?limit=${limit}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
