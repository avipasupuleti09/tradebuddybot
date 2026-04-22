import { useScannerContext } from "./context/scanner/ScannerContext";
import { IcPlay, IcRefresh, ScannerKpiGrid } from "./components/scanner/ScannerShared";

export default function ScannerCommandDeck() {
  const {
    scanning, handleRunScan, refreshDashboard,
    workbookAvailable, liveFeed, customUniverseCount, tabRows,
    pulseStrip, statusCards, kpiItems, topMovers,
  } = useScannerContext();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Hero */}
      <div className="scan-hero">
        <div className="scan-hero-content">
          <div className="scan-hero-grid">
            <div>
              <div className="scan-hero-badges">
                <span className="scan-badge scan-badge-primary">NSE Momentum Studio</span>
                <span className="scan-badge scan-badge-outline">{workbookAvailable ? "API snapshot ready" : "API snapshot pending"}</span>
                <span className="scan-badge scan-badge-outline">{liveFeed ? "Live feed active" : "Snapshot mode"}</span>
                {customUniverseCount ? <span className="scan-badge scan-badge-outline">{customUniverseCount} custom symbols</span> : null}
                <span className="scan-badge scan-badge-outline">{tabRows.length || 0} rows in view</span>
              </div>

              <h1>
                Momentum rankings,{" "}
                <span>live tape,</span>{" "}
                conviction signals, one decisive dashboard.
              </h1>
              <p>Read the market faster with a cleaner command surface for scanner output, live polling, sector rotation, and high-conviction filtering.</p>

              <div className="scan-pulse-strip">
                {pulseStrip.map((item) => (
                  <div key={item.label}>
                    <div className="pulse-item-label">{item.label}</div>
                    <div className="pulse-item-value">{item.value}</div>
                  </div>
                ))}
              </div>

              <div className="scan-hero-actions">
                <button className="btn-primary" onClick={handleRunScan} disabled={scanning}>
                  <IcPlay /> {scanning ? "Running scan..." : "Run fresh scan"}
                </button>
                <button className="btn-secondary" onClick={() => void refreshDashboard()}>
                  <IcRefresh /> Refresh dashboard
                </button>
              </div>
            </div>

            <div className="scan-status-panel">
              <div className="sp-head">
                <div>
                  <div className="sp-head-label">Desk status</div>
                  <div className="sp-head-title">Session pulse</div>
                </div>
              </div>
              {statusCards.map((card) => (
                <div className="scan-status-card" key={card.label}>
                  <div className="sc-label">{card.label}</div>
                  <div className="sc-value">{card.value}</div>
                  <div className="sc-sub">{card.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Quick tape */}
      {topMovers.length > 0 && (
        <div className="scan-quick-tape-row">
          {topMovers.map((m) => (
            <div className="scan-mover-card" key={m.label}>
              <div className="mover-label">{m.label}</div>
              <div className="mover-primary">{m.primary}</div>
              <div className="mover-secondary">{m.secondary}</div>
            </div>
          ))}
        </div>
      )}

      {/* KPI Grid */}
      <ScannerKpiGrid items={kpiItems} />
    </div>
  );
}
