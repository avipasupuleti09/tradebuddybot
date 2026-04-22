import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { fetchAllNseSymbols, fetchDirectScreener, fetchWatchlists } from "../../api";
import { buildClientScannerPayloadFromRows } from "../../lib/scannerCore";
import { filterSymbolsByNseGroup } from "../../nseGroups";
import {
  buildScanRequest,
  pickLeadRow,
  fmtPctTotal,
  buildSparklineData,
  seriesFromRows,
  firstNumericSeries,
  sectorCompositeSeries,
  topSectorSignals,
} from "../../components/scanner/ScannerShared";
import { IcRadar, IcBolt, IcTrend, IcHub } from "../../components/common/Icons";

const ScannerCtx = createContext(null);
export const useScannerContext = () => useContext(ScannerCtx);

const DEFAULT_DIRECT_GROUP_IDS = [
  "nifty-50",
  "niftynxt50",
  "nifty-midcap-50",
  "nifty-bank",
  "fin-nifty",
  "nifty-it",
  "nifty-pharma",
  "nifty-auto",
  "nifty-fmcg",
  "nifty-metals",
  "nifty-commodities",
  "nifty-energy",
  "nifty-oil-and-gas",
  "nifty-healthcare",
  "gold-silver",
  "bse-sensex",
];

function isTransientFyersRateLimit(message) {
  return /request limit reached|retry after few mins|rate limit/i.test(String(message || ""));
}

export function ScannerProvider({ children }) {
  const [dashboard, setDashboard] = useState(null);
  const [liveData, setLiveData] = useState([]);
  const [activeTab, setActiveTab] = useState("liveScanner");
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [loadStartTime, setLoadStartTime] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [dataSource, setDataSource] = useState("hybrid");
  const [liveFeed, setLiveFeed] = useState(false);
  const [liveInterval, setLiveInterval] = useState(60);
  const [liveRows, setLiveRows] = useState(25);
  const [filters, setFilters] = useState({ sector: "All", signal: "All", minAi: 0, minRs: 1 });
  const [symbolInput, setSymbolInput] = useState("");
  const [sectorOverridesInput, setSectorOverridesInput] = useState("");
  const [deliveryOverridesInput, setDeliveryOverridesInput] = useState("");
  const [activeScanRequest, setActiveScanRequest] = useState(null);
  const [myWatchlists, setMyWatchlists] = useState({});
  const [selectedWatchlistName, setSelectedWatchlistName] = useState("");
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [marketSymbols, setMarketSymbols] = useState([]);
  const initialLoadRef = useRef(false);
  const hasDashboardRows = (dashboard?.datasets?.allRanked || []).length > 0;

  function setScannerErrorFromFailure(err, fallbackMessage) {
    const message = err?.message || fallbackMessage;
    if (hasDashboardRows && isTransientFyersRateLimit(message)) {
      setError("");
      return;
    }
    setError(message);
  }

  const defaultUniverseSymbols = useMemo(
    () => buildDefaultDirectUniverseSymbols(marketSymbols),
    [marketSymbols],
  );

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => { void loadMarketSymbols(); }, []);

  useEffect(() => {
    if (initialLoadRef.current || !defaultUniverseSymbols.length) {
      return;
    }
    initialLoadRef.current = true;
    void refreshDashboard(defaultUniverseSymbols);
  }, [defaultUniverseSymbols]);

  useEffect(() => { void loadMyWatchlists(); }, []);

  useEffect(() => {
    const symbols = myWatchlists[selectedWatchlistName] || [];
    if (!selectedWatchlistName || !symbols.length) {
      return;
    }

    const normalized = symbols
      .map((symbol) => String(symbol).trim().toUpperCase())
      .filter(Boolean);
    if (!normalized.length) {
      return;
    }

    void runScanForWatchlist(normalized);
  }, [selectedWatchlistName, myWatchlists]);

  // ── Elapsed timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!loadStartTime) { setElapsed(0); return; }
    const tick = window.setInterval(() => setElapsed(Math.floor((Date.now() - loadStartTime) / 1000)), 1000);
    return () => window.clearInterval(tick);
  }, [loadStartTime]);

  // ── Live polling ──────────────────────────────────────────────────────────
  // Enable continuous live polling for ALL tabs to stream live data
  useEffect(() => {
    if (dataSource === "workbook") return undefined;
    // Always refresh live data, regardless of active tab, for continuous streaming
    void refreshLive();
    // Keep polling active by default for real-time updates across all tabs
    const timer = window.setInterval(() => { void refreshLive(); }, liveInterval * 1000);
    return () => window.clearInterval(timer);
  }, [activeScanRequest, dataSource, liveInterval, liveRows]);

  async function loadMarketSymbols() {
    try {
      const payload = await fetchAllNseSymbols();
      setMarketSymbols(payload?.results || []);
    } catch {
      setMarketSymbols([]);
    }
  }

  async function refreshDashboard(requestSymbols = null) {
    const symbolsToScan = normalizeRequestedSymbols(
      requestSymbols || activeScanRequest?.watchlistSymbols || defaultUniverseSymbols,
      300,
    );
    if (!symbolsToScan.length) {
      setLoading(false);
      setError("No symbols are available for the direct FYERS screener universe.");
      return;
    }

    try {
      setLoading(true);
      setLoadStartTime(Date.now());
      setError("");
      const payload = await fetchDirectScreener(symbolsToScan, 300);
      setActiveScanRequest({ watchlistSymbols: symbolsToScan });
      setDashboard(payload);
      setLiveData(payload?.datasets?.liveMarket || []);
    } catch (err) {
      setScannerErrorFromFailure(err, "Failed to load direct FYERS screener dashboard");
    } finally {
      setLoading(false);
      setLoadStartTime(null);
    }
  }

  async function loadMyWatchlists() {
    try {
      setWatchlistLoading(true);
      const response = await fetchWatchlists();
      const watchlists = response?.watchlists || {};
      const names = Object.keys(watchlists);
      setMyWatchlists(watchlists);
      if (names.length && !selectedWatchlistName) {
        setSelectedWatchlistName(names[0]);
      }
    } catch {
      // Keep scanner usable even if watchlist API is unavailable.
      setMyWatchlists({});
    } finally {
      setWatchlistLoading(false);
    }
  }

  async function runScanForWatchlist(symbols) {
    const normalizedSymbols = normalizeRequestedSymbols(symbols, 300);
    if (!normalizedSymbols.length) {
      return;
    }

    try {
      setScanning(true);
      setLoadStartTime(Date.now());
      setError("");
      const requestPayload = { watchlistSymbols: normalizedSymbols };
      const payload = await fetchDirectScreener(normalizedSymbols, 300);
      setActiveScanRequest(requestPayload);
      setDashboard(payload);
      setLiveData(payload?.datasets?.liveMarket || []);
    } catch (err) {
      setScannerErrorFromFailure(err, "Failed to run direct FYERS watchlist scan");
    } finally {
      setScanning(false);
      setLoadStartTime(null);
    }
  }

  async function runSelectedWatchlistScan(name = selectedWatchlistName) {
    const symbols = (myWatchlists[name] || [])
      .map((symbol) => String(symbol).trim().toUpperCase())
      .filter(Boolean);

    if (!symbols.length) {
      return;
    }

    await runScanForWatchlist(symbols);
  }

  async function refreshLive() {
    const symbolsToScan = normalizeRequestedSymbols(activeScanRequest?.watchlistSymbols || defaultUniverseSymbols, liveRows);
    if (!symbolsToScan.length) {
      return;
    }

    try {
      const payload = await fetchDirectScreener(symbolsToScan, liveRows);
      setLiveData(payload?.datasets?.liveMarket || []);
    } catch (err) {
      setScannerErrorFromFailure(err, "Failed to load live data");
    }
  }

  async function handleRunScan() {
    try {
      setScanning(true);
      setLoadStartTime(Date.now());
      setError("");
      const requestPayload = buildScanRequest(symbolInput, sectorOverridesInput, deliveryOverridesInput);
      const symbolsToScan = normalizeRequestedSymbols(requestPayload.watchlistSymbols || defaultUniverseSymbols, 300);
      const payload = await fetchDirectScreener(symbolsToScan, 300);
      setActiveScanRequest(requestPayload);
      setDashboard(payload);
      setLiveData(payload?.datasets?.liveMarket || []);
    } catch (err) {
      setScannerErrorFromFailure(err, "Failed to run direct FYERS scan");
    } finally {
      setScanning(false);
      setLoadStartTime(null);
    }
  }

  // ── Merge live data with dataset rows ───────────────────────────────────────
  // Updates row prices with latest live ticks for real-time streaming effect
  function mergeLiveDataWithRows(rows, liveDataList) {
    if (!rows || !liveDataList || liveDataList.length === 0) return rows || [];

    const normalizeTicker = (ticker) => String(ticker || "").replace(/^NSE:/i, "").trim().toUpperCase();
    const pickValue = (obj, keys) => {
      for (const key of keys) {
        const value = obj?.[key];
        if (value !== null && value !== undefined && value !== "") return value;
      }
      return undefined;
    };
    
    // Create a map of ticker → live data for O(1) lookups
    const liveMap = {};
    liveDataList.forEach(live => {
      const symbolKey = normalizeTicker(live.Ticker || live.Symbol || live.symbol);
      if (symbolKey) liveMap[symbolKey] = live;
    });
    
    // Merge live data into each row, updating LTP, change, and other price fields
    return rows.map(row => {
      const liveRow = liveMap[normalizeTicker(row.Ticker || row.Symbol || row.symbol)];
      if (!liveRow) return row;
      
      // Merge live data while preserving scanner analysis columns
      return {
        ...row,
        LTP: pickValue(liveRow, ["LTP", "ltp", "lp", "Price", "price"]) ?? row.LTP,
        "Chg": pickValue(liveRow, ["Chg", "chg", "Change", "change"]) ?? row.Chg,
        "Chg%": pickValue(liveRow, ["Chg%", "chg%", "Change_%", "change_pct", "changePercent"]) ?? row["Chg%"],
        Open: pickValue(liveRow, ["Open", "open", "o", "open_price"]) ?? row.Open,
        High: pickValue(liveRow, ["High", "high", "h", "high_price"]) ?? row.High,
        Low: pickValue(liveRow, ["Low", "low", "l", "low_price"]) ?? row.Low,
        Close: pickValue(liveRow, ["Close", "close", "c", "prev_close", "prev_close_price"]) ?? row.Close,
        Volume: pickValue(liveRow, ["Volume", "volume", "v"]) ?? row.Volume,
        "Volume%": pickValue(liveRow, ["Volume%", "volume%", "Volume_%", "volume_pct"]) ?? row["Volume%"],
      };
    });
  }

  // ── Derived data ──────────────────────────────────────────────────────────
  const rawDatasets = dashboard?.datasets || {};
  const workbookAvailable = dashboard?.meta?.workbookAvailable;
  const liveRowsToShow = dataSource === "workbook" ? (rawDatasets.liveMarket || []) : liveData;
  const rankedLiveRows = mergeLiveDataWithRows(rawDatasets.allRanked || [], liveData);
  const clientScannerPayload = useMemo(
    () => buildClientScannerPayloadFromRows(rankedLiveRows, liveRowsToShow, rawDatasets.errors || []),
    [rankedLiveRows, liveRowsToShow, rawDatasets.errors],
  );
  const datasets = useMemo(
    () => ({ ...rawDatasets, ...clientScannerPayload.datasets, liveMarket: liveRowsToShow }),
    [rawDatasets, clientScannerPayload.datasets, liveRowsToShow],
  );
  const overview = rawDatasets.allRanked?.length ? clientScannerPayload.overview : (dashboard?.overview || {});
  const allRanked = datasets.allRanked || [];
  const customUniverseCount = activeScanRequest?.watchlistSymbols?.length || 0;

  const filteredRows = allRanked.filter((row) => {
    if (filters.sector !== "All" && row.Sector !== filters.sector) return false;
    if (filters.signal !== "All" && row.Signal !== filters.signal) return false;
    if ((row.RS_rating_1_100 ?? 0) < filters.minRs) return false;
    if ((row.AI_Prob ?? 0) < filters.minAi) return false;
    return true;
  });

  // ★ LIVE STREAMING: Merge live data with each tab's dataset for real-time updates
  const baseTabRows = activeTab === "liveScanner" ? liveRowsToShow : (datasets[activeTab] || []);
  const tabRows = mergeLiveDataWithRows(baseTabRows, liveData);
  const sectors = ["All", ...Array.from(new Set(allRanked.map((r) => r.Sector).filter(Boolean))).sort()];
  const filteredDisplayRows = dataSource === "live" ? liveRowsToShow : filteredRows;
  // ★ LIVE STREAMING: Also stream live data for highlight cards
  const liveHighlights = mergeLiveDataWithRows((liveRowsToShow || []).slice(0, 3), liveData);

  const normalizeTicker = (ticker) => String(ticker || "").replace(/^NSE:/i, "").trim().toUpperCase();
  const parsePctChange = (row) => {
    const raw = row?.["DayChange_%"] ?? row?.["Change_%"] ?? row?.["Chg%"];
    if (raw === null || raw === undefined || raw === "") return null;
    const n = Number(String(raw).replace("%", "").trim());
    return Number.isFinite(n) ? n : null;
  };
  const parseGapPct = (row) => {
    const raw = row?.["Gap_%"] ?? row?.["GAP_%"] ?? row?.["Gap%"] ?? row?.["Gap"] ?? row?.["GapUp_%"];
    if (raw === null || raw === undefined || raw === "") return null;
    const n = Number(String(raw).replace("%", "").trim());
    return Number.isFinite(n) ? n : null;
  };
  const fmtSignedPercent = (value) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

  // Prefer live feed rows for cards so values keep updating in place.
  const cardSourceRows = liveData.length > 0 ? liveData : rankedLiveRows;

  const moverCandidates = cardSourceRows
    .map((row) => ({ row, pct: parsePctChange(row) }))
    .filter((item) => item.pct !== null);

  const topGainerRow = moverCandidates.length
    ? moverCandidates.reduce((best, current) => (current.pct > best.pct ? current : best), moverCandidates[0]).row
    : null;

  const topLoserRow = moverCandidates.length
    ? moverCandidates.reduce((best, current) => (current.pct < best.pct ? current : best), moverCandidates[0]).row
    : null;

  const gapCandidates = cardSourceRows
    .map((row) => ({ row, pct: parseGapPct(row) }))
    .filter((item) => item.pct !== null);

  const gapUpCandidates = gapCandidates.filter((item) => item.pct > 0);
  const gapDownCandidates = gapCandidates.filter((item) => item.pct < 0);

  const topGapUp = gapUpCandidates.length
    ? gapUpCandidates.reduce((best, current) => (current.pct > best.pct ? current : best), gapUpCandidates[0])
    : null;

  const topGapDown = gapDownCandidates.length
    ? gapDownCandidates.reduce((best, current) => (current.pct < best.pct ? current : best), gapDownCandidates[0])
    : null;

  const topMovers = [];
  const seenTickers = new Set();
  const pushMoverCard = (row, label, tone, secondary) => {
    if (!row) return;
    const symbol = normalizeTicker(row.Ticker || row.Symbol || row.symbol);
    if (!symbol || seenTickers.has(symbol)) return;
    const card = pickLeadRow([row], label, tone);
    if (!card) return;
    if (secondary) card.secondary = secondary;
    topMovers.push(card);
    seenTickers.add(symbol);
  };

  pushMoverCard(topGainerRow, "Top gainer (watchlist)", "success");
  pushMoverCard(topLoserRow, "Top loser (watchlist)", "danger");
  pushMoverCard(topGapUp?.row, "Gap up (watchlist)", "success", `Gap ${fmtSignedPercent(topGapUp?.pct ?? 0)}`);
  pushMoverCard(topGapDown?.row, "Gap down (watchlist)", "danger", `Gap ${fmtSignedPercent(topGapDown?.pct ?? 0)}`);

  const pulseStrip = [
    { label: "Universe", value: `${overview.totalScanned ?? 0} names` },
    { label: "Strong buy", value: `${overview.strongBuy ?? 0}` },
    { label: "AI picks", value: `${overview.aiPicks ?? 0}` },
    { label: customUniverseCount ? "Custom list" : "Best sector", value: customUniverseCount ? `${customUniverseCount} symbols` : (overview.bestSector ?? "-") },
  ];

  const statusCards = [
    { label: "Active universe", value: overview.totalScanned ?? 0, sub: "symbols scored in the current run" },
    { label: "Live regime", value: liveFeed ? "Streaming" : "Snapshot", sub: `refresh cadence ${liveInterval}s` },
    { label: "Preferred source", value: dataSource === "workbook" ? "Snapshot" : dataSource === "live" ? "Live" : "Hybrid", sub: customUniverseCount ? "custom universe active" : (workbookAvailable ? "API snapshot ready" : "API snapshot pending") },
  ];

  const kpiItems = [
    { label: "Total scanned", value: overview.totalScanned ?? 0, sub: "latest ranked universe", tone: "primary", Icon: IcRadar, trendLabel: `${overview.strongBuy ?? 0} high-conviction names`, sparkData: buildSparklineData([overview.strongBuy ?? 0, overview.buy ?? 0, overview.hold ?? 0, overview.sell ?? 0, overview.avoid ?? 0]) },
    { label: "Strong buy", value: overview.strongBuy ?? 0, sub: "highest conviction signals", tone: "success", Icon: IcTrend, trendLabel: `${fmtPctTotal(overview.strongBuy, overview.totalScanned)} of universe`, sparkData: seriesFromRows(datasets.sectorSummary, "StrongBuy") },
    { label: "Buy", value: overview.buy ?? 0, sub: "positive momentum setups", tone: "primary", Icon: IcRadar, trendLabel: `${fmtPctTotal(overview.buy, overview.totalScanned)} participation`, sparkData: seriesFromRows(datasets.sectorSummary, "Buy") },
    { label: "Sell", value: overview.sell ?? 0, sub: "distribution or weakness", tone: "error", Icon: IcBolt, trendLabel: `${(overview.avoid ?? 0) + (overview.sell ?? 0)} weak signals`, sparkData: seriesFromRows(datasets.sectorSummary, "Sell") },
    { label: "AI picks", value: overview.aiPicks ?? 0, sub: "model-selected names", tone: "secondary", Icon: IcHub, trendLabel: `${Math.min((datasets.aiPicks || []).length, 5)} names highlighted`, sparkData: seriesFromRows(datasets.aiPicks, "AI_Prob") },
    { label: "Accumulation", value: overview.accumulation ?? 0, sub: "money-flow support", tone: "success", Icon: IcTrend, trendLabel: `${fmtPctTotal(overview.accumulation, overview.totalScanned)} showing inflow`, sparkData: firstNumericSeries(datasets.accumulation, ["AI_Prob", "RS_rating_1_100", "DayChange_%"]) },
    { label: "Top sector", value: overview.bestSector ?? "-", sub: "current leadership group", tone: "warning", Icon: IcRadar, trendLabel: `${topSectorSignals(datasets.sectorSummary, overview.bestSector)} positive signals`, sparkData: sectorCompositeSeries(datasets.sectorSummary) },
  ];

  const ctx = {
    dashboard, liveData, activeTab, setActiveTab,
    loading, scanning, error,
    loadStartTime, elapsed,
    dataSource, setDataSource,
    liveFeed, setLiveFeed,
    liveInterval, setLiveInterval,
    liveRows, setLiveRows,
    filters, setFilters,
    symbolInput, setSymbolInput,
    sectorOverridesInput, setSectorOverridesInput,
    deliveryOverridesInput, setDeliveryOverridesInput,
    activeScanRequest, setActiveScanRequest,
    refreshDashboard, handleRunScan,
    myWatchlists, selectedWatchlistName, setSelectedWatchlistName, watchlistLoading,
    loadMyWatchlists, runSelectedWatchlistScan,
    datasets, overview, workbookAvailable, allRanked, customUniverseCount,
    filteredRows, liveRowsToShow, tabRows, sectors, filteredDisplayRows,
    liveHighlights, topMovers, pulseStrip, statusCards, kpiItems,
  };

  return <ScannerCtx.Provider value={ctx}>{children}</ScannerCtx.Provider>;
}

function buildDefaultDirectUniverseSymbols(symbolRows) {
  const catalogRows = (symbolRows || []).map((row) => ({
    symbol: row.symbol || row.Symbol || row.ticker || row.Ticker || "",
    short: row.short || row.Short || "",
    name: row.name || row.Name || row.description || row.Description || "",
  }));

  if (!catalogRows.length) {
    return [];
  }

  const symbols = new Set();
  DEFAULT_DIRECT_GROUP_IDS.forEach((groupId) => {
    filterSymbolsByNseGroup(catalogRows, groupId).forEach((row) => {
      const symbol = normalizeSymbol(row.symbol || row.Symbol || row.ticker || row.Ticker);
      if (symbol) {
        symbols.add(symbol);
      }
    });
  });

  if (symbols.size) {
    return Array.from(symbols).slice(0, 300);
  }

  return catalogRows.slice(0, 250).map((row) => normalizeSymbol(row.symbol)).filter(Boolean);
}

function normalizeRequestedSymbols(symbols, limit = 300) {
  const normalized = (symbols || [])
    .map((symbol) => normalizeSymbol(symbol))
    .filter(Boolean);
  return [...new Set(normalized)].slice(0, limit);
}

function normalizeSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}
