import { useCallback, useEffect, useMemo, useState } from "react";

import {
  API_BASE,
  createPriceAlertRule,
  deletePriceAlertRule,
  fetchPriceAlerts,
  togglePriceAlertRule,
  updatePriceAlertRule,
} from "../api";

const DEFAULT_FORM = {
  name: "",
  symbol: "NSE:SBIN-EQ",
  comparisonType: "LTP",
  condition: "GT",
  value: "",
  notes: "",
  alertType: 1,
};

const DEFAULT_EVENT_CHANNELS = ["orders", "trades", "positions", "pricealerts", "edis"];
const COMPARISON_OPTIONS = ["LTP", "OPEN", "HIGH", "LOW", "CLOSE"];
const CONDITION_OPTIONS = ["GT", "GTE", "LT", "LTE", "EQ"];
const DEFAULT_STREAM_SYMBOLS = "NSE:NIFTY50-INDEX,NSE:SBIN-EQ,NSE:RELIANCE-EQ";

function toWsBase() {
  if (API_BASE) {
    return API_BASE.replace("http://", "ws://").replace("https://", "wss://");
  }
  return `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`;
}

function normalizeSymbols(raw) {
  return String(raw || "")
    .split(",")
    .map((symbol) => symbol.trim())
    .filter(Boolean);
}

function pushLimited(items, nextItem, max = 40) {
  return [nextItem, ...items].slice(0, max);
}

function formatDateTime(value, epoch) {
  const date = value ? new Date(value) : (epoch ? new Date(Number(epoch) * 1000) : null);
  if (!date || Number.isNaN(date.getTime())) {
    return "--";
  }
  return date.toLocaleString();
}

function readQuoteMetrics(quote = {}) {
  return {
    ltp: quote.lp ?? quote.ltp ?? quote.v?.lp ?? null,
    changePct: quote.chp ?? quote.percent_change ?? quote.v?.chp ?? null,
    bid: quote.bid_price1 ?? quote.bidPrice1 ?? quote.bid ?? quote.v?.bid_price1 ?? null,
    ask: quote.ask_price1 ?? quote.askPrice1 ?? quote.ask ?? quote.v?.ask_price1 ?? null,
    volume: quote.vol_traded_today ?? quote.volume ?? quote.v?.vol_traded_today ?? null,
  };
}

function formatNumber(value, fractionDigits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "--";
  }
  return number.toLocaleString("en-IN", { maximumFractionDigits: fractionDigits, minimumFractionDigits: fractionDigits });
}

function formatCompact(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "--";
  }
  return new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 2 }).format(number);
}

function alertStatusLabel(alert) {
  const raw = String(alert?.status ?? "").trim().toLowerCase();
  if (["1", "true", "enabled", "active"].includes(raw)) {
    return "Enabled";
  }
  if (["0", "false", "disabled", "inactive"].includes(raw)) {
    return "Disabled";
  }
  return alert?.status ?? "Unknown";
}

function ruleSummary(alert) {
  return `${alert.comparisonType || "--"} ${alert.condition || "--"} ${alert.value ?? "--"}`;
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([]);
  const [archive, setArchive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [editingAlertId, setEditingAlertId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyAlertId, setBusyAlertId] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const [streamSymbolsInput, setStreamSymbolsInput] = useState(DEFAULT_STREAM_SYMBOLS);
  const [depthEnabled, setDepthEnabled] = useState(true);
  const [quotesBySymbol, setQuotesBySymbol] = useState({});
  const [quoteFeed, setQuoteFeed] = useState([]);
  const [quoteStatus, setQuoteStatus] = useState("connecting");

  const [selectedChannels, setSelectedChannels] = useState(DEFAULT_EVENT_CHANNELS);
  const [eventFeed, setEventFeed] = useState([]);
  const [eventStatus, setEventStatus] = useState("connecting");

  const streamSymbols = useMemo(() => normalizeSymbols(streamSymbolsInput), [streamSymbolsInput]);
  const streamSymbolKey = streamSymbols.join(",");
  const eventChannelKey = selectedChannels.join(",");

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await fetchPriceAlerts(archive);
      setAlerts(Array.isArray(payload?.alerts) ? payload.alerts : []);
      setError("");
    } catch (err) {
      setError(err.message || "Failed to load price alerts.");
    } finally {
      setLoading(false);
    }
  }, [archive]);

  useEffect(() => {
    void loadAlerts();
  }, [loadAlerts]);

  useEffect(() => {
    if (!streamSymbolKey) {
      setQuoteStatus("idle");
      setQuotesBySymbol({});
      setQuoteFeed([]);
      return undefined;
    }

    let socket;
    let reconnectTimer;
    let cancelled = false;

    const connect = () => {
      if (cancelled) {
        return;
      }

      setQuoteStatus("connecting");
      const depthQuery = depthEnabled ? "&depth=1" : "";
      socket = new WebSocket(`${toWsBase()}/api/live?mode=quotes&symbols=${encodeURIComponent(streamSymbolKey)}${depthQuery}`);

      socket.onopen = () => {
        if (!cancelled) {
          setQuoteStatus("live");
        }
      };

      socket.onmessage = (event) => {
        if (cancelled) {
          return;
        }

        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "error" || payload.status === "error") {
            setQuoteStatus("error");
            return;
          }
          if (payload.type !== "quote" || !payload.quote) {
            return;
          }

          const symbol = payload.quote.symbol || payload.quote.n || payload.quote.v?.symbol;
          if (!symbol) {
            return;
          }

          setQuotesBySymbol((current) => ({
            ...current,
            [symbol]: {
              ...(current[symbol] || {}),
              ...payload.quote,
            },
          }));
          setQuoteFeed((current) => pushLimited(current, {
            id: `${symbol}-${Date.now()}`,
            symbol,
            receivedAt: new Date().toISOString(),
            quote: payload.quote,
          }));
        } catch {
          setQuoteStatus("error");
        }
      };

      socket.onerror = () => {
        if (!cancelled) {
          setQuoteStatus("error");
        }
      };

      socket.onclose = () => {
        if (!cancelled) {
          setQuoteStatus("reconnecting");
          reconnectTimer = window.setTimeout(connect, 3000);
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      if (socket) {
        socket.close();
      }
    };
  }, [depthEnabled, streamSymbolKey]);

  useEffect(() => {
    if (!eventChannelKey) {
      setEventStatus("idle");
      setEventFeed([]);
      return undefined;
    }

    let socket;
    let reconnectTimer;
    let cancelled = false;

    const connect = () => {
      if (cancelled) {
        return;
      }

      setEventStatus("connecting");
      socket = new WebSocket(`${toWsBase()}/api/live?mode=events&channels=${encodeURIComponent(eventChannelKey)}`);

      socket.onopen = () => {
        if (!cancelled) {
          setEventStatus("live");
        }
      };

      socket.onmessage = (event) => {
        if (cancelled) {
          return;
        }

        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "error" || payload.status === "error") {
            setEventStatus("error");
            return;
          }
          if (payload.type !== "event") {
            return;
          }

          setEventFeed((current) => pushLimited(current, {
            id: `${payload.eventType}-${Date.now()}`,
            eventType: payload.eventType || "general",
            receivedAt: new Date().toISOString(),
            payload: payload.payload,
          }));
        } catch {
          setEventStatus("error");
        }
      };

      socket.onerror = () => {
        if (!cancelled) {
          setEventStatus("error");
        }
      };

      socket.onclose = () => {
        if (!cancelled) {
          setEventStatus("reconnecting");
          reconnectTimer = window.setTimeout(connect, 3000);
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      if (socket) {
        socket.close();
      }
    };
  }, [eventChannelKey]);

  function handleFormChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: name === "alertType" ? Number(value) : value,
    }));
  }

  function resetForm() {
    setForm(DEFAULT_FORM);
    setEditingAlertId(null);
  }

  function startEdit(alert) {
    setEditingAlertId(alert.alertId);
    setForm({
      name: alert.name || "",
      symbol: alert.symbol || "",
      comparisonType: alert.comparisonType || "LTP",
      condition: alert.condition || "GT",
      value: String(alert.value ?? ""),
      notes: alert.notes || "",
      alertType: Number(alert.alertType || 1),
    });
    setFeedback("");
    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setFeedback("");
    setError("");

    try {
      const payload = {
        ...form,
        value: String(form.value).trim(),
      };

      if (editingAlertId) {
        await updatePriceAlertRule(editingAlertId, payload);
        setFeedback("Price alert updated.");
      } else {
        await createPriceAlertRule(payload);
        setFeedback("Price alert created.");
      }

      resetForm();
      await loadAlerts();
    } catch (err) {
      setError(err.message || "Failed to save price alert.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle(alertId) {
    setBusyAlertId(alertId);
    setFeedback("");
    setError("");
    try {
      await togglePriceAlertRule(alertId);
      setFeedback("Price alert toggled.");
      await loadAlerts();
    } catch (err) {
      setError(err.message || "Failed to toggle price alert.");
    } finally {
      setBusyAlertId(null);
    }
  }

  async function handleDelete(alertId) {
    if (!window.confirm("Delete this FYERS price alert?")) {
      return;
    }

    setBusyAlertId(alertId);
    setFeedback("");
    setError("");
    try {
      await deletePriceAlertRule(alertId);
      setFeedback("Price alert deleted.");
      if (editingAlertId === alertId) {
        resetForm();
      }
      await loadAlerts();
    } catch (err) {
      setError(err.message || "Failed to delete price alert.");
    } finally {
      setBusyAlertId(null);
    }
  }

  function toggleChannel(channel) {
    setSelectedChannels((current) => (
      current.includes(channel)
        ? current.filter((item) => item !== channel)
        : [...current, channel]
    ));
  }

  const quoteCards = useMemo(() => (
    streamSymbols.map((symbol) => ({ symbol, quote: quotesBySymbol[symbol] || null }))
  ), [quotesBySymbol, streamSymbols]);

  return (
    <>
      <div className="alerts-page-grid">
        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>{editingAlertId ? "Edit Price Alert" : "Create Price Alert"}</h3>
              <p>Uses FYERS price-alert APIs for create, update, enable or disable, and delete.</p>
            </div>
            <div className="alerts-toolbar">
              <button type="button" className="btn-secondary" onClick={() => setArchive((current) => !current)}>
                {archive ? "Show active alerts" : "Show archived alerts"}
              </button>
              <button type="button" className="btn-secondary" onClick={() => void loadAlerts()} disabled={loading}>
                {loading ? "Refreshing…" : "Refresh list"}
              </button>
            </div>
          </div>

          <form className="form-grid alerts-form" onSubmit={handleSubmit}>
            <div className="form-row-2">
              <label>
                Alert name
                <input name="name" value={form.name} onChange={handleFormChange} placeholder="e.g. SBIN breakout" />
              </label>
              <label>
                Symbol
                <input name="symbol" value={form.symbol} onChange={handleFormChange} placeholder="NSE:SBIN-EQ" />
              </label>
            </div>

            <div className="form-row-2">
              <label>
                Comparison type
                <select name="comparisonType" value={form.comparisonType} onChange={handleFormChange}>
                  {COMPARISON_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label>
                Condition
                <select name="condition" value={form.condition} onChange={handleFormChange}>
                  {CONDITION_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
            </div>

            <div className="form-row-2">
              <label>
                Trigger value
                <input name="value" value={form.value} onChange={handleFormChange} placeholder="e.g. 850" />
              </label>
              <label>
                Alert type
                <select name="alertType" value={form.alertType} onChange={handleFormChange}>
                  <option value={1}>1 - Price alert</option>
                </select>
              </label>
            </div>

            <label>
              Notes
              <textarea name="notes" value={form.notes} onChange={handleFormChange} rows={3} placeholder="Optional note shown with the alert" />
            </label>

            <div className="alerts-toolbar">
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? "Saving…" : editingAlertId ? "Update alert" : "Create alert"}
              </button>
              {editingAlertId ? (
                <button type="button" className="btn-secondary" onClick={resetForm}>
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>

          {feedback ? <p className="success-text">{feedback}</p> : null}
          {error ? <p className="error-text">{error}</p> : null}
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>Broker Event Stream</h3>
              <p>Live order, trade, position, EDIS, and price-alert notifications from FYERS over websocket.</p>
            </div>
            <span className={`alerts-status-pill is-${eventStatus}`}>{eventStatus}</span>
          </div>

          <div className="alerts-toggle-list" style={{ marginBottom: 16 }}>
            {DEFAULT_EVENT_CHANNELS.map((channel) => (
              <button
                key={channel}
                type="button"
                className={`alerts-toggle-chip${selectedChannels.includes(channel) ? " active" : ""}`}
                onClick={() => toggleChannel(channel)}
              >
                {channel}
              </button>
            ))}
          </div>

          <div className="alerts-stream-log">
            {eventFeed.length ? eventFeed.map((entry) => (
              <div key={entry.id} className="alerts-stream-item">
                <div className="alerts-stream-item-head">
                  <strong>{entry.eventType}</strong>
                  <span>{formatDateTime(entry.receivedAt)}</span>
                </div>
                <pre className="alerts-stream-raw">{JSON.stringify(entry.payload, null, 2)}</pre>
              </div>
            )) : <div className="alerts-empty">No broker events received yet.</div>}
          </div>
        </div>
      </div>

      <div className="table-panel">
        <div className="table-panel-head">
          <div>
            <h3>{archive ? "Archived Price Alerts" : "Active Price Alerts"}</h3>
            <p>{alerts.length} FYERS alert{alerts.length === 1 ? "" : "s"} available.</p>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Symbol</th>
              <th>Rule</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((alert) => (
              <tr key={alert.alertId}>
                <td>
                  <div className="alerts-table-primary">{alert.name || "Untitled"}</div>
                  <div className="alerts-table-sub">ID {alert.alertId}</div>
                </td>
                <td>{alert.symbol || "--"}</td>
                <td>{ruleSummary(alert)}</td>
                <td>{alertStatusLabel(alert)}</td>
                <td>{formatDateTime(alert.createdAt, alert.createdEpoch)}</td>
                <td>
                  <div className="alerts-action-row">
                    <button type="button" className="btn-secondary" onClick={() => startEdit(alert)}>
                      Edit
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => void handleToggle(alert.alertId)} disabled={busyAlertId === alert.alertId}>
                      Toggle
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => void handleDelete(alert.alertId)} disabled={busyAlertId === alert.alertId}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && alerts.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: "center", color: "var(--text-muted)", padding: 24 }}>
                  No price alerts available for this view.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="alerts-stream-grid">
        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>Market Quote Stream</h3>
              <p>Uses the FYERS data websocket via the app backend. Depth mode adds market-depth ticks for the same symbols.</p>
            </div>
            <span className={`alerts-status-pill is-${quoteStatus}`}>{quoteStatus}</span>
          </div>

          <div className="form-grid" style={{ marginBottom: 16 }}>
            <label>
              Symbols
              <input value={streamSymbolsInput} onChange={(event) => setStreamSymbolsInput(event.target.value)} placeholder="Comma separated symbols" />
            </label>
            <label className="alerts-checkbox-row">
              <input type="checkbox" checked={depthEnabled} onChange={(event) => setDepthEnabled(event.target.checked)} />
              Include depth updates
            </label>
          </div>

          <div className="alerts-quote-grid">
            {quoteCards.map(({ symbol, quote }) => {
              const metrics = readQuoteMetrics(quote || {});
              return (
                <div key={symbol} className="alerts-quote-card">
                  <div className="alerts-quote-symbol">{symbol}</div>
                  <div className="alerts-quote-ltp">{metrics.ltp == null ? "--" : formatNumber(metrics.ltp)}</div>
                  <div className={`alerts-quote-change ${Number(metrics.changePct || 0) >= 0 ? "up" : "dn"}`}>
                    {metrics.changePct == null ? "--" : `${Number(metrics.changePct).toFixed(2)}%`}
                  </div>
                  <div className="alerts-quote-meta">
                    <span>Bid {metrics.bid == null ? "--" : formatNumber(metrics.bid)}</span>
                    <span>Ask {metrics.ask == null ? "--" : formatNumber(metrics.ask)}</span>
                    <span>Vol {metrics.volume == null ? "--" : formatCompact(metrics.volume)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="alerts-stream-log">
            {quoteFeed.length ? quoteFeed.map((entry) => (
              <div key={entry.id} className="alerts-stream-item">
                <div className="alerts-stream-item-head">
                  <strong>{entry.symbol}</strong>
                  <span>{formatDateTime(entry.receivedAt)}</span>
                </div>
                <pre className="alerts-stream-raw">{JSON.stringify(entry.quote, null, 2)}</pre>
              </div>
            )) : <div className="alerts-empty">Waiting for quote updates.</div>}
          </div>
        </div>
      </div>
    </>
  );
}