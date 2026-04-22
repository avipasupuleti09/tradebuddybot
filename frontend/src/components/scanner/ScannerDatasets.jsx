import { ResponsiveContainer, LineChart, Line } from "recharts";
import { useScannerContext } from "../../context/scanner/ScannerContext";
import { IcArrowUp, IcArrowDown } from "../common/Icons";
import {
  TAB_CONFIG,
  ScannerDataTable,
  ScannerKpiGrid,
  SectorBarChart,
  BreadthPieChart,
  TopMoversBarChart,
  fmtProb,
  fmtNum,
  fmtSignedPct,
  signalClass,
  buildLiveProfile,
} from "./ScannerShared";

export default function ScannerDatasets() {
  const fmtCardPrice = (value) => {
    if (value === null || value === undefined || value === "") return "-";
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value);
    return n.toFixed(2);
  };

  const {
    activeTab,
    setActiveTab,
    tabRows,
    liveRowsToShow,
    liveHighlights,
    topMovers,
    kpiItems,
    myWatchlists,
    selectedWatchlistName,
    setSelectedWatchlistName,
    watchlistLoading,
    loadMyWatchlists,
    runSelectedWatchlistScan,
    datasets,
  } = useScannerContext();

  const watchlistNames = Object.keys(myWatchlists || {});

  return (
    <div className="scan-tabs-panel">
      <div className="scan-tabs-head">
        <div className="scan-tabs-head-main">
          <div className="sth-overline">Scanner outputs</div>
          <h3>Analyst</h3>
          <p>Explore live scanner output, conviction buckets, breakouts, sector rotation, and API-fed dataset views.</p>
        </div>
        <div className="scan-watchlist-controls">
          <label className="scan-watchlist-label">Watchlist source</label>
          <select
            className="scan-watchlist-select"
            value={selectedWatchlistName || ""}
            onChange={(e) => {
              const nextName = e.target.value;
              setSelectedWatchlistName(nextName);
              void runSelectedWatchlistScan(nextName);
            }}
          >
            {watchlistNames.length === 0 ? (
              <option value="">No watchlists found</option>
            ) : (
              watchlistNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))
            )}
          </select>
          <button className="btn-secondary scan-watchlist-refresh" onClick={() => void loadMyWatchlists()} disabled={watchlistLoading}>
            {watchlistLoading ? "Refreshing..." : "Refresh watchlists"}
          </button>
        </div>
      </div>
      <div className="scan-tab-bar">
        {TAB_CONFIG.map(([key, label]) => (
          <button
            key={key}
            className={`scan-tab-btn${activeTab === key ? " active" : ""}`}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="scan-summary-strip">
        {/* ── Quick Tape (Lead Stocks) ── */}
        {topMovers.length > 0 && (
          <div className="scan-quick-tape-row">
            {topMovers.map((m) => (
              <div className={`scan-mover-card tone-${m.tone || "primary"}`} key={m.label}>
                <div className="mover-head">
                  <div className="mover-label">{m.label}</div>
                  <div className={`mover-symbol ${m.tone === "danger" || m.tone === "error" ? "is-loss" : "is-gain"}`}>
                    {m.tone === "danger" || m.tone === "error" ? <IcArrowDown /> : <IcArrowUp />}
                  </div>
                </div>
                <div className="mover-primary">{m.primary}</div>
                <div className="mover-secondary">{m.secondary}</div>
                <div className="mover-details-grid">
                  <div className="mover-detail-item"><span>LTP</span><strong>{fmtCardPrice(m.details?.ltp)}</strong></div>
                  <div className="mover-detail-item"><span>Open</span><strong>{fmtCardPrice(m.details?.open)}</strong></div>
                  <div className="mover-detail-item"><span>High</span><strong>{fmtCardPrice(m.details?.high)}</strong></div>
                  <div className="mover-detail-item"><span>Low</span><strong>{fmtCardPrice(m.details?.low)}</strong></div>
                  <div className="mover-detail-item"><span>Prev High</span><strong>{fmtCardPrice(m.details?.prevHigh)}</strong></div>
                  <div className="mover-detail-item"><span>Prev Low</span><strong>{fmtCardPrice(m.details?.prevLow)}</strong></div>
                  <div className="mover-detail-item"><span>Close</span><strong>{fmtCardPrice(m.details?.close)}</strong></div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── KPI Grid ── */}
        <ScannerKpiGrid items={kpiItems} />
      </div>

      <div className="scan-tab-content">
        {activeTab === "liveScanner" ? (
          <>
            <div className="scan-live-highlights">
              {liveHighlights.map((row) => (
                <div className="scan-highlight-card" key={row.Ticker || Math.random()}>
                  <div className="hc-top">
                    <span className="hc-ticker">{row.Ticker?.replace(/^NSE:/, "").trim() || row.Ticker}</span>
                    <span className={`hc-signal ${signalClass(row.Signal)}`}>{row.Signal || "N/A"}</span>
                  </div>
                  <div className="hc-value">{fmtProb(row.Combined_AI_Prob ?? row.Intraday_AI_Prob)}</div>
                  <div className="hc-meta">
                    Momentum {fmtNum(row.IntradayMomentumScore)} &bull; Change {fmtSignedPct(row["Change_%"])}
                  </div>
                  <div style={{ height: 40, marginTop: 8 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={buildLiveProfile(row)}>
                        <Line type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ))}
            </div>
            <ScannerDataTable title="Live scanner feed" rows={liveRowsToShow} emptyMessage="No live market data available." />
          </>
        ) : (
          <ScannerDataTable
            title={TAB_CONFIG.find(([k]) => k === activeTab)?.[1] || "Dataset"}
            rows={tabRows}
            emptyMessage="No data available for this tab."
          />
        )}
      </div>

      {/* ── Visuals Section (always visible at bottom) ── */}

      <div className="scan-visuals-section">
        <h4 className="scan-visuals-title">Market Visuals</h4>
        <div className="scan-charts-grid">
          <SectorBarChart rows={datasets.sectorSummary || []} />
          <BreadthPieChart rows={datasets.marketBreadth || []} />
          <TopMoversBarChart title="Top Gainers" rows={(datasets.topGainers || []).slice(0, 10)} xKey="DayChange_%" yKey="Ticker" color="#13deb9" />
          <TopMoversBarChart title="Top Losers" rows={(datasets.topLosers || []).slice(0, 10)} xKey="DayChange_%" yKey="Ticker" color="#fa896b" />
        </div>
      </div>
    </div>
  );
}
