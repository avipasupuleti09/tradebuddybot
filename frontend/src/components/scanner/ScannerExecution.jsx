import { useScannerContext } from "../../context/scanner/ScannerContext";
import { IcTune, IcPlay } from "../common/Icons";

export default function ScannerExecution() {
  const {
    scanning, handleRunScan, customUniverseCount,
    symbolInput, setSymbolInput,
    sectorOverridesInput, setSectorOverridesInput,
    deliveryOverridesInput, setDeliveryOverridesInput,
    setActiveScanRequest,
    dataSource, setDataSource,
    liveFeed, setLiveFeed,
    liveInterval, setLiveInterval,
    liveRows, setLiveRows,
  } = useScannerContext();

  return (
    <div className="panel">
      <div className="scan-controls-head">
        <IcTune />
        <div>
          <h3>Execution controls</h3>
          <p>Tune how the dashboard mixes scanner snapshots and live API data.</p>
        </div>
      </div>

      <div className="scan-inputs-grid">
        <div>
          <label style={{ fontWeight: 600, fontSize: 13 }}>Custom symbols</label>
          <textarea
            placeholder="RELIANCE, TCS, INFY or one symbol per line"
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value)}
          />
          <div className="scan-input-hint">Optional. When provided, scans use this list instead of env inputs.</div>
        </div>
        <div>
          <label style={{ fontWeight: 600, fontSize: 13 }}>Sector overrides JSON</label>
          <textarea
            placeholder='{"RELIANCE":"Energy","TCS":"IT"}'
            value={sectorOverridesInput}
            onChange={(e) => setSectorOverridesInput(e.target.value)}
          />
          <div className="scan-input-hint">Optional object map keyed by symbol.</div>
        </div>
        <div>
          <label style={{ fontWeight: 600, fontSize: 13 }}>Delivery overrides JSON</label>
          <textarea
            placeholder='{"RELIANCE":52.4,"TCS":41.1}'
            value={deliveryOverridesInput}
            onChange={(e) => setDeliveryOverridesInput(e.target.value)}
          />
          <div className="scan-input-hint">Optional delivery % map keyed by symbol.</div>
        </div>
      </div>

      <div className="scan-actions-row">
        <button className="btn-primary" onClick={handleRunScan} disabled={scanning}>
          <IcPlay /> {scanning ? "Running custom scan..." : "Run with pasted universe"}
        </button>
        <button
          className="btn-secondary"
          onClick={() => {
            setSymbolInput("");
            setSectorOverridesInput("");
            setDeliveryOverridesInput("");
            setActiveScanRequest(null);
          }}
        >
          Clear pasted inputs
        </button>
        {customUniverseCount ? (
          <span className="scan-badge scan-badge-primary" style={{ background: "var(--purple-light)", color: "var(--purple)" }}>Using {customUniverseCount} custom symbols</span>
        ) : (
          <span className="scan-badge" style={{ background: "var(--bg)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>Using default scanner inputs</span>
        )}
      </div>

      <div className="scan-config-grid">
        <div className="scan-config-card">
          <div className="cc-label">Data source</div>
          <select value={dataSource} onChange={(e) => setDataSource(e.target.value)}>
            <option value="hybrid">Hybrid</option>
            <option value="workbook">Scanner snapshot</option>
            <option value="live">Live feed only</option>
          </select>
        </div>
        <div className="scan-config-card">
          <div className="cc-label">Live polling</div>
          <div className="cc-desc">Stream intraday updates while the scanner stays on screen.</div>
          <label className="toggle-switch" style={{ marginTop: 4 }}>
            <input type="checkbox" checked={liveFeed} onChange={(e) => setLiveFeed(e.target.checked)} disabled={dataSource === "workbook"} />
            <span className="toggle-slider" />
          </label>
        </div>
        <div className="scan-config-card">
          <div className="cc-label">Feed interval</div>
          <select value={String(liveInterval)} onChange={(e) => setLiveInterval(Number(e.target.value))} disabled={!liveFeed || dataSource === "workbook"}>
            <option value="5">5 sec</option>
            <option value="10">10 sec</option>
            <option value="30">30 sec</option>
            <option value="60">1 min</option>
            <option value="120">2 min</option>
            <option value="300">5 min</option>
          </select>
        </div>
        <div className="scan-config-card">
          <div className="cc-label">Live row depth</div>
          <div className="scan-range-row" style={{ marginTop: 8 }}>
            <input type="range" min="5" max="50" step="1" value={liveRows} onChange={(e) => setLiveRows(Number(e.target.value))} />
            <span className="scan-range-value">{liveRows}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
