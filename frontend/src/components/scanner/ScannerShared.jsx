import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";
import DataTable from "../common/DataTable";
import {
  IcCommand,
  IcTune,
  IcChart,
  IcTable,
  IcFilter,
  IcPlay,
  IcRefresh,
  IcRadar,
  IcBolt,
  IcTrend,
  IcHub,
} from "../common/Icons";

// ── Tab config ──────────────────────────────────────────────────────────────
export const TAB_CONFIG = [
  ["liveScanner", "Live Scanner"],
  ["aiPortfolio", "AI Portfolio"],
  ["allRanked", "All Ranked"],
  ["strongBuy", "Strong Buy"],
  ["buy", "Buy"],
  ["hold", "Hold"],
  ["sell", "Sell"],
  ["avoid", "Avoid"],
  ["breakout52w", "52W Breakout"],
  ["volBreakout", "Volume Breakout"],
  ["accumulation", "Accumulation"],
  ["aiPicks", "AI Picks"],
  ["sectorSummary", "Sector Summary"],
  ["sectorRotation", "Sector Rotation"],
  ["marketBreadth", "Market Breadth"],
  ["errors", "Errors"],
];

export const PIE_COLORS = ["#5d87ff", "#13deb9", "#ffae1f", "#fa896b", "#7460ee", "#60a5fa"];

// ── SVG Icons ─────────────────────────────────────────────────────────────
export {
  IcCommand,
  IcTune,
  IcChart,
  IcTable,
  IcFilter,
  IcPlay,
  IcRefresh,
  IcRadar,
  IcBolt,
  IcTrend,
  IcHub,
};

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

const COLD_MSGS = [
  [0,  "Connecting to scanner backend..."],
  [3,  "First load fetches live data from Fyers API — this takes a moment."],
  [10, "Downloading daily price history for each symbol..."],
  [20, "Pulling intraday bars and benchmark data..."],
  [35, "Computing relative strength, signals, and AI scores..."],
  [50, "Building sector summaries and market breadth..."],
  [70, "Almost there — assembling final dashboard payload..."],
  [90, "Finalizing — the next page load will be instant."],
];

export function ColdStartOverlay({ elapsed, scanning }) {
  const msg = COLD_MSGS.reduce((acc, [sec, text]) => (elapsed >= sec ? text : acc), COLD_MSGS[0][1]);
  const pct = Math.min(elapsed * 1.1, 95);
  return (
    <div className="scan-cold-overlay">
      <div className="scan-cold-card">
        <div className="scan-cold-spinner" />
        <h3>{scanning ? "Running scan..." : "Loading scanner data..."}</h3>
        <p style={{ color: "var(--text-muted)", margin: "8px 0 16px" }}>{msg}</p>
        <div className="scan-cold-bar-track">
          <div className="scan-cold-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>{elapsed}s elapsed</div>
      </div>
    </div>
  );
}

export function ScannerKpiGrid({ items }) {
  const compactItems = items.slice(3);
  return (
    <>
      <div className="scan-kpi-compact">
        {compactItems.map((item) => (
          <div className="scan-kpi-card" key={item.label}>
            <div className={`kc-icon tone-${item.tone}`}><item.Icon /></div>
            <div>
              <div className="kc-label">{item.label}</div>
              <div className="kc-value">{item.value ?? "-"}</div>
              <div className="kc-sub">{item.sub}</div>
              <div className="kc-trend">{item.trendLabel}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function SectorBarChart({ rows }) {
  if (!rows?.length) return <div className="scan-chart-panel"><div className="scan-chart-empty">No sector summary data available.</div></div>;
  const data = rows.map((r) => ({ Sector: r.Sector, StrongBuy: r.StrongBuy ?? 0, Buy: r.Buy ?? 0, Sell: r.Sell ?? 0 }));
  return (
    <div className="scan-chart-panel">
      <div className="scp-overline">Visual block</div>
      <h3>Sector-wise Signals</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 24 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="Sector" stroke="var(--text-muted)" angle={-20} textAnchor="end" height={80} tick={{ fontSize: 11 }} />
          <YAxis stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="StrongBuy" fill="#13deb9" radius={[6, 6, 0, 0]} />
          <Bar dataKey="Buy" fill="#5d87ff" radius={[6, 6, 0, 0]} />
          <Bar dataKey="Sell" fill="#fa896b" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BreadthPieChart({ rows }) {
  if (!rows?.length) return <div className="scan-chart-panel"><div className="scan-chart-empty">No market breadth data available.</div></div>;
  return (
    <div className="scan-chart-panel">
      <div className="scp-overline">Visual block</div>
      <h3>Market Breadth</h3>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie data={rows} dataKey="Count" nameKey="Type" innerRadius={65} outerRadius={105} paddingAngle={4}>
            {rows.map((entry, i) => <Cell key={entry.Type} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TopMoversBarChart({ title, rows, xKey, yKey, color }) {
  if (!rows?.length) return <div className="scan-chart-panel"><div className="scan-chart-empty">No data for {title}.</div></div>;
  return (
    <div className="scan-chart-panel">
      <div className="scp-overline">Visual block</div>
      <h3>{title}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={rows} layout="vertical" margin={{ top: 12, right: 32, left: 24, bottom: 8 }}>
          <CartesianGrid stroke="var(--border)" horizontal vertical={false} />
          <XAxis type="number" stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey={yKey} width={100} stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey={xKey} fill={color} radius={[0, 8, 8, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ScannerDataTable({ title, rows, emptyMessage = "No data available.", maxRows = 100 }) {
  return (
    <DataTable
      title={title}
      rows={rows}
      emptyMessage={emptyMessage}
      maxRows={maxRows}
      formatCell={formatCellValue}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

export function buildScanRequest(symbolInput, sectorOverridesInput, deliveryOverridesInput) {
  const watchlistSymbols = String(symbolInput || "")
    .split(/[\r\n,]+/)
    .map((v) => v.trim())
    .filter(Boolean);
  const sectorOverrides = parseJsonInput(sectorOverridesInput);
  const deliveryOverrides = parseJsonInput(deliveryOverridesInput);
  if (!watchlistSymbols.length && !Object.keys(sectorOverrides).length && !Object.keys(deliveryOverrides).length) return null;
  return {
    ...(watchlistSymbols.length ? { watchlistSymbols } : {}),
    ...(Object.keys(sectorOverrides).length ? { sectorOverrides } : {}),
    ...(Object.keys(deliveryOverrides).length ? { deliveryOverrides } : {}),
  };
}

function parseJsonInput(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

export function pickLeadRow(rows, label, tone) {
  const row = rows?.[0];
  if (!row) return null;

  const pickField = (...keys) => {
    for (const key of keys) {
      const value = row[key];
      if (value !== null && value !== undefined && value !== "") {
        return value;
      }
    }
    return null;
  };

  const ticker = row.Ticker ? row.Ticker.replace(/^NSE:/, "").trim() : "";
  const primary = ticker || row.Sector || row.Type || label;
  const changeValue = row["DayChange_%"] ?? row["Change_%"] ?? row.AI_Prob ?? row.Count;
  const secondary = changeValue === undefined ? "waiting for fresh data" : `Lead metric ${fmtLeadValue(changeValue)}`;
  const details = {
    ltp: pickField("LTP", "ltp", "LastTradedPrice", "Price", "PRICE", "CurrentPrice", "DayClosePrice", "lp"),
    open: pickField("Open", "OPEN", "open", "DayOpen", "open_price", "o"),
    high: pickField("High", "HIGH", "high", "high_price", "h", "DayHigh"),
    low: pickField("Low", "LOW", "low", "low_price", "l", "DayLow"),
    prevHigh: pickField("PrevHigh", "Prev_High", "Prev High", "PreviousHigh", "previous_high", "PreviousDayHigh"),
    prevLow: pickField("PrevLow", "Prev_Low", "Prev Low", "PreviousLow", "previous_low", "PreviousDayLow"),
    close: pickField("Close", "CLOSE", "close", "DayClosePrice", "CurrentPrice", "PrevClose", "Prev_Close", "Prev Close", "prev_close", "prev_close_price", "c"),
  };
  return { label, primary, secondary, tone, details };
}

function fmtLeadValue(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return String(v ?? "-");
  const n = Number(v);
  if (n <= 1 && n >= 0) return `${(n * 100).toFixed(2)}%`;
  return `${n.toFixed(2)}`;
}

export function fmtProb(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "-";
  return `${(Number(v) * 100).toFixed(2)}%`;
}

export function fmtNum(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "-";
  return Number(v).toFixed(1);
}

export function fmtSignedPct(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "-";
  return `${Number(v).toFixed(2)}%`;
}

export function fmtPctTotal(v, total) {
  if (!total || !v) return "0.0%";
  return `${((Number(v) / Number(total)) * 100).toFixed(1)}%`;
}

export function signalClass(signal) {
  switch ((signal || "").toUpperCase()) {
    case "STRONG BUY":
    case "BUY": return "signal-buy";
    case "SELL":
    case "AVOID": return "signal-sell";
    case "HOLD": return "signal-hold";
    default: return "";
  }
}

export function buildSparklineData(values) {
  const cleaned = (values || []).map((v) => Number(v) || 0);
  if (cleaned.length === 0) return [{ index: 0, value: 0 }];
  return cleaned.map((v, i) => ({ index: i, value: v }));
}

export function seriesFromRows(rows, key, limit = 6) {
  const values = (rows || []).map((r) => Number(r?.[key])).filter((v) => Number.isFinite(v)).slice(0, limit);
  return buildSparklineData(values);
}

export function firstNumericSeries(rows, keys, limit = 6) {
  for (const key of keys) {
    const s = seriesFromRows(rows, key, limit);
    if (s.some((p) => p.value !== 0)) return s;
  }
  return buildSparklineData([]);
}

export function sectorCompositeSeries(rows, limit = 6) {
  const values = (rows || []).slice(0, limit).map((r) => (Number(r?.StrongBuy) || 0) + (Number(r?.Buy) || 0) - (Number(r?.Sell) || 0));
  return buildSparklineData(values);
}

export function topSectorSignals(rows, sectorName) {
  const match = (rows || []).find((r) => r.Sector === sectorName);
  return (Number(match?.StrongBuy) || 0) + (Number(match?.Buy) || 0);
}

export function buildLiveProfile(row) {
  return buildSparklineData([
    Number(row?.["Change_%"]) || 0,
    Number(row?.IntradayMomentumScore) || 0,
    (Number(row?.Combined_AI_Prob ?? row?.Intraday_AI_Prob) || 0) * 100,
    Number(row?.RS_rating_1_100 ?? row?.RS) || 0,
  ]);
}

function formatCellValue(value, column) {
  if (value === null || value === undefined) return "-";
  const col = column.toLowerCase();
  
  // Remove NSE: prefix from ticker symbols
  if (col === "ticker") {
    const ticker = String(value).replace(/^NSE:/, "").trim();
    return <span className="cell-ticker">{ticker}</span>;
  }
  
  if (col === "signal") {
    const cls = signalClass(value);
    return <span className={`cell-signal ${cls}`}>{value}</span>;
  }
  if (col.includes("change") || col.includes("%") || col === "ai_prob" || col === "combined_ai_prob" || col === "intraday_ai_prob") {
    const n = Number(value);
    if (Number.isFinite(n)) {
      const display = col.includes("prob") ? `${(n * 100).toFixed(2)}%` : `${n.toFixed(2)}%`;
      return <span className={n >= 0 ? "cell-positive" : "cell-negative"}>{display}</span>;
    }
  }
  const numValue = Number(value);
  if (Number.isFinite(numValue) && typeof value !== "string") {
    return numValue % 1 === 0 ? numValue : numValue.toFixed(2);
  }
  return String(value);
}
