import { useState } from "react";
import DashboardScreenerHub from "./DashboardScreenerHub";

const DASHBOARD_TABS = [
  { id: "all-stocks", label: "All Stocks" },
  { id: "screeners", label: "Screeners" },
];

export default function DashboardMarketWorkbench({ allStocksContent, marketHoursActive, reconnectSeconds }) {
  const [activeTab, setActiveTab] = useState("all-stocks");

  return (
    <section className="dashboard-market-workbench">
      <div className="dashboard-market-tabs" role="tablist" aria-label="Dashboard stock tabs">
        {DASHBOARD_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`dashboard-market-tab${activeTab === tab.id ? " active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="dashboard-market-tab-label">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="dashboard-market-tab-panel">
        {activeTab === "all-stocks"
          ? allStocksContent
          : <DashboardScreenerHub marketHoursActive={marketHoursActive} reconnectSeconds={reconnectSeconds} />}
      </div>
    </section>
  );
}