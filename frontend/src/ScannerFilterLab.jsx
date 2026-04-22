import { useScannerContext } from "./context/scanner/ScannerContext";
import { IcFilter, ScannerDataTable } from "./components/scanner/ScannerShared";

export default function ScannerFilterLab() {
  const { filters, setFilters, sectors, filteredDisplayRows } = useScannerContext();

  return (
    <div className="panel">
      <div className="scan-filter-head">
        <IcFilter />
        <div>
          <h3>Filtered results</h3>
          <p>Focus the ranked table by sector, signal, relative strength, and minimum AI confidence.</p>
        </div>
      </div>

      <div className="scan-filter-grid">
        <label>
          Sector
          <select value={filters.sector} onChange={(e) => setFilters((p) => ({ ...p, sector: e.target.value }))}>
            {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>
          Signal
          <select value={filters.signal} onChange={(e) => setFilters((p) => ({ ...p, signal: e.target.value }))}>
            {["All", "STRONG BUY", "BUY", "HOLD", "SELL", "AVOID"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>
          Min RS
          <input type="number" min="1" max="100" value={filters.minRs} onChange={(e) => setFilters((p) => ({ ...p, minRs: Number(e.target.value) }))} />
        </label>
        <label>
          Min AI probability
          <input type="number" min="0" max="1" step="0.01" value={filters.minAi} onChange={(e) => setFilters((p) => ({ ...p, minAi: Number(e.target.value) }))} />
        </label>
      </div>

      <ScannerDataTable title="Filtered conviction board" rows={filteredDisplayRows} emptyMessage="No rows matched the current filters." />
    </div>
  );
}
