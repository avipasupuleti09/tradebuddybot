import { useScannerContext } from "../../context/scanner/ScannerContext";
import { SectorBarChart, BreadthPieChart, TopMoversBarChart } from "./ScannerShared";

export default function ScannerVisuals() {
  const { datasets } = useScannerContext();

  return (
    <div className="scan-charts-grid">
      <SectorBarChart rows={datasets.sectorSummary || []} />
      <BreadthPieChart rows={datasets.marketBreadth || []} />
      <TopMoversBarChart title="Top Gainers" rows={(datasets.topGainers || []).slice(0, 10)} xKey="DayChange_%" yKey="Ticker" color="#13deb9" />
      <TopMoversBarChart title="Top Losers" rows={(datasets.topLosers || []).slice(0, 10)} xKey="DayChange_%" yKey="Ticker" color="#fa896b" />
    </div>
  );
}
