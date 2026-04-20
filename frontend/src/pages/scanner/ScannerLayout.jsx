import { Outlet } from "react-router-dom";
import { ScannerProvider, useScannerContext } from "../../context/scanner/ScannerContext";
import { ColdStartOverlay } from "../../components/scanner/ScannerShared";

function ScannerInner() {
  const { loading, scanning, elapsed, error, workbookAvailable, dataSource } = useScannerContext();

  return (
    <div className="scanner-page">
      {error ? <div className="error-bar">{error}</div> : null}
      {!workbookAvailable && dataSource !== "live" ? (
        <div style={{ padding: "12px 16px", borderRadius: 9, background: "var(--warning-light)", color: "var(--warning)", fontSize: 13, fontWeight: 500, marginBottom: 16 }}>
          Scanner snapshot is not ready. Live data remains available and a fresh scan will populate datasets.
        </div>
      ) : null}
      <Outlet />
      {(loading || scanning) ? <ColdStartOverlay elapsed={elapsed} scanning={scanning} /> : null}
    </div>
  );
}

export default function ScannerLayout() {
  return (
    <ScannerProvider>
      <ScannerInner />
    </ScannerProvider>
  );
}
