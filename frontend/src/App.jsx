import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { NavLink, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { API_BASE, fetchDashboard, fetchPnlHistory, fetchQuotes, fetchSession, fetchAllNseSymbols, fetchNseSymbolAnalytics, login, logout, placeOrder, runStrategy } from "./api";

const MarketsPage = lazy(() => import("./pages/MarketsPage"));
const ScannerLayout = lazy(() => import("./pages/scanner/ScannerLayout"));
const ScannerCommandDeck = lazy(() => import("./components/scanner/ScannerCommandDeck"));
const ScannerExecution = lazy(() => import("./components/scanner/ScannerExecution"));
const ScannerDatasets = lazy(() => import("./components/scanner/ScannerDatasets"));
const ScannerVisuals = lazy(() => import("./components/scanner/ScannerVisuals"));
const ScannerFilterLab = lazy(() => import("./ScannerFilterLab"));


function PageLoader() {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 200 }}>
      <div className="scan-cold-spinner" />
    </div>
  );
}

const THEME_KEY = "tradebuddy-theme";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

const SETTINGS_KEY = "tradebuddy-ui-settings";
const AUTO_CAP_KEY = "tradebuddy-auto-cap";
const HOME_MARKET_SYMBOLS = [
  "NSE:NIFTY50-INDEX",
  "BSE:SENSEX-INDEX",
  "NSE:NIFTYBANK-INDEX",
  "BSE:BANKEX-INDEX",
  "NSE:FINNIFTY-INDEX",
  "NSE:NIFTYNXT50-INDEX",
  "NSE:MIDCPNIFTY-INDEX",
  "NSE:NIFTYMIDCAP100-INDEX",
  "NSE:NIFTYSMLCAP100-INDEX",
  "NSE:NIFTY500-INDEX",
  "NSE:INDIAVIX-INDEX",
];
const LEGACY_HOME_SYMBOLS = [
  "NSE:NIFTY50-INDEX",
  "NSE:NIFTYBANK-INDEX",
  "NSE:SBIN-EQ",
  "NSE:RELIANCE-EQ",
];
const HOME_MARKET_LABELS = {
  "NSE:NIFTY50-INDEX": "NIFTY50",
  "BSE:SENSEX-INDEX": "SENSEX",
  "NSE:NIFTYBANK-INDEX": "BANKNIFTY",
  "BSE:BANKEX-INDEX": "BANKEX",
  "NSE:FINNIFTY-INDEX": "FINNIFTY",
  "NSE:NIFTYNXT50-INDEX": "NIFTYNXT50",
  "NSE:MIDCPNIFTY-INDEX": "MIDCPNIFTY",
  "NSE:NIFTYMIDCAP100-INDEX": "NIFTY MIDCAP 100",
  "NSE:NIFTYSMLCAP100-INDEX": "NIFTY SMLCAP 100",
  "NSE:NIFTY500-INDEX": "NIFTY 500",
  "NSE:INDIAVIX-INDEX": "INDIAVIX",
};
const DEFAULT_SETTINGS = {
  watchlistSymbols: HOME_MARKET_SYMBOLS.join(","),
  liveUpdatesEnabled: true,
  reconnectSeconds: 3,
  strategyAutoInterval: 15,
  strategyAutoMaxRuns: 2,
  strategyDailyCap: 5,
};

const CHART_COLORS = ["#5d87ff", "#13deb9", "#ffae1f", "#fa896b", "#7460ee", "#2a3547"];

// ─── SVG Icon helpers ─────────────────────────────────────────────────────────
const _S = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" };
function IcoMenu()      { return <svg {..._S}><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>; }
function IcoDashboard() { return <svg {..._S}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>; }
function IcoBriefcase() { return <svg {..._S}><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>; }
function IcoOrders()    { return <svg {..._S}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="12" y2="17"/></svg>; }
function IcoStrategy()  { return <svg {..._S}><polygon points="13,2 3,14 12,14 11,22 21,10 12,10"/></svg>; }
function IcoSettings()  { return <svg {..._S}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>; }
function IcoLogout()    { return <svg {..._S}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16,17 21,12 16,7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>; }
function IcoBalance()   { return <svg {..._S}><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>; }
function IcoPositions() { return <svg {..._S}><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg>; }
function IcoMarkets()   { return <svg {..._S}><polyline points="22,7 13.5,15.5 8.5,10.5 2,17"/><polyline points="16,7 22,7 22,13"/></svg>; }
function IcoScanner()   { return <svg {..._S}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="11" y1="8" x2="11" y2="14"/></svg>; }
function IcoCommand()   { return <svg {..._S}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>; }
function IcoTune()      { return <svg {..._S}><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>; }
function IcoChart()     { return <svg {..._S}><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg>; }
function IcoTable()     { return <svg {..._S}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>; }
function IcoFilter()    { return <svg {..._S}><polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46"/></svg>; }
function IcoSun()       { return <svg {..._S}><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>; }
function IcoMoon()      { return <svg {..._S}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>; }

function normalizeSymbols(raw) {
  return raw
    .split(",")
    .map((symbol) => symbol.trim())
    .filter(Boolean);
}

function homeMarketLabel(symbol) {
  return HOME_MARKET_LABELS[symbol] || symbolLabel(symbol);
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function loadDailyAutoState() {
  try {
    const raw = window.localStorage.getItem(AUTO_CAP_KEY);
    if (!raw) {
      return { date: getTodayKey(), count: 0 };
    }
    const parsed = JSON.parse(raw);
    if (parsed.date !== getTodayKey()) {
      return { date: getTodayKey(), count: 0 };
    }
    return parsed;
  } catch {
    return { date: getTodayKey(), count: 0 };
  }
}

function saveDailyAutoState(state) {
  window.localStorage.setItem(AUTO_CAP_KEY, JSON.stringify(state));
}

function exportRowsToCsv(filename, rows, columns) {
  const header = columns.map((column) => column.label);
  const body = rows.map((row) =>
    columns.map((column) => {
      const value = column.exportValue ? column.exportValue(row) : column.render ? column.render(row) : row[column.key] ?? "";
      return `"${String(value).replaceAll('"', '""')}"`;
    })
  );
  const csv = [header, ...body].map((line) => line.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function Card({ title, value, subtitle }) {
  return (
    <div className="card">
      <h3>{title}</h3>
      <p className="value">{value}</p>
      {subtitle ? <p className="sub">{subtitle}</p> : null}
    </div>
  );
}

function formatCurrency(value) {
  const number = Number(value ?? 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(number);
}

function formatCompactCurrency(value) {
  const number = Number(value ?? 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(number);
}

function firstNumeric(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") {
      continue;
    }
    const number = Number(value);
    if (Number.isFinite(number)) {
      return number;
    }
  }
  return null;
}

function formatSignedCurrency(value, compact = false) {
  if (value === null || value === undefined) {
    return "N/A";
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "N/A";
  }
  const abs = compact ? formatCompactCurrency(Math.abs(number)) : formatCurrency(Math.abs(number));
  return `${number > 0 ? "+" : number < 0 ? "-" : ""}${abs}`;
}

function formatSignedPercent(value) {
  if (value === null || value === undefined) {
    return "N/A";
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "N/A";
  }
  return `${number > 0 ? "+" : ""}${number.toFixed(2)}%`;
}

function formatQty(value) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) {
    return "0";
  }
  return Number.isInteger(number)
    ? number.toLocaleString("en-IN")
    : number.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function symbolLabel(symbol) {
  return String(symbol || "")
    .replace(/^[A-Z]+:/, "")
    .replace(/-(EQ|INDEX)$/, "");
}

function symbolExchange(symbol) {
  return String(symbol || "").split(":")[0] || "NSE";
}

function valueToneClass(value) {
  const number = Number(value ?? 0);
  if (number > 0) return "positive";
  if (number < 0) return "negative";
  return "neutral";
}

function parseTradeDate(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    const asMs = numeric > 1e12 ? numeric : numeric * 1000;
    const numericDate = new Date(asMs);
    if (!Number.isNaN(numericDate.getTime())) {
      return numericDate;
    }
  }

  const parsed = new Date(String(value));
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  return null;
}

function toDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthLabel(date) {
  return date.toLocaleString("en-US", { month: "short" }).toUpperCase();
}

function normalizeHoldingRow(item, index) {
  const quantity = firstNumeric(item.quantity, item.qty, item.netQty) ?? 0;
  const buyAvg = firstNumeric(item.costPrice, item.buyAvg, item.avgPrice) ?? 0;
  const ltp = firstNumeric(item.ltp, item.lastPrice) ?? 0;
  const current = firstNumeric(item.marketVal) ?? quantity * ltp;
  const totalPnl = firstNumeric(item.pnl, item.pl, item.overallPnl) ?? 0;
  const invested = buyAvg > 0 && quantity > 0 ? buyAvg * quantity : current - totalPnl;
  const explicitDayPnl = firstNumeric(item.todayPnl, item.dayPnl, item.today_pl, item.todayPl);
  const unitChange = firstNumeric(item.ch, item.change, item.netChange);
  const dayPnl = explicitDayPnl ?? (unitChange !== null ? unitChange * quantity : null);
  const dayPct = firstNumeric(item.todayPnlPct, item.todayPlPct, item.dayPnlPct, item.dayPnlPercent, item.chp, item.changePercent);

  return {
    key: item.symbol || `holding-${index}`,
    symbol: item.symbol || "NSE:UNKNOWN",
    exchange: symbolExchange(item.symbol),
    displaySymbol: symbolLabel(item.symbol),
    quantity,
    buyAvg,
    ltp,
    invested,
    current,
    totalPnl,
    totalPnlPct: invested ? (totalPnl / invested) * 100 : 0,
    dayPnl,
    dayPct,
  };
}

function normalizePositionRow(item, index) {
  const quantity = firstNumeric(item.netQty, item.quantity, item.qty) ?? 0;
  const absoluteQty = Math.abs(quantity);
  const buyAvg = firstNumeric(item.buyAvg, item.sellAvg, item.avgPrice, item.costPrice) ?? 0;
  const ltp = firstNumeric(item.ltp, item.lastPrice) ?? 0;
  const current = firstNumeric(item.marketVal) ?? absoluteQty * ltp;
  const totalPnl = firstNumeric(item.pl, item.pnl, item.overallPnl) ?? 0;
  const invested = buyAvg > 0 && absoluteQty > 0 ? absoluteQty * buyAvg : Math.max(current - totalPnl, 0);
  const explicitDayPnl = firstNumeric(item.todayPnl, item.dayPnl, item.today_pl, item.todayPl);
  const unitChange = firstNumeric(item.ch, item.change, item.netChange);
  const dayPnl = explicitDayPnl ?? (unitChange !== null ? unitChange * absoluteQty : null);
  const dayPct = firstNumeric(item.todayPnlPct, item.todayPlPct, item.dayPnlPct, item.dayPnlPercent, item.chp, item.changePercent);

  return {
    key: item.symbol || `position-${index}`,
    symbol: item.symbol || "NSE:UNKNOWN",
    exchange: symbolExchange(item.symbol),
    displaySymbol: symbolLabel(item.symbol),
    quantity,
    buyAvg,
    ltp,
    invested,
    current,
    totalPnl,
    totalPnlPct: invested ? (totalPnl / invested) * 100 : 0,
    dayPnl,
    dayPct,
    sideLabel: quantity > 0 ? "Long" : quantity < 0 ? "Short" : "Flat",
  };
}

function summarizePortfolioRows(rows) {
  const invested = rows.reduce((total, row) => total + Number(row.invested || 0), 0);
  const current = rows.reduce((total, row) => total + Number(row.current || 0), 0);
  const totalPnl = rows.reduce((total, row) => total + Number(row.totalPnl || 0), 0);
  const rowsWithDayPnl = rows.filter((row) => row.dayPnl !== null && row.dayPnl !== undefined);
  const dayPnl = rowsWithDayPnl.length
    ? rowsWithDayPnl.reduce((total, row) => total + Number(row.dayPnl || 0), 0)
    : null;
  const previousValue = dayPnl !== null ? current - dayPnl : 0;
  const dayPct = dayPnl !== null && previousValue ? (dayPnl / previousValue) * 100 : dayPnl !== null ? 0 : null;

  return {
    invested,
    current,
    totalPnl,
    totalPnlPct: invested ? (totalPnl / invested) * 100 : 0,
    dayPnl,
    dayPct,
  };
}

function formatPriceCell(value) {
  return value === null || value === undefined ? "--" : formatCurrency(value);
}

function nseSignalClass(signal) {
  if (signal === "Strong Buy") return "signal-buy";
  if (signal === "Strong Sell") return "signal-sell";
  if (signal === "Strong Hold") return "signal-hold";
  return "signal-skip";
}

function compactSymbolLabel(value) {
  const raw = String(value || "");
  const symbol = raw.includes(":") ? raw.split(":")[1] : raw;
  return symbol.length > 14 ? `${symbol.slice(0, 14)}...` : symbol;
}

function formatTooltipValue(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? formatCurrency(number) : "--";
}

function ChartEmptyState({ title, subtitle }) {
  return (
    <div className="chart-empty-state">
      <strong>{title}</strong>
      <span>{subtitle}</span>
    </div>
  );
}

function HistoricalPnlHeatmap({ trades }) {
  const [symbolQuery, setSymbolQuery] = useState("");
  const [pnlMode, setPnlMode] = useState("combined");
  const weekLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const [fallbackRows, setFallbackRows] = useState([]);
  const [fallbackLoading, setFallbackLoading] = useState(false);
  const [fallbackError, setFallbackError] = useState("");

  const hasTradebookRows = Array.isArray(trades) && trades.length > 0;

  useEffect(() => {
    if (hasTradebookRows) {
      setFallbackRows([]);
      setFallbackError("");
      setFallbackLoading(false);
      return;
    }

    let cancelled = false;
    setFallbackLoading(true);
    setFallbackError("");

    fetchPnlHistory(180)
      .then((data) => {
        if (cancelled) return;
        setFallbackRows(Array.isArray(data.rows) ? data.rows : []);
      })
      .catch((error) => {
        if (cancelled) return;
        setFallbackRows([]);
        setFallbackError(error?.message || "Unable to load fallback historical P&L.");
      })
      .finally(() => {
        if (!cancelled) {
          setFallbackLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hasTradebookRows]);

  const sourceRows = hasTradebookRows ? trades : fallbackRows;

  const normalizedTrades = useMemo(() => sourceRows.map((item, index) => {
    const symbol = item.symbol || item.n || item.tradingsymbol || "NSE:UNKNOWN";
    const quantity = firstNumeric(item.qty, item.filledQty, item.tradedQty, item.orderQty, item.quantity) ?? 0;
    const buyAvg = firstNumeric(item.buyAvg, item.buyPrice, item.avgBuyPrice, item.avg_price) ?? null;
    const buyValue = firstNumeric(item.buyVal, item.buyValue, item.bv) ?? null;
    const sellAvg = firstNumeric(item.sellAvg, item.sellPrice, item.avgSellPrice) ?? null;
    const sellValue = firstNumeric(item.sellVal, item.sellValue, item.sv) ?? null;
    const realizedPnl = firstNumeric(item.realizedPnl, item.realisedPnl, item.realized_pl, item.realised_pl, item.rpnl, item.pl, item.pnl);
    const unrealizedPnl = firstNumeric(item.unrealizedPnl, item.unrealisedPnl, item.unrealized_pl, item.unrealised_pl, item.upnl);
    const chargesTaxes = firstNumeric(item.chargesAndTaxes, item.charges, item.charge, item.taxes, item.tax, item.brokerage) ?? 0;
    const otherCreditsDebits = firstNumeric(item.otherCreditsDebits, item.otherCreditDebit, item.other_credit_debit) ?? 0;
    const tradeDate = parseTradeDate(
      item.tradeDate
      || item.trade_date
      || item.tradeDateTime
      || item.trade_date_time
      || item.orderDateTime
      || item.order_date_time
      || item.date
      || item.updatedAt
      || item.createdAt
      || item.exchTradeTime
      || item.exchFeedTime
    );

    return {
      key: item.id || item.orderId || item.tradeId || `trade-${index}`,
      symbol,
      displaySymbol: symbolLabel(symbol),
      quantity,
      buyAvg,
      buyValue,
      sellAvg,
      sellValue,
      realizedPnl: realizedPnl ?? 0,
      unrealizedPnl: unrealizedPnl ?? 0,
      chargesTaxes,
      otherCreditsDebits,
      date: tradeDate,
      dateKey: tradeDate ? toDateKey(tradeDate) : null,
    };
  }).filter((item) => item.dateKey), [sourceRows]);

  const filteredTrades = useMemo(() => {
    const query = symbolQuery.trim().toUpperCase();
    if (!query) return normalizedTrades;
    return normalizedTrades.filter((item) => (
      item.symbol.toUpperCase().includes(query)
      || item.displaySymbol.toUpperCase().includes(query)
    ));
  }, [normalizedTrades, symbolQuery]);

  const sortedTrades = useMemo(() => [...filteredTrades].sort((a, b) => b.date - a.date), [filteredTrades]);
  const hasTradeHistory = sortedTrades.length > 0;

  const dateRange = useMemo(() => {
    if (!sortedTrades.length) {
      return { from: null, to: null };
    }
    const to = sortedTrades[0].date;
    const from = sortedTrades[sortedTrades.length - 1].date;
    return { from, to };
  }, [sortedTrades]);

  const dailyMap = useMemo(() => {
    const map = new Map();
    filteredTrades.forEach((trade) => {
      const existing = map.get(trade.dateKey) || { realized: 0, unrealized: 0, charges: 0, other: 0 };
      existing.realized += Number(trade.realizedPnl || 0);
      existing.unrealized += Number(trade.unrealizedPnl || 0);
      existing.charges += Number(trade.chargesTaxes || 0);
      existing.other += Number(trade.otherCreditsDebits || 0);
      map.set(trade.dateKey, existing);
    });
    return map;
  }, [filteredTrades]);

  const summary = useMemo(() => {
    let realized = 0;
    let unrealized = 0;
    let charges = 0;
    let other = 0;

    dailyMap.forEach((value) => {
      realized += value.realized;
      unrealized += value.unrealized;
      charges += value.charges;
      other += value.other;
    });

    return {
      realized,
      unrealized,
      charges,
      other,
      netRealized: realized - charges + other,
    };
  }, [dailyMap]);

  const dailyAggregateRows = useMemo(() => {
    const rows = [];
    dailyMap.forEach((value, dateKey) => {
      const combined = Number(value.realized || 0) + Number(value.unrealized || 0);
      rows.push({
        date: dateKey,
        realized: Number(value.realized || 0),
        unrealized: Number(value.unrealized || 0),
        combined,
        charges: Number(value.charges || 0),
        other: Number(value.other || 0),
        netRealized: Number(value.realized || 0) - Number(value.charges || 0) + Number(value.other || 0),
      });
    });
    rows.sort((a, b) => a.date.localeCompare(b.date));
    return rows;
  }, [dailyMap]);

  const months = useMemo(() => {
    if (!dateRange.from || !dateRange.to) {
      return [];
    }

    const result = [];
    const start = new Date(dateRange.from.getFullYear(), dateRange.from.getMonth(), 1);
    const end = new Date(dateRange.to.getFullYear(), dateRange.to.getMonth(), 1);
    const cursor = new Date(start);

    while (cursor <= end) {
      const year = cursor.getFullYear();
      const month = cursor.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const firstWeekdayMondayBased = (new Date(year, month, 1).getDay() + 6) % 7;
      const cells = [];

      for (let i = 0; i < firstWeekdayMondayBased; i += 1) {
        cells.push({ key: `empty-${year}-${month}-${i}`, empty: true });
      }

      for (let day = 1; day <= daysInMonth; day += 1) {
        const date = new Date(year, month, day);
        const key = toDateKey(date);
        const value = dailyMap.get(key) || { realized: 0, unrealized: 0 };
        const combined = value.realized + value.unrealized;
        const pnlValue = pnlMode === "realized" ? value.realized : pnlMode === "unrealized" ? value.unrealized : combined;

        cells.push({ key, day, pnlValue, realized: value.realized, unrealized: value.unrealized, combined });
      }

      result.push({ key: `${year}-${month + 1}`, label: monthLabel(cursor), cells });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    return result;
  }, [dateRange.from, dateRange.to, dailyMap, pnlMode]);

  const maxAbsPnl = useMemo(() => {
    const values = [];
    months.forEach((month) => {
      month.cells.forEach((cell) => {
        if (!cell.empty) values.push(Math.abs(Number(cell.pnlValue || 0)));
      });
    });
    return Math.max(...values, 1);
  }, [months]);

  const cellStyle = (value) => {
    const abs = Math.abs(Number(value || 0));
    if (abs < 0.01) {
      return { backgroundColor: "rgba(139, 157, 185, 0.18)" };
    }
    const strength = Math.min(0.95, 0.2 + (abs / maxAbsPnl) * 0.75);
    if (value > 0) {
      return { backgroundColor: `rgba(19, 222, 185, ${strength})` };
    }
    return { backgroundColor: `rgba(250, 137, 107, ${strength})` };
  };

  const lastUpdatedText = sortedTrades.length
    ? sortedTrades[0].date.toLocaleString("en-IN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "No tradebook data";

  const dateRangeText = dateRange.from && dateRange.to
    ? `${dateRange.from.toISOString().slice(0, 10)} ~ ${dateRange.to.toISOString().slice(0, 10)}`
    : "No history available";

  return (
    <div className="portfolio-heatmap-shell">
      <div className="portfolio-heatmap-toolbar">
        <label>
          <span>Segment</span>
          <select value="equity" disabled>
            <option value="equity">Equity</option>
          </select>
        </label>

        <label>
          <span>P&amp;L</span>
          <select value={pnlMode} onChange={(event) => setPnlMode(event.target.value)}>
            <option value="combined">Combined</option>
            <option value="realized">Realized</option>
            <option value="unrealized">Unrealized</option>
          </select>
        </label>

        <label>
          <span>Symbol</span>
          <input
            type="text"
            placeholder="eg. INFY"
            value={symbolQuery}
            onChange={(event) => setSymbolQuery(event.target.value)}
          />
        </label>

        <label>
          <span>Date range</span>
          <input
            type="text"
            readOnly
            value={dateRangeText}
          />
        </label>

        <button
          type="button"
          className="secondary-btn portfolio-heatmap-download-btn"
          disabled={!dailyAggregateRows.length}
          onClick={() => exportRowsToCsv("historical_pnl_daily", dailyAggregateRows, [
            { key: "date", label: "Date" },
            { key: "realized", label: "Realized P&L" },
            { key: "unrealized", label: "Unrealized P&L" },
            { key: "combined", label: "Combined P&L" },
            { key: "charges", label: "Charges & Taxes" },
            { key: "other", label: "Other Credits/Debits" },
            { key: "netRealized", label: "Net Realized P&L" },
          ])}
        >
          Download CSV
        </button>
      </div>

      <div className="portfolio-heatmap-range">
        <span className="portfolio-heatmap-range-icon">⏱</span>
        <span>{dateRange.from && dateRange.to ? `${dateRange.from.toISOString().slice(0, 10)} to ${dateRange.to.toISOString().slice(0, 10)}` : "No historical trade range"}</span>
        <span className="portfolio-heatmap-range-sep">|</span>
        <span>{`Last updated: ${lastUpdatedText}`}</span>
      </div>

      {hasTradeHistory ? (
        <>
          <div className="portfolio-heatmap-weekdays" aria-hidden="true">
            {weekLabels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>

          <div className="portfolio-heatmap-months">
            {months.map((month) => (
              <div key={month.key} className="portfolio-heatmap-month">
                <div className="portfolio-heatmap-grid">
                  {month.cells.map((cell) => (
                    <div
                      key={cell.key}
                      className={`portfolio-heatmap-cell${cell.empty ? " empty" : ""}`}
                      style={cell.empty ? undefined : cellStyle(cell.pnlValue)}
                      title={cell.empty ? "" : `${cell.key} | ${formatSignedCurrency(cell.pnlValue)}`}
                    />
                  ))}
                </div>
                <div className="portfolio-heatmap-month-label">{month.label}</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="portfolio-heatmap-empty">
          <h3>No historical P&amp;L data received</h3>
          <p>
            {fallbackLoading
              ? "Tradebook is empty. Loading fallback historical P&L from holdings history..."
              : fallbackError
                ? `Fallback request failed: ${fallbackError}`
                : "FYERS returned an empty tradebook and no holdings-history fallback points were generated yet."}
          </p>
        </div>
      )}

      <div className="portfolio-heatmap-summary">
        <div className="portfolio-heatmap-summary-item">
          <span>Realised P&amp;L</span>
          <strong className={valueToneClass(summary.realized)}>{formatSignedCurrency(summary.realized, true)}</strong>
        </div>
        <div className="portfolio-heatmap-summary-item">
          <span>Charges &amp; taxes</span>
          <strong>{formatCompactCurrency(summary.charges)}</strong>
        </div>
        <div className="portfolio-heatmap-summary-item">
          <span>Other credits &amp; debits</span>
          <strong className={valueToneClass(summary.other)}>{formatSignedCurrency(summary.other, true)}</strong>
        </div>
        <div className="portfolio-heatmap-summary-item">
          <span>Net realised P&amp;L</span>
          <strong className={valueToneClass(summary.netRealized)}>{formatSignedCurrency(summary.netRealized, true)}</strong>
        </div>
        <div className="portfolio-heatmap-summary-item">
          <span>Unrealised P&amp;L</span>
          <strong className={valueToneClass(summary.unrealized)}>{formatSignedCurrency(summary.unrealized, true)}</strong>
        </div>
      </div>

      <div className="portfolio-table-wrap">
        <table className="portfolio-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th className="numeric">Qty.</th>
              <th className="numeric">Buy avg.</th>
              <th className="numeric">Buy value</th>
              <th className="numeric">Sell avg.</th>
              <th className="numeric">Sell value</th>
              <th className="numeric">Realised P&amp;L</th>
              <th className="numeric">Unrealised P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {sortedTrades.slice(0, 20).map((row) => (
              <tr key={row.key}>
                <td>
                  <div className="portfolio-symbol-cell">
                    <span className="portfolio-symbol-main">{row.displaySymbol}</span>
                    <span className="portfolio-symbol-sub">{row.dateKey}</span>
                  </div>
                </td>
                <td className="numeric">{formatQty(row.quantity)}</td>
                <td className="numeric">{row.buyAvg === null ? "--" : formatCurrency(row.buyAvg)}</td>
                <td className="numeric">{row.buyValue === null ? "--" : formatCurrency(row.buyValue)}</td>
                <td className="numeric">{row.sellAvg === null ? "--" : formatCurrency(row.sellAvg)}</td>
                <td className="numeric">{row.sellValue === null ? "--" : formatCurrency(row.sellValue)}</td>
                <td className="numeric">
                  <div className={`portfolio-value-stack ${valueToneClass(row.realizedPnl)}`}>
                    <span>{formatSignedCurrency(row.realizedPnl)}</span>
                  </div>
                </td>
                <td className="numeric">
                  <div className={`portfolio-value-stack ${valueToneClass(row.unrealizedPnl)}`}>
                    <span>{formatSignedCurrency(row.unrealizedPnl)}</span>
                  </div>
                </td>
              </tr>
            ))}
            {sortedTrades.length === 0 ? (
              <tr>
                <td colSpan="8" className="portfolio-empty-row">No tradebook data available for the selected filter.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SmartChartsBoard({ pnlSeries, holdings }) {
  const isDarkTheme = document.documentElement.getAttribute("data-theme") === "dark";
  const gridStroke = isDarkTheme ? "rgba(149, 184, 235, 0.28)" : "#e7e2f7";
  const axisColor = isDarkTheme ? "#94aed1" : "#6c7c95";

  const allocation = holdings
    .map((item) => {
      const value = Number(item.marketVal ?? Number(item.quantity || 0) * Number(item.ltp || 0));
      return {
        name: item.symbol,
        value,
      };
    })
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const topPnl = holdings
    .map((item) => ({
      symbol: item.symbol,
      pnl: Number(item.pnl || 0),
    }))
    .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
    .slice(0, 6);

  const hasPnlSeries = pnlSeries.length > 1;
  const hasAnyPnLMovement = pnlSeries.some((item) => Math.abs(Number(item.total || 0)) > 0.0001);
  const hasAllocation = allocation.length > 0;
  const hasTopPnl = topPnl.length > 0;

  return (
    <section className="smartcharts-grid">
      <div className="chart-panel">
        <div className="section-head">
          <div>
            <h2>Portfolio P&amp;L Trend</h2>
            <p>Streaming over websocket.</p>
          </div>
        </div>
        <div className="chart-box">
          {hasPnlSeries ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={pnlSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 4" stroke={gridStroke} />
                <XAxis dataKey="time" tick={{ fontSize: 11, fill: axisColor }} minTickGap={24} />
                <YAxis
                  tick={{ fontSize: 11, fill: axisColor }}
                  width={72}
                  tickFormatter={(value) => `\u20b9${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`}
                />
                <Tooltip
                  formatter={(value) => [formatTooltipValue(value), "P&L"]}
                  labelFormatter={(label) => `Time: ${label || "--"}`}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke={hasAnyPnLMovement ? "#5d87ff" : "#8fa2c0"}
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState
              title="No trend data yet"
              subtitle="Live P&L points will appear after holdings and positions start updating."
            />
          )}
        </div>
      </div>

      <div className="chart-panel">
        <div className="section-head">
          <div>
            <h2>Holdings vs Positions</h2>
            <p>Component breakdown over time.</p>
          </div>
        </div>
        <div className="chart-box">
          {hasPnlSeries ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={pnlSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 4" stroke={gridStroke} />
                <XAxis dataKey="time" tick={{ fontSize: 11, fill: axisColor }} minTickGap={24} />
                <YAxis
                  tick={{ fontSize: 11, fill: axisColor }}
                  width={72}
                  tickFormatter={(value) => `\u20b9${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`}
                />
                <Tooltip formatter={(value) => [formatTooltipValue(value), ""]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="holdings" stroke="#7460ee" fill="#b7a4ff" fillOpacity={0.5} />
                <Area type="monotone" dataKey="positions" stroke="#13deb9" fill="#9df3e1" fillOpacity={0.45} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState
              title="No holdings/positions history"
              subtitle="This view needs more than one live snapshot to plot comparisons."
            />
          )}
        </div>
      </div>

      <div className="chart-panel">
        <div className="section-head">
          <div>
            <h2>Allocation Donut</h2>
            <p>Top holdings by market value.</p>
          </div>
        </div>
        <div className="chart-box">
          {hasAllocation ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={allocation}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={56}
                  outerRadius={92}
                  paddingAngle={2}
                  labelLine={false}
                >
                  {allocation.map((entry, index) => (
                    <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [formatTooltipValue(value), "Market Value"]} />
                <Legend formatter={(value) => compactSymbolLabel(value)} wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState
              title="No allocation yet"
              subtitle="Add holdings with market value to see sector concentration and risk spread."
            />
          )}
        </div>
      </div>

      <div className="chart-panel">
        <div className="section-head">
          <div>
            <h2>Top Holding P&amp;L</h2>
            <p>Largest movers right now.</p>
          </div>
        </div>
        <div className="chart-box">
          {hasTopPnl ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={topPnl} layout="vertical" margin={{ top: 8, right: 12, left: 24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 4" stroke={gridStroke} horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: axisColor }}
                  tickFormatter={(value) => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                />
                <YAxis type="category" dataKey="symbol" width={110} tick={{ fontSize: 10, fill: axisColor }} tickFormatter={compactSymbolLabel} />
                <Tooltip
                  formatter={(value) => [formatTooltipValue(value), "P&L"]}
                  labelFormatter={(label) => compactSymbolLabel(label)}
                />
                <Bar dataKey="pnl" radius={[0, 6, 6, 0]}>
                  {topPnl.map((item) => (
                    <Cell key={item.symbol} fill={item.pnl >= 0 ? "#13deb9" : "#fa896b"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState
              title="No P&L movers"
              subtitle="Top winners and losers will appear once holdings start posting profit/loss values."
            />
          )}
        </div>
      </div>
    </section>
  );
}

function PortfolioTabbedSection({ holdings, positions, trades }) {
  const [primaryTab, setPrimaryTab] = useState("holdings");
  const [performanceTab, setPerformanceTab] = useState("all");
  const [query, setQuery] = useState("");
  const [portfolioQuotes, setPortfolioQuotes] = useState({});

  const holdingRows = useMemo(() => holdings.map(normalizeHoldingRow), [holdings]);
  const positionRows = useMemo(() => positions.map(normalizePositionRow), [positions]);
  const activeRows = primaryTab === "holdings" ? holdingRows : positionRows;
  const rowsWithLiveDayPnl = useMemo(() => activeRows.map((row) => {
    if (row.dayPnl !== null && row.dayPnl !== undefined) {
      return row;
    }

    const quote = portfolioQuotes[row.symbol] || {};
    const quoteChange = firstNumeric(quote.ch, quote.change, quote.netChange);
    const quoteChangePct = firstNumeric(quote.chp, quote.changePercent, row.dayPct);
    const qty = Math.abs(Number(row.quantity || 0));
    const current = Number(row.current || 0);

    const derivedDayPnl = quoteChange !== null
      ? quoteChange * qty
      : quoteChangePct !== null && current
        ? current * (quoteChangePct / 100)
        : null;

    return {
      ...row,
      dayPnl: derivedDayPnl,
      dayPct: row.dayPct ?? quoteChangePct,
    };
  }), [activeRows, portfolioQuotes]);

  const summary = useMemo(() => summarizePortfolioRows(rowsWithLiveDayPnl), [rowsWithLiveDayPnl]);
  const gainersCount = activeRows.filter((row) => row.totalPnl > 0).length;
  const losersCount = activeRows.filter((row) => row.totalPnl < 0).length;
  const activeRowsCount = activeRows.length;
  const gainersShare = activeRowsCount ? (gainersCount / activeRowsCount) * 100 : 0;
  const losersShare = activeRowsCount ? (losersCount / activeRowsCount) * 100 : 0;

  useEffect(() => {
    const symbols = [...new Set(activeRows.map((row) => row.symbol).filter(Boolean))];
    if (!symbols.length) {
      setPortfolioQuotes({});
      return undefined;
    }

    let cancelled = false;
    fetchQuotes(symbols)
      .then((data) => {
        if (cancelled) return;
        const next = {};
        (data.d || []).forEach((item) => {
          const sym = item.n || item.v?.symbol;
          if (!sym) return;
          next[sym] = item.v || item;
        });
        setPortfolioQuotes(next);
      })
      .catch(() => {
        if (!cancelled) {
          setPortfolioQuotes({});
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeRows]);

  const filteredRows = useMemo(() => {
    let rows = rowsWithLiveDayPnl;
    if (performanceTab === "gainers") {
      rows = rows.filter((row) => row.totalPnl > 0);
    } else if (performanceTab === "losers") {
      rows = rows.filter((row) => row.totalPnl < 0);
    }

    const normalizedQuery = query.trim().toUpperCase();
    if (!normalizedQuery) {
      return rows;
    }

    return rows.filter((row) => (
      row.displaySymbol.toUpperCase().includes(normalizedQuery)
      || row.symbol.toUpperCase().includes(normalizedQuery)
      || row.exchange.toUpperCase().includes(normalizedQuery)
      || (row.sideLabel || "").toUpperCase().includes(normalizedQuery)
    ));
  }, [rowsWithLiveDayPnl, performanceTab, query]);

  return (
    <section className="table-panel portfolio-tab-shell">
      <div className="portfolio-primary-tabs">
        <button
          type="button"
          className={`portfolio-primary-tab${primaryTab === "positions" ? " active" : ""}`}
          onClick={() => {
            setPrimaryTab("positions");
            setPerformanceTab("all");
            setQuery("");
          }}
        >
          Positions
        </button>
        <button
          type="button"
          className={`portfolio-primary-tab${primaryTab === "holdings" ? " active" : ""}`}
          onClick={() => {
            setPrimaryTab("holdings");
            setPerformanceTab("all");
            setQuery("");
          }}
        >
          Holdings
        </button>
        <button
          type="button"
          className={`portfolio-primary-tab${primaryTab === "pnl-heatmap" ? " active" : ""}`}
          onClick={() => {
            setPrimaryTab("pnl-heatmap");
            setPerformanceTab("all");
            setQuery("");
          }}
        >
          P&amp;L Heatmap
        </button>
      </div>

      {primaryTab === "pnl-heatmap" ? (
        <HistoricalPnlHeatmap trades={trades} />
      ) : (
      <>
          <div className="portfolio-summary-strip">
            <div className="portfolio-summary-item">
              <span className="portfolio-summary-label">Invested</span>
              <strong className="portfolio-summary-value">{formatCompactCurrency(summary.invested)}</strong>
            </div>
            <div className="portfolio-summary-item">
              <span className="portfolio-summary-label">Current</span>
              <strong className="portfolio-summary-value">{formatCompactCurrency(summary.current)}</strong>
            </div>
            <div className="portfolio-summary-item">
              <span className="portfolio-summary-label">Today&apos;s P&amp;L</span>
              <strong className={`portfolio-summary-value ${valueToneClass(summary.dayPnl)}`}>
                {summary.dayPnl === null ? "--" : `${formatSignedCurrency(summary.dayPnl, true)} (${formatSignedPercent(summary.dayPct)})`}
              </strong>
            </div>
            <div className="portfolio-summary-item">
              <span className="portfolio-summary-label">Total P&amp;L</span>
              <strong className={`portfolio-summary-value ${valueToneClass(summary.totalPnl)}`}>
                {`${formatSignedCurrency(summary.totalPnl, true)} (${formatSignedPercent(summary.totalPnlPct)})`}
              </strong>
            </div>
          </div>

          <div className="portfolio-filter-row">
            <div className="portfolio-pill-group">
              <button type="button" className={`portfolio-pill${performanceTab === "all" ? " active" : ""}`} onClick={() => setPerformanceTab("all")}>All({activeRowsCount})</button>
              <button type="button" className={`portfolio-pill${performanceTab === "gainers" ? " active" : ""}`} onClick={() => setPerformanceTab("gainers")}>Gainers({gainersCount})</button>
              <button type="button" className={`portfolio-pill${performanceTab === "losers" ? " active" : ""}`} onClick={() => setPerformanceTab("losers")}>Losers({losersCount})</button>
            </div>

            <div className="portfolio-gainers-lossers">
              <span className="portfolio-gainers-title">Portfolio gainers and losers</span>
              <div className="portfolio-gainers-meter">
                <span className="positive">{gainersShare.toFixed(2)}%</span>
                <div className="portfolio-meter-track">
                  <div className="portfolio-meter-positive" style={{ width: `${gainersShare}%` }} />
                  <div className="portfolio-meter-negative" style={{ width: `${losersShare}%` }} />
                </div>
                <span className="negative">{losersShare.toFixed(2)}%</span>
              </div>
            </div>

            <div className="portfolio-search-slot">
              <input
                className="portfolio-search-input"
                type="text"
                placeholder={`Search ${primaryTab}...`}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </div>

          <div className="portfolio-table-wrap">
            <table className="portfolio-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th className="numeric">Qty</th>
                  <th className="numeric">Buy Avg</th>
                  <th className="numeric">LTP</th>
                  <th className="numeric">Invested</th>
                  <th className="numeric">Current</th>
                  <th className="numeric">Total P&amp;L</th>
                  <th className="numeric">Day&apos;s P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.key}>
                    <td>
                      <div className="portfolio-symbol-cell">
                        <span className="portfolio-symbol-main">{row.displaySymbol}</span>
                        <span className="portfolio-symbol-sub">{primaryTab === "positions" ? `${row.exchange} | ${row.sideLabel}` : row.exchange}</span>
                      </div>
                    </td>
                    <td className="numeric">{formatQty(row.quantity)}</td>
                    <td className="numeric">{formatCurrency(row.buyAvg)}</td>
                    <td className="numeric">{formatCurrency(row.ltp)}</td>
                    <td className="numeric">{formatCurrency(row.invested)}</td>
                    <td className="numeric">{formatCurrency(row.current)}</td>
                    <td className="numeric">
                      <div className={`portfolio-value-stack ${valueToneClass(row.totalPnl)}`}>
                        <span>{formatSignedCurrency(row.totalPnl)}</span>
                        <span className="portfolio-value-sub">{formatSignedPercent(row.totalPnlPct)}</span>
                      </div>
                    </td>
                    <td className="numeric">
                      {row.dayPnl === null ? (
                        <span className="portfolio-na">--</span>
                      ) : (
                        <div className={`portfolio-value-stack ${valueToneClass(row.dayPnl)}`}>
                          <span>{formatSignedCurrency(row.dayPnl)}</span>
                          <span className="portfolio-value-sub">{formatSignedPercent(row.dayPct)}</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="portfolio-empty-row">
                      {query ? `No ${primaryTab} matched your search.` : primaryTab === "holdings" ? "No holdings available." : "No positions available."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
      </>
      )}
    </section>
  );
}

function HistoryTable({ title, subtitle, rows, columns, emptyText, exportName }) {
  return (
    <section className="table-wrap">
      <div className="section-head">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <button className="secondary-btn" type="button" onClick={() => exportRowsToCsv(exportName, rows, columns)} disabled={!rows.length}>
          Export CSV
        </button>
      </div>
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${title}-${row.id || row.orderNumStatus || row.symbol || index}`}>
              {columns.map((column) => (
                <td key={column.key}>{column.render ? column.render(row) : row[column.key] ?? "-"}</td>
              ))}
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>{emptyText}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </section>
  );
}

function loadStoredSettings() {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return DEFAULT_SETTINGS;
    }
    const merged = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    const watchlistSymbols = normalizeSymbols(merged.watchlistSymbols || "");
    if (watchlistSymbols.join(",") === LEGACY_HOME_SYMBOLS.join(",")) {
      merged.watchlistSymbols = HOME_MARKET_SYMBOLS.join(",");
    }
    return merged;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function NseStocksTable({ nseSymbols, nseFilter, setNseFilter, nsePage, setNsePage, pageSize }) {
  const [analyticsBySymbol, setAnalyticsBySymbol] = useState({});
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");
  const filtered = nseFilter
    ? nseSymbols.filter((s) => {
        const q = nseFilter.toUpperCase();
        return (
          (s.short || "").toUpperCase().includes(q) ||
          (s.name || "").toUpperCase().includes(q) ||
          (s.symbol || "").toUpperCase().includes(q)
        );
      })
    : nseSymbols;

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(nsePage, totalPages - 1);
  const pageRows = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const pageSymbolsKey = pageRows.map((row) => row.symbol).join(",");

  useEffect(() => {
    if (!pageRows.length) {
      return undefined;
    }

    let cancelled = false;
    setAnalyticsLoading(true);
    setAnalyticsError("");

    fetchNseSymbolAnalytics(pageRows.map((row) => row.symbol))
      .then((data) => {
        if (cancelled) {
          return;
        }
        setAnalyticsBySymbol((current) => ({ ...current, ...(data.results || {}) }));
      })
      .catch((err) => {
        if (!cancelled) {
          setAnalyticsError(err.message || "Unable to load signal analytics for this page.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAnalyticsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [pageSymbolsKey]);

  return (
    <div className="table-panel">
      <div className="table-panel-head">
        <div>
          <h3>All NSE Listed Stocks</h3>
          <p>{nseSymbols.length.toLocaleString()} stocks &middot; Showing {filtered.length.toLocaleString()} match{filtered.length !== 1 ? "es" : ""} &middot; Signal uses up to 8Y daily history for visible rows</p>
          {analyticsError ? <p className="nse-table-status error-text">{analyticsError}</p> : null}
          {!analyticsError && analyticsLoading ? <p className="nse-table-status">Loading OHLC + signal analytics for this page...</p> : null}
        </div>
        <input
          className="nse-search-input"
          type="text"
          placeholder="Search by name, symbol..."
          value={nseFilter}
          onChange={(e) => { setNseFilter(e.target.value); setNsePage(0); }}
        />
      </div>
      <div className="nse-stocks-scroll">
        <table className="nse-stocks-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Company Name</th>
              <th className="numeric">LTP</th>
              <th className="numeric">Today Open</th>
              <th className="numeric">Today High</th>
              <th className="numeric">Today Low</th>
              <th className="numeric">Prev Open</th>
              <th className="numeric">Prev Close</th>
              <th>Signal</th>
              <th>Signal Reason</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((s, i) => {
              const analytics = analyticsBySymbol[s.symbol] || {};
              const today = analytics.today || {};
              const yesterday = analytics.yesterday || {};
              return (
                <tr key={s.symbol || i}>
                  <td>{safePage * pageSize + i + 1}</td>
                  <td>{s.name}</td>
                  <td className="numeric nse-ltp-cell">{formatPriceCell(today.ltp)}</td>
                  <td className="numeric">{formatPriceCell(today.open)}</td>
                  <td className="numeric">{formatPriceCell(today.high)}</td>
                  <td className="numeric">{formatPriceCell(today.low)}</td>
                  <td className="numeric">{formatPriceCell(yesterday.open)}</td>
                  <td className="numeric">{formatPriceCell(yesterday.close)}</td>
                  <td>
                    <span className={`nse-signal-chip ${nseSignalClass(analytics.signal)}`} title={analytics.signalNote || "Signal pending"}>
                      {analytics.signal || (analyticsLoading ? "Loading..." : "Skip")}
                    </span>
                  </td>
                  <td>
                    <div className="nse-signal-detail">
                      <span className="nse-signal-note">{analytics.signalNote || "Awaiting signal details"}</span>
                      <span className="nse-signal-meta">
                        Score {analytics.signalScore ?? 0} | {analytics.historyPoints || 0} candles
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan="10" style={{ textAlign: "center", color: "var(--text-muted)", padding: 24 }}>
                  {nseSymbols.length === 0 ? "Loading NSE symbols..." : "No matches found."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "12px 0" }}>
          <button className="btn-secondary" disabled={safePage === 0} onClick={() => setNsePage(safePage - 1)}>← Prev</button>
          <span style={{ fontSize: 13 }}>Page {safePage + 1} of {totalPages}</span>
          <button className="btn-secondary" disabled={safePage >= totalPages - 1} onClick={() => setNsePage(safePage + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const homeMarketSymbolsCsv = HOME_MARKET_SYMBOLS.join(",");
  const [loading, setLoading] = useState(true);
  const [authenticating, setAuthenticating] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [watchlist, setWatchlist] = useState([]);
  const [pnlSeries, setPnlSeries] = useState([]);
  const [watchSeries, setWatchSeries] = useState([]);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("offline");
  const [refreshing, setRefreshing] = useState(false);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderResult, setOrderResult] = useState("");
  const [strategySubmitting, setStrategySubmitting] = useState(false);
  const [strategyResult, setStrategyResult] = useState("");
  const [strategyAutoEnabled, setStrategyAutoEnabled] = useState(false);
  const [strategyAutoRuns, setStrategyAutoRuns] = useState(0);
  const [strategyAutoChecks, setStrategyAutoChecks] = useState(0);
  const [dailyAutoState, setDailyAutoState] = useState(() => loadDailyAutoState());
  const [nseSymbols, setNseSymbols] = useState([]);
  const [nseFilter, setNseFilter] = useState("");
  const [nsePage, setNsePage] = useState(0);
  const NSE_PAGE_SIZE = 50;
  const [watchlistDraft, setWatchlistDraft] = useState("");
  const [settings, setSettings] = useState(() => loadStoredSettings());
  const [themeMode, setThemeMode] = useState(() => {
    try { return window.localStorage.getItem(THEME_KEY) || "light"; } catch { return "light"; }
  });
  const [orderForm, setOrderForm] = useState({
    symbol: "NSE:SBIN-EQ",
    qty: 1,
    side: "BUY",
    orderType: "MARKET",
    productType: "INTRADAY",
    limitPrice: 0,
    forceLive: false,
  });
  const [strategyForm, setStrategyForm] = useState({
    symbol: "NSE:SBIN-EQ",
    qty: 1,
    side: "BUY",
    triggerLtp: 900,
    productType: "INTRADAY",
    validity: "DAY",
    forceLive: false,
  });

  const search = useMemo(() => new URLSearchParams(window.location.search), []);
  const homeMarketRows = useMemo(() => {
    const rowMap = new Map();
    watchlist.forEach((item) => {
      const symbol = item?.n || item?.v?.symbol;
      if (symbol) {
        rowMap.set(symbol, item);
      }
    });
    return HOME_MARKET_SYMBOLS.map((symbol) => rowMap.get(symbol) || { n: symbol, v: { symbol } });
  }, [watchlist]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", themeMode);
    try { window.localStorage.setItem(THEME_KEY, themeMode); } catch { /* noop */ }
  }, [themeMode]);

  function toggleTheme() {
    setThemeMode((current) => (current === "dark" ? "light" : "dark"));
  }

  useEffect(() => {
    const loginResult = search.get("login");
    if (loginResult === "error") {
      setError(search.get("reason") || "Login failed");
    }

    initialize();
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    saveDailyAutoState(dailyAutoState);
  }, [dailyAutoState]);

  useEffect(() => {
    if (authenticated) {
      fetchAllNseSymbols()
        .then((data) => setNseSymbols(data.results || []))
        .catch(() => {});
    }
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated) {
      return undefined;
    }

    let cancelled = false;
    fetchQuotes(HOME_MARKET_SYMBOLS)
      .then((data) => {
        if (!cancelled) {
          setWatchlist(data.d || []);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [authenticated]);

  useEffect(() => {
    if (dailyAutoState.date !== getTodayKey()) {
      setDailyAutoState({ date: getTodayKey(), count: 0 });
    }
  }, [dailyAutoState]);

  useEffect(() => {
    if (!authenticated) {
      setConnectionStatus("offline");
      return undefined;
    }

    if (!settings.liveUpdatesEnabled) {
      setConnectionStatus("offline");
      return undefined;
    }

    let socket;
    let reconnectTimer;
    let cancelled = false;

    const connect = () => {
      if (cancelled) {
        return;
      }

      setConnectionStatus("connecting");
      const wsBase = API_BASE
        ? API_BASE.replace("http://", "ws://").replace("https://", "wss://")
        : `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`;
      socket = new WebSocket(`${wsBase}/api/live?symbols=${encodeURIComponent(homeMarketSymbolsCsv)}`);

      socket.onopen = () => {
        setConnectionStatus("live");
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.status === "error") {
            setError(data.message || "Live update failed");
            return;
          }
          setDashboard(data);
          const rows = data.watchlist?.d || [];
          setWatchlist(rows);

          const timeLabel = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
          const summary = data.summary || {};
          setPnlSeries((current) => {
            const next = [
              ...current.slice(-39),
              {
                time: timeLabel,
                total: Number(summary.total_pnl || 0),
                holdings: Number(summary.holdings_pnl || 0),
                positions: Number(summary.positions_pnl || 0),
              },
            ];
            return next;
          });

          const watchPoint = { time: timeLabel };
          rows.slice(0, 4).forEach((row) => {
            const key = row.n || row.v?.symbol;
            if (key) {
              watchPoint[key] = Number(row.v?.lp || 0);
            }
          });
          setWatchSeries((current) => [...current.slice(-39), watchPoint]);
        } catch (err) {
          setError(err.message);
        }
      };

      socket.onerror = () => {
        setConnectionStatus("reconnecting");
      };

      socket.onclose = () => {
        if (!cancelled) {
          setConnectionStatus("reconnecting");
          reconnectTimer = window.setTimeout(connect, Number(settings.reconnectSeconds) * 1000);
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
  }, [authenticated, settings.liveUpdatesEnabled, settings.reconnectSeconds, homeMarketSymbolsCsv]);

  // Fallback polling keeps dashboard/watchlist cards fresh when websocket is unavailable.
  useEffect(() => {
    if (!authenticated || !settings.liveUpdatesEnabled) {
      return undefined;
    }

    let cancelled = false;

    const pollQuotes = async () => {
      if (cancelled || connectionStatus === "live") {
        return;
      }
      try {
        const data = await fetchQuotes(HOME_MARKET_SYMBOLS);
        if (!cancelled && Array.isArray(data?.d)) {
          setWatchlist(data.d);
        }
      } catch {
        // Keep silent to avoid noisy transient errors.
      }
    };

    const pollDashboard = async () => {
      if (cancelled || connectionStatus === "live" || location.pathname !== "/portfolio") {
        return;
      }
      try {
        const data = await fetchDashboard();
        if (!cancelled) {
          setDashboard(data);
        }
      } catch {
        // Keep silent to avoid noisy transient errors.
      }
    };

    void pollQuotes();
    void pollDashboard();

    const quoteTimer = window.setInterval(() => {
      void pollQuotes();
    }, 5000);

    const dashboardTimer = window.setInterval(() => {
      void pollDashboard();
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(quoteTimer);
      window.clearInterval(dashboardTimer);
    };
  }, [authenticated, settings.liveUpdatesEnabled, connectionStatus, location.pathname]);

  useEffect(() => {
    if (!authenticated || !strategyAutoEnabled) {
      return undefined;
    }

    if (dailyAutoState.count >= Number(settings.strategyDailyCap)) {
      setStrategyAutoEnabled(false);
      setStrategyResult("Daily auto-run cap reached. Auto-run stopped.");
      return undefined;
    }

    if (strategyAutoRuns >= Number(settings.strategyAutoMaxRuns)) {
      setStrategyAutoEnabled(false);
      return undefined;
    }

    const timer = window.setInterval(async () => {
      setStrategyAutoChecks((current) => current + 1);
      try {
        const result = await runStrategy({
          ...strategyForm,
          qty: Number(strategyForm.qty),
          triggerLtp: Number(strategyForm.triggerLtp),
        });

        if (result.triggered) {
          setDailyAutoState((current) => ({ date: getTodayKey(), count: current.count + 1 }));
          setStrategyAutoRuns((current) => {
            const next = current + 1;
            if (next >= Number(settings.strategyAutoMaxRuns)) {
              setStrategyAutoEnabled(false);
            }
            return next;
          });
          setStrategyResult(result.paper_trade ? "Auto strategy triggered in paper mode." : "Auto strategy sent live order.");
          refreshDashboard(true);
        }
      } catch (err) {
        setError(err.message);
        setStrategyAutoEnabled(false);
      }
    }, Number(settings.strategyAutoInterval) * 1000);

    return () => window.clearInterval(timer);
  }, [authenticated, strategyAutoEnabled, strategyForm, settings.strategyAutoInterval, settings.strategyAutoMaxRuns, settings.strategyDailyCap, dailyAutoState.count]);

  async function initialize() {
    try {
      setLoading(true);
      setError("");
      const session = await fetchSession();
      setAuthenticated(Boolean(session.authenticated));
      if (!session.authenticated && session.message) {
        setError(session.message);
      }
      if (session.warning) {
        setError(session.warning);
      }
      if (session.authenticated) {
        const data = await fetchDashboard();
        setDashboard(data);
        if (data?.profile?.s === "error" && data?.profile?.message) {
          setError(data.profile.message);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function refreshDashboard(silent = false) {
    try {
      if (!silent) {
        setRefreshing(true);
      }
      const data = await fetchDashboard();
      setDashboard(data);
      if (data?.profile?.s === "error" && data?.profile?.message) {
        setError(data.profile.message);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      if (!silent) {
        setRefreshing(false);
      }
    }
  }

  async function handleLogin() {
    setError("");
    setAuthenticating(true);
    try {
      const result = await login();
      if (result?.redirected) {
        return;
      }
      await initialize();
    } catch (err) {
      setError(err.message);
    } finally {
      setAuthenticating(false);
    }
  }

  function handleOrderChange(event) {
    const { name, value, type, checked } = event.target;
    setOrderForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function handleStrategyChange(event) {
    const { name, value, type, checked } = event.target;
    setStrategyForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function handleSettingsChange(event) {
    const { name, value, type, checked } = event.target;
    setSettings((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function handleWatchlistDraftChange(event) {
    setWatchlistDraft(event.target.value);
  }

  function addWatchlistSymbol() {
    const nextSymbol = watchlistDraft.trim();
    if (!nextSymbol) {
      return;
    }
    const symbols = normalizeSymbols(settings.watchlistSymbols);
    if (!symbols.includes(nextSymbol)) {
      setSettings((current) => ({
        ...current,
        watchlistSymbols: [...symbols, nextSymbol].join(","),
      }));
    }
    setWatchlistDraft("");
  }

  function removeWatchlistSymbol(symbolToRemove) {
    const nextSymbols = normalizeSymbols(settings.watchlistSymbols).filter((symbol) => symbol !== symbolToRemove);
    setSettings((current) => ({
      ...current,
      watchlistSymbols: nextSymbols.join(","),
    }));
  }

  async function handleOrderSubmit(event) {
    event.preventDefault();
    setOrderResult("");
    setError("");
    setOrderSubmitting(true);
    try {
      const result = await placeOrder({
        ...orderForm,
        qty: Number(orderForm.qty),
        limitPrice: Number(orderForm.limitPrice || 0),
      });
      setOrderResult(result.paper_trade ? "Paper order simulated successfully." : "Live order submitted successfully.");
      await refreshDashboard(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setOrderSubmitting(false);
    }
  }

  async function handleStrategySubmit(event) {
    event.preventDefault();
    setStrategyResult("");
    setError("");
    setStrategySubmitting(true);
    try {
      const result = await runStrategy({
        ...strategyForm,
        qty: Number(strategyForm.qty),
        triggerLtp: Number(strategyForm.triggerLtp),
      });

      if (!result.triggered) {
        setStrategyResult(`No trade sent. Current LTP: ${result.current_ltp}`);
      } else if (result.paper_trade) {
        setStrategyResult("Strategy triggered in paper mode.");
      } else {
        setStrategyResult("Strategy triggered and live order submitted.");
      }

      await refreshDashboard(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setStrategySubmitting(false);
    }
  }

  async function handleLogout() {
    setError("");
    try {
      await logout();
      setAuthenticated(false);
      setDashboard(null);
      setWatchlist([]);
      setOrderResult("");
      setStrategyResult("");
      setConnectionStatus("offline");
      setStrategyAutoEnabled(false);
      setStrategyAutoRuns(0);
      setStrategyAutoChecks(0);
    } catch (err) {
      setError(err.message);
    }
  }

  function toggleStrategyAuto() {
    if (!strategyAutoEnabled && dailyAutoState.count >= Number(settings.strategyDailyCap)) {
      setStrategyResult("Daily auto-run cap already reached. Reset tomorrow or lower usage.");
      return;
    }
    setStrategyAutoRuns(0);
    setStrategyAutoChecks(0);
    setStrategyAutoEnabled((current) => !current);
  }

  if (loading) {
    return (
      <div className="login-fullpage">
        <div className="login-card">
          <div className="login-brand-icon">TB</div>
          <h1>TradeBuddy</h1>
          <p>Loading your trading workspace&hellip;</p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="login-fullpage">
        <div className="login-card">
          <div className="login-brand-icon">TB</div>
          <h1>TradeBuddy</h1>
          <p>Securely access your FYERS portfolio home page.</p>
          <button
            className="btn-primary"
            style={{ width: "100%", justifyContent: "center", padding: "14px", marginTop: 4 }}
            onClick={handleLogin}
            disabled={authenticating}
          >
            {authenticating ? "Connecting…" : "Login with FYERS"}
          </button>
          {error ? <p className="error-text" style={{ marginTop: 14 }}>{error}</p> : null}
        </div>
      </div>
    );
  }

  const profile = dashboard?.profile?.data || {};
  const funds = dashboard?.funds?.fund_limit?.[0] || {};
  const holdings = dashboard?.holdings?.holdings || [];
  const positions = dashboard?.positions?.netPositions || [];
  const orders = dashboard?.orderbook?.orderBook || dashboard?.orderbook?.orderbook || [];
  const trades = dashboard?.tradebook?.tradeBook || dashboard?.tradebook?.tradebook || [];
  const watchlistSymbols = normalizeSymbols(settings.watchlistSymbols);
  const summary = dashboard?.summary || {};

  const PAGE_TITLES = {
    "/dashboard": "Home Page",
    "/portfolio": "Portfolio",
    "/markets":   "Markets & Watchlists",
    "/scanner":   "Command Deck",
    "/scanner/execution": "Execution",
    "/scanner/datasets":  "Analyst",

    "/orders":    "Orders & Trades",
    "/strategy":  "Strategy",
    "/settings":  "Settings",
  };
  const pageTitle = PAGE_TITLES[location.pathname] || "Home Page";

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";

  const MAIN_NAV_ITEMS = [
    { to: "/dashboard", label: "Home", Icon: IcoDashboard },
    { to: "/markets",   label: "Markets",    Icon: IcoMarkets },
    { to: "/scanner/datasets", label: "Analyst", Icon: IcoChart },
    { to: "/portfolio", label: "Portfolio",  Icon: IcoBriefcase },
    { to: "/orders",    label: "Orders",     Icon: IcoOrders },
    { to: "/strategy",  label: "Strategy",   Icon: IcoStrategy },
    { to: "/settings",  label: "Settings",   Icon: IcoSettings },
  ];

  const SCANNER_NAV_ITEMS = [
    { to: "/scanner",            label: "Command Deck", Icon: IcoCommand, end: true },
    { to: "/scanner/execution",  label: "Execution",    Icon: IcoTune },
  ];

  return (
    <div className={`na-shell${sidebarExpanded ? "" : " sidebar-mini"}`}>
      {/* ── Mini Sidebar ── */}
      <aside className="na-sidebar">
        <div className="na-brand">
          <div className="na-brand-icon">TB</div>
          <div className="na-brand-text">
            <h2>TradeBuddy</h2>
            <p>{profile.name || profile.display_name || "Trader"}</p>
          </div>
        </div>

        <nav className="na-nav">
          <div className="na-nav-section">Main</div>
          {MAIN_NAV_ITEMS.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              title={label}
              className={({ isActive }) => `na-nav-item${isActive ? " active" : ""}`}
            >
              <Icon />
              <span className="nav-label">{label}</span>
            </NavLink>
          ))}
          <div className="na-nav-section">Scanner</div>
          {SCANNER_NAV_ITEMS.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={label}
              className={({ isActive }) => `na-nav-item${isActive ? " active" : ""}`}
            >
              <Icon />
              <span className="nav-label">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="na-sidebar-footer">
          <button className="na-nav-item logout-item" style={{ width: "100%" }} title="Logout" onClick={handleLogout}>
            <IcoLogout />
            <span className="nav-label">Logout</span>
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="na-main">
        {/* Topbar */}
        <header className="na-topbar">
          <button className="topbar-toggle" title="Toggle sidebar" onClick={() => setSidebarExpanded((v) => !v)}>
            <IcoMenu />
          </button>
          <div className="topbar-page-title">
            <h2>{pageTitle}</h2>
          </div>
          <div className="topbar-actions">
            <button className="theme-toggle-btn" title={themeMode === "dark" ? "Switch to light" : "Switch to dark"} onClick={toggleTheme}>
              {themeMode === "dark" ? <IcoSun /> : <IcoMoon />}
            </button>
            <span className={`status-pill status-${connectionStatus}`}>{connectionStatus}</span>
            <button className="btn-secondary" onClick={() => refreshDashboard()} disabled={refreshing}>
              {refreshing ? "…" : "Refresh"}
            </button>
          </div>
        </header>

        {/* Page wrapper */}
        <div className="na-page">
        <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route
            path="/dashboard"
            element={(
              <>
                {/* Greeting */}
                <div className="greeting-banner">
                  <div>
                    <h2>{greeting}, {profile.name || profile.display_name || "Trader"}!</h2>
                    <p>Stay updated with your portfolio&rsquo;s performance today.</p>
                  </div>
                  <span className="greeting-tag">Live Market</span>
                </div>

                {/* Watchlist */}
                <div className="watchlist-row">
                  {homeMarketRows.map((item) => {
                    const v = item.v || {};
                    const chg = Number(v.chp ?? 0);
                    const symbol = item.n || v.symbol;
                    return (
                      <div className="watch-card" key={item.n || v.symbol || Math.random()}>
                        <div className="sym">{homeMarketLabel(symbol)}</div>
                        <div className="ltp">{v.lp ?? "–"}</div>
                        <div className={`chg ${chg >= 0 ? "up" : "dn"}`}>
                          {chg >= 0 ? "▲" : "▼"} {Math.abs(chg).toFixed(2)}%
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* NSE Listed Stocks */}
                <NseStocksTable
                  nseSymbols={nseSymbols}
                  nseFilter={nseFilter}
                  setNseFilter={setNseFilter}
                  nsePage={nsePage}
                  setNsePage={setNsePage}
                  pageSize={NSE_PAGE_SIZE}
                />
              </>
            )}
          />

          <Route
            path="/portfolio"
            element={(
              <>
                {/* KPI cards */}
                <div className="kpi-grid">
                  <div className="kpi-card">
                    <div className="kpi-icon c-primary"><IcoBalance /></div>
                    <div>
                      <div className="kpi-label">Available Balance</div>
                      <div className="kpi-value">{formatCurrency(funds.equityAmount ?? summary.available_balance ?? 0)}</div>
                      <div className="kpi-sub">Equity segment</div>
                    </div>
                  </div>
                  <div className="kpi-card">
                    <div className="kpi-icon c-success"><IcoBriefcase /></div>
                    <div>
                      <div className="kpi-label">Holdings</div>
                      <div className="kpi-value">{holdings.length}</div>
                      <div className="kpi-sub">Long-term positions</div>
                    </div>
                  </div>
                  <div className="kpi-card">
                    <div className="kpi-icon c-warning"><IcoPositions /></div>
                    <div>
                      <div className="kpi-label">Open Positions</div>
                      <div className="kpi-value">{positions.length}</div>
                      <div className="kpi-sub">Net positions today</div>
                    </div>
                  </div>
                  <div className="kpi-card">
                    <div className={`kpi-icon ${Number(summary.total_pnl ?? 0) >= 0 ? "c-success" : "c-danger"}`}><IcoStrategy /></div>
                    <div>
                      <div className="kpi-label">Total P&amp;L</div>
                      <div className="kpi-value">{formatCurrency(summary.total_pnl ?? 0)}</div>
                      <div className="kpi-sub">Live portfolio pulse</div>
                    </div>
                  </div>
                </div>

                {/* Charts */}
                <SmartChartsBoard pnlSeries={pnlSeries} holdings={holdings} />

                <PortfolioTabbedSection holdings={holdings} positions={positions} trades={trades} />
              </>
            )}
          />

          <Route
            path="/orders"
            element={(
              <>
                <div className="panel" style={{ maxWidth: 680 }}>
                  <div className="panel-head">
                    <div><h3>Place Order</h3><p>Uses backend paper or live mode safeguards.</p></div>
                  </div>
                  <form className="form-grid" onSubmit={handleOrderSubmit}>
                    <div className="form-row-2">
                      <label>Symbol<input name="symbol" value={orderForm.symbol} onChange={handleOrderChange} /></label>
                      <label>Quantity<input name="qty" type="number" min="1" value={orderForm.qty} onChange={handleOrderChange} /></label>
                    </div>
                    <div className="form-row-2">
                      <label>Side<select name="side" value={orderForm.side} onChange={handleOrderChange}><option>BUY</option><option>SELL</option></select></label>
                      <label>Order Type<select name="orderType" value={orderForm.orderType} onChange={handleOrderChange}><option value="MARKET">MARKET</option><option value="LIMIT">LIMIT</option><option value="SL-M">SL-M</option><option value="SL-L">SL-L</option></select></label>
                    </div>
                    <div className="form-row-2">
                      <label>Product Type<select name="productType" value={orderForm.productType} onChange={handleOrderChange}><option value="INTRADAY">INTRADAY</option><option value="CNC">CNC</option><option value="MARGIN">MARGIN</option></select></label>
                      <label>Limit Price<input name="limitPrice" type="number" step="0.05" value={orderForm.limitPrice} onChange={handleOrderChange} /></label>
                    </div>
                    <label style={{ flexDirection: "row", alignItems: "center", gap: 8, fontWeight: 500 }}>
                      <input name="forceLive" type="checkbox" style={{ width: "auto" }} checked={orderForm.forceLive} onChange={handleOrderChange} />
                      Force live order
                    </label>
                    <div><button type="submit" className="btn-primary" disabled={orderSubmitting}>{orderSubmitting ? "Submitting…" : "Place Order"}</button></div>
                  </form>
                  {orderResult ? <p className="success-text">{orderResult}</p> : null}
                </div>

                <div className="table-panel">
                  <div className="table-panel-head">
                    <div><h3>Order History</h3><p>Latest orderbook entries from FYERS.</p></div>
                    <button className="btn-secondary" type="button" disabled={!orders.length}
                      onClick={() => exportRowsToCsv("order-history.csv", orders, [
                        {key:"symbol",label:"Symbol"},{key:"qty",label:"Qty",exportValue:r=>r.qty??r.orderQty??""},{key:"type",label:"Type",exportValue:r=>r.type??r.orderType??""},{key:"status",label:"Status",exportValue:r=>r.status??r.orderNumStatus??""},{key:"time",label:"Time",exportValue:r=>r.orderDateTime??r.orderValidity??""}
                      ])}>
                      Export CSV
                    </button>
                  </div>
                  <table>
                    <thead><tr><th>Symbol</th><th>Qty</th><th>Type</th><th>Status</th><th>Time</th></tr></thead>
                    <tbody>
                      {orders.map((row, i) => <tr key={row.id||row.orderNumStatus||i}><td><strong>{row.symbol}</strong></td><td>{row.qty??row.orderQty??"-"}</td><td>{row.type??row.orderType??"-"}</td><td>{row.status??row.orderNumStatus??"-"}</td><td>{row.orderDateTime??row.orderValidity??"-"}</td></tr>)}
                      {orders.length===0?<tr><td colSpan="5" style={{textAlign:"center",color:"var(--text-muted)",padding:"24px"}}>No orders available.</td></tr>:null}
                    </tbody>
                  </table>
                </div>

                <div className="table-panel">
                  <div className="table-panel-head">
                    <div><h3>Trade History</h3><p>Latest executed trades from FYERS.</p></div>
                    <button className="btn-secondary" type="button" disabled={!trades.length}
                      onClick={() => exportRowsToCsv("trade-history.csv", trades, [
                        {key:"symbol",label:"Symbol"},{key:"qty",label:"Qty",exportValue:r=>r.tradedQty??r.qty??""},{key:"price",label:"Price",exportValue:r=>r.tradePrice??r.price??""},{key:"side",label:"Side",exportValue:r=>r.side??r.orderSide??""},{key:"time",label:"Time",exportValue:r=>r.tradeDateTime??r.dateTime??""}
                      ])}>
                      Export CSV
                    </button>
                  </div>
                  <table>
                    <thead><tr><th>Symbol</th><th>Qty</th><th>Price</th><th>Side</th><th>Time</th></tr></thead>
                    <tbody>
                      {trades.map((row, i) => <tr key={row.id||i}><td><strong>{row.symbol}</strong></td><td>{row.tradedQty??row.qty??"-"}</td><td>{row.tradePrice??row.price??"-"}</td><td>{row.side??row.orderSide??"-"}</td><td>{row.tradeDateTime??row.dateTime??"-"}</td></tr>)}
                      {trades.length===0?<tr><td colSpan="5" style={{textAlign:"center",color:"var(--text-muted)",padding:"24px"}}>No trades available.</td></tr>:null}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          />

          <Route
            path="/strategy"
            element={(
              <div className="panel" style={{ maxWidth: 680 }}>
                <div className="panel-head">
                  <div><h3>Strategy Controls</h3><p>Run one-shot or auto-run trigger strategy from UI.</p></div>
                </div>
                <form className="form-grid" onSubmit={handleStrategySubmit}>
                  <div className="form-row-2">
                    <label>Symbol<input name="symbol" value={strategyForm.symbol} onChange={handleStrategyChange} /></label>
                    <label>Quantity<input name="qty" type="number" min="1" value={strategyForm.qty} onChange={handleStrategyChange} /></label>
                  </div>
                  <div className="form-row-2">
                    <label>Side<select name="side" value={strategyForm.side} onChange={handleStrategyChange}><option>BUY</option><option>SELL</option></select></label>
                    <label>Trigger LTP<input name="triggerLtp" type="number" step="0.05" value={strategyForm.triggerLtp} onChange={handleStrategyChange} /></label>
                  </div>
                  <div className="form-row-2">
                    <label>Product Type<select name="productType" value={strategyForm.productType} onChange={handleStrategyChange}><option value="INTRADAY">INTRADAY</option><option value="CNC">CNC</option><option value="MARGIN">MARGIN</option></select></label>
                    <label>Validity<select name="validity" value={strategyForm.validity} onChange={handleStrategyChange}><option value="DAY">DAY</option><option value="IOC">IOC</option></select></label>
                  </div>
                  <label style={{ flexDirection: "row", alignItems: "center", gap: 8, fontWeight: 500 }}>
                    <input name="forceLive" type="checkbox" style={{ width: "auto" }} checked={strategyForm.forceLive} onChange={handleStrategyChange} />
                    Force live strategy order
                  </label>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button type="submit" className="btn-primary" disabled={strategySubmitting}>{strategySubmitting ? "Running…" : "Run Strategy"}</button>
                    <button type="button" className={strategyAutoEnabled ? "btn-danger" : "btn-success"} onClick={toggleStrategyAuto}>
                      {strategyAutoEnabled ? "Stop Auto" : "Start Auto"}
                    </button>
                  </div>
                </form>
                <p className="strategy-status">
                  Auto: {strategyAutoEnabled ? "active" : "idle"} &nbsp;&bull;&nbsp; Checks: {strategyAutoChecks} &nbsp;&bull;&nbsp; Triggers: {strategyAutoRuns} &nbsp;&bull;&nbsp; Daily cap: {dailyAutoState.count}/{settings.strategyDailyCap}
                </p>
                {strategyResult ? <p className="success-text">{strategyResult}</p> : null}
              </div>
            )}
          />

          <Route path="/markets" element={<MarketsPage />} />
          <Route path="/scanner" element={<ScannerLayout />}>
            <Route index element={<ScannerCommandDeck />} />
            <Route path="execution" element={<ScannerExecution />} />
            <Route path="visuals" element={<ScannerVisuals />} />
            <Route path="datasets" element={<ScannerDatasets />} />
            <Route path="filters" element={<ScannerFilterLab />} />
          </Route>

          <Route
            path="/settings"
            element={(
              <div className="panel">
                <div className="panel-head">
                  <div><h3>Workspace Settings</h3><p>Persisted in your browser.</p></div>
                </div>
                <div className="form-grid">
                  <label>
                    Add Watchlist Symbol
                    <div className="chip-input-row">
                      <input value={watchlistDraft} onChange={handleWatchlistDraftChange} placeholder="e.g. NSE:SBIN-EQ" />
                      <button type="button" className="btn-primary" onClick={addWatchlistSymbol}>Add</button>
                    </div>
                  </label>
                  <div className="chip-list">
                    {watchlistSymbols.map((s) => (
                      <button key={s} type="button" className="chip" onClick={() => removeWatchlistSymbol(s)}>{s} ×</button>
                    ))}
                  </div>
                  <div className="form-row-2">
                    <label>Reconnect Seconds<input name="reconnectSeconds" type="number" min="1" value={settings.reconnectSeconds} onChange={handleSettingsChange} /></label>
                    <label>Auto Strategy Interval (s)<input name="strategyAutoInterval" type="number" min="5" value={settings.strategyAutoInterval} onChange={handleSettingsChange} /></label>
                  </div>
                  <div className="form-row-2">
                    <label>Max Auto Runs<input name="strategyAutoMaxRuns" type="number" min="1" value={settings.strategyAutoMaxRuns} onChange={handleSettingsChange} /></label>
                    <label>Daily Strategy Cap<input name="strategyDailyCap" type="number" min="1" value={settings.strategyDailyCap} onChange={handleSettingsChange} /></label>
                  </div>
                  <label style={{ flexDirection: "row", alignItems: "center", gap: 8, fontWeight: 500 }}>
                    <input name="liveUpdatesEnabled" type="checkbox" style={{ width: "auto" }} checked={settings.liveUpdatesEnabled} onChange={handleSettingsChange} />
                    Enable live websocket updates
                  </label>
                </div>
              </div>
            )}
          />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </Suspense>

        {error ? <p className="error-bar">{error}</p> : null}
        </div>{/* end na-page */}
      </main>
    </div>
  );
}
