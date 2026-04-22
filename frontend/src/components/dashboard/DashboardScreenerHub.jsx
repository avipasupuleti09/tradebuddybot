import { useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchAllNseSymbols, fetchDashboard, fetchDirectScreener, fetchWatchlistCatalog } from "../../api";
import { filterSymbolsByNseGroup, getNseGroupOption } from "../../nseGroups";
import {
  buildDefaultDirectUniverseSymbols,
  getCachedDefaultScreenerPayload,
  getCachedMarketSymbolRows,
  getCachedWatchlistCatalog,
  isDefaultUniverse,
  normalizeMarketCatalogRows,
  normalizeUniverseSymbol,
  normalizeUniverseSymbols,
  setCachedDefaultScreenerPayload,
  setCachedMarketSymbolRows,
  setCachedWatchlistCatalog,
} from "../../lib/dashboardScreenerBootstrap";
import {
  IcBolt,
  IcChart,
  IcCommand,
  IcFilter,
  IcHub,
  IcRadar,
  IcRefresh,
  IcTable,
  IcTrend,
  IcTune,
} from "../common/Icons";

const FAVORITES_STORAGE_KEY = "tradebuddy-dashboard-screener-favorites";
const QUICK_UNIVERSE_OPTIONS = [
  { id: "market-ranked", label: "All ranked", kind: "preset", value: "market-ranked" },
  { id: "top-200", label: "Top 200 ranked", kind: "basket", value: "top-200" },
];
const DEFAULT_UNIVERSE = QUICK_UNIVERSE_OPTIONS[0];
const RESULT_VIEWS = [
  { id: "table", label: "Table", Icon: IcTable },
  { id: "charts", label: "Charts", Icon: IcChart },
  { id: "heatmap", label: "Heatmap", Icon: IcRadar },
];
const METRIC_TABS = [
  { id: "overview", label: "Overview" },
  { id: "performance", label: "Performance" },
  { id: "valuation", label: "Valuation" },
  { id: "margins", label: "Margins & profitability" },
  { id: "growth", label: "Growth" },
  { id: "liquidity", label: "Liquidity & solvency" },
];
const SCREENER_SECTION_TABS = [
  { id: "screeners", label: "Screeners" },
  { id: "news", label: "News" },
  { id: "analytics", label: "Analytics" },
];
const UNIVERSE_SECTION_META = [
  {
    id: "broad-indices",
    label: "Broad market indices",
    hint: "Core benchmarks and broad baskets",
  },
  {
    id: "sector-indices",
    label: "Market sector indices",
    hint: "Theme and industry-driven market groups",
  },
  {
    id: "stocks",
    label: "Broker & my lists",
    hint: "FYERS-linked and saved custom universes",
  },
  {
    id: "sector-industry",
    label: "Scanner sectors",
    hint: "Sector filters from the ranked screener set",
  },
  {
    id: "etf-others",
    label: "Market ETFs & others",
    hint: "Index trackers, ETFs, and special baskets",
  },
];
const CATEGORY_META = [
  {
    id: "my-screeners",
    label: "My Screeners",
    description: "Pinned and curated ideas from this dashboard.",
    Icon: IcRadar,
  },
  {
    id: "trending-screeners",
    label: "Trending screeners",
    description: "Fast-moving dashboards combining price, volume, and relative strength.",
    Icon: IcTrend,
  },
  {
    id: "intraday-screeners",
    label: "Intraday screeners",
    description: "Identify short-term trading opportunities within the same day.",
    Icon: IcBolt,
  },
  {
    id: "breakout-with-volume",
    label: "Breakout with volume",
    description: "Fresh expansion moves backed by participation and delivery thrust.",
    Icon: IcChart,
  },
  {
    id: "technical-crossovers",
    label: "Technical crossovers and momentum",
    description: "Trend-following crossovers, relative strength, and momentum stacks.",
    Icon: IcTune,
  },
  {
    id: "commodities-futures",
    label: "Commodities futures",
    description: "Commodity-linked leadership baskets across metals, energy, and precious names.",
    Icon: IcCommand,
  },
  {
    id: "futures-scan",
    label: "Futures Scan",
    description: "Long build-up, short build-up, and unwind style scans approximated from live breadth.",
    Icon: IcHub,
  },
  {
    id: "options-trading",
    label: "Options Trading",
    description: "Momentum baskets suited to options-style directional trading.",
    Icon: IcFilter,
  },
  {
    id: "fresh-breakouts",
    label: "Fresh breakouts",
    description: "Highs, lows, and level-based breakout desks inspired by the reference flow.",
    Icon: IcChart,
  },
  {
    id: "near-breakouts",
    label: "Near breakouts",
    description: "Setups clustering just below breakouts or just above breakdown zones.",
    Icon: IcRadar,
  },
  {
    id: "candlestick-screeners",
    label: "Candlestick screeners - EOD",
    description: "End-of-day candle shape and reversal reads using the latest live bar envelope.",
    Icon: IcTable,
  },
  {
    id: "fundamentals",
    label: "Fundamentals",
    description: "Quality, growth, and risk-aware ranking baskets using current scanner factors.",
    Icon: IcTrend,
  },
  {
    id: "etf",
    label: "ETF",
    description: "Index trackers, commodity ETFs, and exchange traded thematic baskets.",
    Icon: IcCommand,
  },
];

const METRIC_CONFIG = {
  overview: {
    chartLabel: "Composite score",
    color: "#5d87ff",
    metric: (row) => numberValue(row.Score),
    columns: [
      { label: "Ticker", get: (row) => compactTicker(row.Ticker) },
      { label: "Sector", get: (row) => row.Sector || "-" },
      { label: "Price", get: (row) => priceValue(row) },
      { label: "Signal", get: (row) => row.Signal || "-" },
      { label: "Day Change %", get: (row) => dayChangeValue(row) },
      { label: "Score", get: (row) => numberValue(row.Score) },
      { label: "AI Prob %", get: (row) => aiProbability(row) },
      { label: "Volume Ratio", get: (row) => numberValue(row.VolRatio) },
    ],
  },
  performance: {
    chartLabel: "Performance spread",
    color: "#13deb9",
    metric: (row) => dayChangeValue(row),
    columns: [
      { label: "Ticker", get: (row) => compactTicker(row.Ticker) },
      { label: "Price", get: (row) => priceValue(row) },
      { label: "Open", get: (row) => openValue(row) },
      { label: "Day Change %", get: (row) => dayChangeValue(row) },
      { label: "Gap %", get: (row) => numberValue(row["GapUp_%"]) },
      { label: "1-Bar %", get: (row) => numberValue(row["IntradayRet_1Bar_%"]) },
      { label: "6-Bar %", get: (row) => numberValue(row["IntradayRet_6Bar_%"]) },
      { label: "From Open %", get: (row) => numberValue(row["DayRetFromOpen_%"]) },
    ],
  },
  valuation: {
    chartLabel: "Setup quality",
    color: "#7460ee",
    metric: (row) => numberValue(row.Score),
    columns: [
      { label: "Ticker", get: (row) => compactTicker(row.Ticker) },
      { label: "Price", get: (row) => priceValue(row) },
      { label: "RS Rating", get: (row) => numberValue(row.RS_rating_1_100) },
      { label: "AI Prob %", get: (row) => aiProbability(row) },
      { label: "Delivery %", get: (row) => numberValue(row.DeliveryPct) },
      { label: "Support", get: (row) => numberValue(row.Support) },
      { label: "Resistance", get: (row) => numberValue(row.Resistance) },
      { label: "Score", get: (row) => numberValue(row.Score) },
    ],
  },
  margins: {
    chartLabel: "Profitability proxies",
    color: "#ffae1f",
    metric: (row) => numberValue(row.AccumScore),
    columns: [
      { label: "Ticker", get: (row) => compactTicker(row.Ticker) },
      { label: "Signal", get: (row) => row.Signal || "-" },
      { label: "Accum Score", get: (row) => numberValue(row.AccumScore) },
      { label: "Volume Ratio", get: (row) => numberValue(row.VolRatio) },
      { label: "Delivery %", get: (row) => numberValue(row.DeliveryPct) },
      { label: "AI Prob %", get: (row) => aiProbability(row) },
      { label: "Risk/Share", get: (row) => numberValue(row.RiskPerShare) },
      { label: "Qty for Risk", get: (row) => numberValue(row["Qty_for_Risk(INR)"]) },
    ],
  },
  growth: {
    chartLabel: "Relative strength",
    color: "#5d87ff",
    metric: (row) => numberValue(row["RS_3M_vs_NIFTY_%"]),
    columns: [
      { label: "Ticker", get: (row) => compactTicker(row.Ticker) },
      { label: "RS 3M %", get: (row) => numberValue(row["RS_3M_vs_NIFTY_%"]) },
      { label: "RS 6M %", get: (row) => numberValue(row["RS_6M_vs_NIFTY_%"]) },
      { label: "RS Rating", get: (row) => numberValue(row.RS_rating_1_100) },
      { label: "Momentum", get: (row) => numberValue(row.IntradayMomentumScore) },
      { label: "AI Prob %", get: (row) => aiProbability(row) },
      { label: "Score", get: (row) => numberValue(row.Score) },
    ],
  },
  liquidity: {
    chartLabel: "Liquidity pulse",
    color: "#fa896b",
    metric: (row) => numberValue(row.VolRatio),
    columns: [
      { label: "Ticker", get: (row) => compactTicker(row.Ticker) },
      { label: "Volume", get: (row) => numberValue(row.Volume) },
      { label: "Avg Vol 20", get: (row) => numberValue(row.AvgVol20) },
      { label: "Volume Ratio", get: (row) => numberValue(row.VolRatio) },
      { label: "ATR14", get: (row) => numberValue(row.ATR14) },
      { label: "Risk/Share", get: (row) => numberValue(row.RiskPerShare) },
      { label: "Qty for Risk", get: (row) => numberValue(row["Qty_for_Risk(INR)"]) },
      { label: "VWAP Dist %", get: (row) => numberValue(row["VWAPDist_%"]) },
    ],
  },
};

function isTransientFyersRateLimit(message) {
  return /request limit reached|retry after few mins|rate limit/i.test(String(message || ""));
}

export default function DashboardScreenerHub() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [universeCatalog, setUniverseCatalog] = useState(null);
  const [universeCatalogLoading, setUniverseCatalogLoading] = useState(false);
  const [marketSymbolRows, setMarketSymbolRows] = useState([]);
  const [marketUniverseLoading, setMarketUniverseLoading] = useState(false);
  const [activeScanSymbols, setActiveScanSymbols] = useState([]);
  const [brokerDashboard, setBrokerDashboard] = useState(null);
  const [brokerLoading, setBrokerLoading] = useState(false);
  const [brokerError, setBrokerError] = useState("");
  const [brokerLastUpdated, setBrokerLastUpdated] = useState("");
  const [activeShellTab, setActiveShellTab] = useState("screeners");
  const [lastUpdated, setLastUpdated] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState("intraday-screeners");
  const [selectedScreenerId, setSelectedScreenerId] = useState("");
  const [resultView, setResultView] = useState("table");
  const [metricTab, setMetricTab] = useState("overview");
  const [showInfo, setShowInfo] = useState(false);
  const [universeOpen, setUniverseOpen] = useState(false);
  const [universeCategory, setUniverseCategory] = useState("broad-indices");
  const [universeSearch, setUniverseSearch] = useState("");
  const [appliedUniverse, setAppliedUniverse] = useState(DEFAULT_UNIVERSE);
  const [draftUniverse, setDraftUniverse] = useState(DEFAULT_UNIVERSE);
  const [favoriteIds, setFavoriteIds] = useState(() => loadFavorites());
  const [tableQuery, setTableQuery] = useState("");
  const [tableSearchOpen, setTableSearchOpen] = useState(false);
  const [tableSort, setTableSort] = useState({ key: "", direction: "desc" });
  const tableSearchInputRef = useRef(null);
  const hasAutoOpenedDefaultScreenerRef = useRef(false);
  const directBootstrapRef = useRef("");
  const shellTabRefreshReadyRef = useRef(false);

  function setScreenerErrorFromFailure(err, fallbackMessage) {
    const message = err?.message || fallbackMessage;
    const hasRankedRows = (dashboard?.datasets?.allRanked || []).length > 0;
    if (hasRankedRows && isTransientFyersRateLimit(message)) {
      setError("");
      return;
    }
    setError(message);
  }

  useEffect(() => {
    loadUniverseCatalog();
    loadMarketUniverseCatalog();
    loadBrokerDashboard();
  }, []);

  useEffect(() => {
    saveFavorites(favoriteIds);
  }, [favoriteIds]);

  useEffect(() => {
    if (!shellTabRefreshReadyRef.current) {
      shellTabRefreshReadyRef.current = true;
      return;
    }
    void refreshActiveShellTab();
  }, [activeShellTab]);

  const allRows = useMemo(() => {
    const datasets = dashboard?.datasets || {};
    return mergeLiveDataWithRows(datasets.allRanked || [], datasets.liveMarket || []);
  }, [dashboard]);

  const marketUniverseCatalog = useMemo(
    () => buildMarketUniverseCatalog(marketSymbolRows, allRows),
    [marketSymbolRows, allRows],
  );
  const defaultDirectUniverseSymbols = useMemo(
    () => buildDefaultDirectUniverseSymbols(marketSymbolRows),
    [marketSymbolRows],
  );
  const activeScanUniverseKey = useMemo(() => activeScanSymbols.join("|"), [activeScanSymbols]);
  const defaultDirectUniverseKey = useMemo(() => defaultDirectUniverseSymbols.join("|"), [defaultDirectUniverseSymbols]);
  const brokerProfile = brokerDashboard?.profile?.data || {};
  const brokerFunds = brokerDashboard?.funds?.fund_limit?.[0] || {};
  const brokerHoldings = brokerDashboard?.holdings?.holdings || [];
  const brokerPositions = brokerDashboard?.positions?.netPositions || [];
  const brokerOrders = brokerDashboard?.orderbook?.orderBook || brokerDashboard?.orderbook?.orderbook || [];
  const brokerTrades = brokerDashboard?.tradebook?.tradeBook || brokerDashboard?.tradebook?.tradebook || [];
  const brokerSummary = brokerDashboard?.summary || {};
  const brokerSymbolMeta = useMemo(() => {
    const next = new Map();
    allRows.forEach((row) => {
      const key = normalizeUniverseSymbol(row.Ticker || row.Symbol || row.symbol);
      if (key && !next.has(key)) {
        next.set(key, row);
      }
    });
    return next;
  }, [allRows]);
  const brokerHoldingRows = useMemo(
    () => brokerHoldings.map((item, index) => normalizeBrokerHolding(item, index, brokerSymbolMeta)),
    [brokerHoldings, brokerSymbolMeta],
  );
  const brokerPositionRows = useMemo(
    () => brokerPositions.map((item, index) => normalizeBrokerPosition(item, index, brokerSymbolMeta)),
    [brokerPositions, brokerSymbolMeta],
  );
  const recentTradeRows = useMemo(
    () => brokerTrades.map((item, index) => normalizeBrokerTrade(item, index)).filter((item) => item.timestamp).slice(0, 8),
    [brokerTrades],
  );
  const recentOrderRows = useMemo(
    () => brokerOrders.map((item, index) => normalizeBrokerOrder(item, index)).filter((item) => item.timestamp).slice(0, 8),
    [brokerOrders],
  );
  const sectorExposure = useMemo(
    () => buildBrokerSectorExposure([...brokerHoldingRows, ...brokerPositionRows]),
    [brokerHoldingRows, brokerPositionRows],
  );
  const topBrokerHoldings = useMemo(
    () => [...brokerHoldingRows].sort((left, right) => (right.currentValue || 0) - (left.currentValue || 0)).slice(0, 6),
    [brokerHoldingRows],
  );
  const topContributors = useMemo(
    () => [...brokerHoldingRows, ...brokerPositionRows]
      .sort((left, right) => (right.totalPnl || 0) - (left.totalPnl || 0))
      .slice(0, 6),
    [brokerHoldingRows, brokerPositionRows],
  );
  const brokerSmartLists = universeCatalog?.tabs?.smart?.lists || [];
  const activeShellTabMeta = SCREENER_SECTION_TABS.find((tab) => tab.id === activeShellTab)
    || SCREENER_SECTION_TABS.find((tab) => tab.id === "screeners")
    || SCREENER_SECTION_TABS[0];

  useEffect(() => {
    if (marketUniverseLoading || !defaultDirectUniverseKey || directBootstrapRef.current === defaultDirectUniverseKey) {
      return;
    }
    if (!defaultDirectUniverseSymbols.length) {
      setLoading(false);
      setError("Unable to build a direct FYERS screener universe.");
      return;
    }
    directBootstrapRef.current = defaultDirectUniverseKey;

    const cachedPayload = getCachedDefaultScreenerPayload(defaultDirectUniverseSymbols);
    if (cachedPayload) {
      setDashboard(cachedPayload);
      setActiveScanSymbols(defaultDirectUniverseSymbols);
      setLastUpdated(formatTimestamp(new Date()));
      setLoading(false);
      return;
    }

    void loadDashboard(false, defaultDirectUniverseSymbols);
  }, [marketUniverseLoading, defaultDirectUniverseKey]);

  useEffect(() => {
    if (activeShellTab === "screeners" && !activeScanUniverseKey && !defaultDirectUniverseKey) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      void refreshActiveShellTab();
    }, 60000);

    return () => window.clearInterval(intervalId);
  }, [activeShellTab, activeScanUniverseKey, defaultDirectUniverseKey]);

  const categories = useMemo(() => buildCategories(allRows, favoriteIds), [allRows, favoriteIds]);
  const activeCategory = useMemo(
    () => categories.find((category) => category.id === activeCategoryId) || categories[0] || null,
    [categories, activeCategoryId],
  );
  const selectedScreener = useMemo(
    () => activeCategory?.cards.find((card) => card.id === selectedScreenerId) || null,
    [activeCategory, selectedScreenerId],
  );
  const universeSections = useMemo(
    () => buildUniverseSections(allRows, universeCatalog, marketUniverseCatalog),
    [allRows, universeCatalog, marketUniverseCatalog],
  );
  const universeSource = universeCatalog?.source || null;
  const filteredUniverseItems = useMemo(() => {
    const items = universeSections[universeCategory] || [];
    const query = universeSearch.trim().toLowerCase();
    if (!query) {
      return items;
    }
    return items.filter((item) => `${item.label} ${item.caption || ""}`.toLowerCase().includes(query));
  }, [universeCategory, universeSearch, universeSections]);
  const universeSectionCards = useMemo(
    () => UNIVERSE_SECTION_META.map((section) => ({
      ...section,
      count: (universeSections[section.id] || []).length,
    })),
    [universeSections],
  );
  const scopedRows = useMemo(() => {
    if (!selectedScreener) {
      return [];
    }
    return applyUniverseFilter(selectedScreener.rows, appliedUniverse);
  }, [selectedScreener, appliedUniverse]);
  const resultColumns = useMemo(() => buildResultColumns(metricTab), [metricTab]);
  const filteredTableRows = useMemo(
    () => filterTableRows(scopedRows, resultColumns, tableQuery),
    [scopedRows, resultColumns, tableQuery],
  );
  const tableRows = useMemo(
    () => sortTableRows(filteredTableRows, resultColumns, tableSort),
    [filteredTableRows, resultColumns, tableSort],
  );
  const chartMetric = METRIC_CONFIG[metricTab] || METRIC_CONFIG.overview;
  const chartRows = useMemo(() => buildChartRows(scopedRows, metricTab), [scopedRows, metricTab]);
  const resultStats = useMemo(() => buildResultStats(scopedRows), [scopedRows]);

  useEffect(() => {
    if (hasAutoOpenedDefaultScreenerRef.current) {
      return;
    }
    if (activeShellTab !== "screeners" || selectedScreenerId || !activeCategory?.cards?.length) {
      return;
    }
    const nextScreenerId = getPreferredCategoryCardId(activeCategory);
    if (!nextScreenerId) {
      return;
    }
    hasAutoOpenedDefaultScreenerRef.current = true;
    setSelectedScreenerId(nextScreenerId);
  }, [activeCategory, activeShellTab, selectedScreenerId]);

  useEffect(() => {
    if (!activeCategory) {
      return;
    }
    if (selectedScreenerId && !activeCategory.cards.some((card) => card.id === selectedScreenerId)) {
      setSelectedScreenerId(getPreferredCategoryCardId(activeCategory));
    }
  }, [activeCategory, selectedScreenerId]);

  useEffect(() => {
    setResultView("table");
    setMetricTab("overview");
    setShowInfo(false);
    setTableQuery("");
    setTableSearchOpen(false);
    setTableSort({ key: "", direction: "desc" });
  }, [selectedScreenerId]);

  async function loadDashboard(isRefresh = false, symbols = null) {
    const symbolsToScan = Array.isArray(symbols) && symbols.length
      ? normalizeUniverseSymbols(symbols)
      : (activeScanSymbols.length ? activeScanSymbols : defaultDirectUniverseSymbols);
    const usingDefaultUniverse = isDefaultUniverse(symbolsToScan, defaultDirectUniverseSymbols);

    if (!symbolsToScan.length) {
      setError("No symbols are available for the FYERS screener universe.");
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (!isRefresh && usingDefaultUniverse) {
      const cachedPayload = getCachedDefaultScreenerPayload(symbolsToScan);
      if (cachedPayload) {
        setError("");
        setDashboard(cachedPayload);
        setActiveScanSymbols(symbolsToScan);
        setLastUpdated(formatTimestamp(new Date()));
        setLoading(false);
        setRefreshing(false);
        return;
      }
    }

    try {
      setError("");
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      const payload = await fetchDirectScreener(symbolsToScan, Math.min(symbolsToScan.length, 350));
      if (usingDefaultUniverse) {
        setCachedDefaultScreenerPayload(symbolsToScan, payload);
      }
      setDashboard(payload);
      setActiveScanSymbols(symbolsToScan);
      setLastUpdated(formatTimestamp(new Date()));
    } catch (err) {
      setScreenerErrorFromFailure(err, "Unable to load direct FYERS screener data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function loadUniverseCatalog() {
    const cachedPayload = getCachedWatchlistCatalog();
    if (cachedPayload) {
      setUniverseCatalog(cachedPayload);
    }

    try {
      setUniverseCatalogLoading(!cachedPayload);
      const payload = await fetchWatchlistCatalog();
      setCachedWatchlistCatalog(payload);
      setUniverseCatalog(payload);
    } catch {
      if (!cachedPayload) {
        setUniverseCatalog(null);
      }
    } finally {
      setUniverseCatalogLoading(false);
    }
  }

  async function loadMarketUniverseCatalog() {
    const cachedRows = getCachedMarketSymbolRows();
    if (cachedRows.length) {
      setMarketSymbolRows(cachedRows);
    }

    try {
      setMarketUniverseLoading(!cachedRows.length);
      const payload = await fetchAllNseSymbols();
      const rows = Array.isArray(payload?.results) ? payload.results : [];
      setCachedMarketSymbolRows(rows);
      setMarketSymbolRows(rows);
    } catch {
      if (!cachedRows.length) {
        setMarketSymbolRows([]);
      }
    } finally {
      setMarketUniverseLoading(false);
    }
  }

  async function loadBrokerDashboard(isRefresh = false) {
    try {
      setBrokerError("");
      if (!brokerDashboard || isRefresh) {
        setBrokerLoading(true);
      }
      const payload = await fetchDashboard();
      setBrokerDashboard(payload);
      setBrokerLastUpdated(formatTimestamp(new Date()));
    } catch (err) {
      setBrokerError(err.message || "Unable to load FYERS broker snapshot.");
    } finally {
      setBrokerLoading(false);
    }
  }

  async function refreshActiveShellTab() {
    if (activeShellTab === "screeners") {
      await Promise.all([
        loadDashboard(true, activeScanSymbols.length ? activeScanSymbols : defaultDirectUniverseSymbols),
        loadUniverseCatalog(),
        loadBrokerDashboard(true),
      ]);
      return;
    }
    await Promise.all([loadBrokerDashboard(true), loadUniverseCatalog()]);
  }

  function openUniverseModal() {
    setDraftUniverse(appliedUniverse);
    setUniverseSearch("");
    setUniverseCategory(detectUniverseSection(appliedUniverse));
    setUniverseOpen(true);
  }

  async function applyUniverseSelection(universe, closeModal = true) {
    if (requiresUniverseScan(universe) && Array.isArray(universe.symbols) && universe.symbols.length) {
      try {
        setRefreshing(true);
        setError("");
        const payload = await fetchDirectScreener(universe.symbols, Math.min(universe.symbols.length, 350));
        if (isDefaultUniverse(universe.symbols, defaultDirectUniverseSymbols)) {
          setCachedDefaultScreenerPayload(universe.symbols, payload);
        }
        setDashboard(payload);
        setActiveScanSymbols(normalizeUniverseSymbols(universe.symbols));
        setLastUpdated(formatTimestamp(new Date()));
        setAppliedUniverse(universe);
        if (closeModal) {
          setUniverseOpen(false);
        }
      } catch (err) {
        setScreenerErrorFromFailure(err, "Unable to load the selected FYERS universe.");
      } finally {
        setRefreshing(false);
      }
      return;
    }

    setAppliedUniverse(universe);
    if (closeModal) {
      setUniverseOpen(false);
    }
  }

  async function applyDraftUniverse() {
    await applyUniverseSelection(draftUniverse, true);
  }

  async function resetUniverse() {
    setDraftUniverse(DEFAULT_UNIVERSE);
    setAppliedUniverse(DEFAULT_UNIVERSE);
    setUniverseSearch("");
    setUniverseCategory("broad-indices");
    setUniverseOpen(false);

    if (defaultDirectUniverseSymbols.length) {
      await loadDashboard(true, defaultDirectUniverseSymbols);
    }
  }

  function toggleFavorite(cardId) {
    setFavoriteIds((current) => (
      current.includes(cardId)
        ? current.filter((item) => item !== cardId)
        : [...current, cardId]
    ));
  }

  function focusTableSearch() {
    if (resultView !== "table") {
      setResultView("table");
    }
    setTableSearchOpen(true);
    window.requestAnimationFrame(() => {
      tableSearchInputRef.current?.focus();
    });
  }

  return (
    <section className="dashboard-screener-shell">
      <div className="dashboard-screener-layout">
        <aside className="dashboard-screener-sidebar">
          <nav className="dashboard-screener-nav" aria-label="Screener categories">
            {categories.map((category) => {
              const Icon = category.Icon;
              return (
                <button
                  key={category.id}
                  type="button"
                  className={`dashboard-screener-nav-btn${category.id === activeCategoryId ? " active" : ""}`}
                  onClick={() => {
                    setActiveShellTab("screeners");
                    setActiveCategoryId(category.id);
                    setSelectedScreenerId(getPreferredCategoryCardId(category));
                  }}
                >
                  <span className="dashboard-screener-nav-icon"><Icon /></span>
                  <span>{category.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="dashboard-screener-main">
          <div className="dashboard-screener-section-tabs" role="tablist" aria-label="Screener shell tabs">
            {SCREENER_SECTION_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeShellTab === tab.id}
                className={`dashboard-screener-section-tab${activeShellTab === tab.id ? " active" : ""}`}
                onClick={() => setActiveShellTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="dashboard-screener-topline">
            <div className="dashboard-screener-breadcrumb">
              {activeShellTabMeta.label}
              {activeShellTab === "screeners" && selectedScreener ? ` / ${activeCategory?.label} / ${selectedScreener.title}` : ""}
            </div>
            <div className="dashboard-screener-topline-actions">
              <span className="dashboard-screener-auto-copy">
                {activeShellTab === "screeners"
                  ? `Refreshes on tab entry and every 60 secs.${lastUpdated ? ` Last sync ${lastUpdated}` : ""}`
                  : `Refreshes on tab entry and every 60 secs.${brokerLastUpdated ? ` Last sync ${brokerLastUpdated}` : ""}`}
              </span>
              <button
                type="button"
                className="dashboard-screener-icon-btn"
                onClick={refreshActiveShellTab}
                disabled={refreshing || brokerLoading}
                title="Refresh screener workspace"
              >
                <IcRefresh />
              </button>
            </div>
          </div>

          {activeShellTab === "home" ? (
            <ShellHomePanel
              loading={brokerLoading}
              error={brokerError}
              profile={brokerProfile}
              funds={brokerFunds}
              summary={brokerSummary}
              holdings={brokerHoldingRows}
              positions={brokerPositionRows}
              trades={recentTradeRows}
              smartLists={brokerSmartLists}
            />
          ) : activeShellTab === "news" ? (
            <ShellNewsPanel
              loading={brokerLoading}
              error={brokerError}
              trades={recentTradeRows}
              orders={recentOrderRows}
            />
          ) : activeShellTab === "analytics" ? (
            <ShellAnalyticsPanel
              loading={brokerLoading}
              error={brokerError}
              summary={brokerSummary}
              holdings={brokerHoldingRows}
              positions={brokerPositionRows}
              sectorExposure={sectorExposure}
              contributors={topContributors}
            />
          ) : loading ? (
            <div className="dashboard-screener-empty-state">
              <div className="scan-cold-spinner" />
              <h3>Loading screeners</h3>
              <p>Preparing the dashboard screener catalog and latest ranked rows.</p>
            </div>
          ) : error && !allRows.length ? (
            <div className="dashboard-screener-empty-state error">
              <h3>FYERS backend unavailable</h3>
              <p>{error}</p>
              <button type="button" className="btn-secondary" onClick={() => loadDashboard(false)}>Retry</button>
            </div>
          ) : !selectedScreener ? (
            <>
              <div className="dashboard-screener-title-block">
                <div>
                  <h2>{activeCategory?.label}</h2>
                  <p>{activeCategory?.description}</p>
                </div>
                <div className="dashboard-screener-title-badge">{activeCategory?.cards.length || 0} screeners</div>
              </div>
              {error ? <div className="dashboard-screener-inline-error">{error}</div> : null}
              <div className="dashboard-screener-card-grid">
                {activeCategory?.cards.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    className={`dashboard-screener-card tone-${card.tone}`}
                    title={`${card.count.toLocaleString()} matching stocks`}
                    onClick={() => setSelectedScreenerId(card.id)}
                  >
                    <div className="dashboard-screener-card-head">
                      <div className="dashboard-screener-card-title-row">
                        <h4>{card.title}</h4>
                        <span className={`dashboard-screener-card-arrow ${card.direction}`}>
                          <DirectionGlyph direction={card.direction} />
                        </span>
                      </div>
                      <div className="dashboard-screener-card-meta-row">
                        <span className="dashboard-screener-card-count">{card.count.toLocaleString()} stocks</span>
                        <span className={`dashboard-screener-card-metric ${card.direction}`}>{card.metricLabel}</span>
                      </div>
                    </div>
                    <p>{card.description}</p>
                    <div className="dashboard-screener-card-preview-row">
                      <div className="dashboard-screener-card-preview-copy">
                        <span className="dashboard-screener-card-preview-label">Lead ticker</span>
                        <strong>{card.leadTicker || "Awaiting data"}</strong>
                      </div>
                      <span className={`dashboard-screener-signal ${signalTone(card.leadSignal)}`}>{card.leadSignal}</span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="dashboard-screener-results">
              <div className="dashboard-screener-result-head">
                <div className="dashboard-screener-result-title">
                  <button type="button" className="dashboard-screener-back-btn" onClick={() => setSelectedScreenerId("")}> 
                    <BackIcon />
                  </button>
                  <div>
                    <h2>{selectedScreener.title}</h2>
                    <p>{selectedScreener.description}</p>
                  </div>
                </div>

                <div className="dashboard-screener-view-tabs" role="tablist" aria-label="Screener result views">
                  {RESULT_VIEWS.map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={resultView === id}
                      className={`dashboard-screener-view-btn${resultView === id ? " active" : ""}`}
                      onClick={() => setResultView(id)}
                    >
                      <Icon />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="dashboard-screener-metric-tabs" role="tablist" aria-label="Screener metric tabs">
                {METRIC_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={metricTab === tab.id}
                    className={`dashboard-screener-metric-btn${metricTab === tab.id ? " active" : ""}`}
                    onClick={() => setMetricTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="dashboard-screener-toolbar">
                <div className="dashboard-screener-toolbar-actions">
                  <button type="button" className="dashboard-screener-control-btn" onClick={() => setShowInfo((current) => !current)}>
                    <span className="dashboard-screener-info-dot">i</span>
                    <span>Screener Info</span>
                  </button>
                  <button
                    type="button"
                    className={`dashboard-screener-control-btn icon-only${favoriteIds.includes(selectedScreener.id) ? " active" : ""}`}
                    onClick={() => toggleFavorite(selectedScreener.id)}
                    title={favoriteIds.includes(selectedScreener.id) ? "Remove from My Screeners" : "Save to My Screeners"}
                  >
                    <HeartIcon filled={favoriteIds.includes(selectedScreener.id)} />
                  </button>
                </div>

                <div className="dashboard-screener-universe-controls">
                  {QUICK_UNIVERSE_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`dashboard-screener-chip${appliedUniverse.id === option.id ? " active" : ""}`}
                      onClick={() => applyUniverseSelection(option, false)}
                    >
                      {option.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`dashboard-screener-control-btn${universeOpen ? " active" : ""}`}
                    onClick={openUniverseModal}
                    aria-haspopup="dialog"
                    aria-expanded={universeOpen}
                    aria-controls="dashboard-screener-universe-modal"
                  >
                    <span>Universe : {appliedUniverse.label}</span>
                    <ChevronIcon />
                  </button>
                  <button
                    type="button"
                    className={`dashboard-screener-control-btn icon-only${universeOpen ? " active" : ""}`}
                    onClick={openUniverseModal}
                    title="Open universe filter"
                    aria-label="Open universe filter"
                    aria-haspopup="dialog"
                    aria-expanded={universeOpen}
                    aria-controls="dashboard-screener-universe-modal"
                  >
                    <IcFilter />
                  </button>
                  <button type="button" className="dashboard-screener-control-btn icon-only" onClick={focusTableSearch} title="Search results">
                    <SearchIcon />
                  </button>
                </div>
              </div>

              {showInfo ? (
                <div className="dashboard-screener-info-panel">
                  <div>
                    <div className="dashboard-screener-overline">Selected screener</div>
                    <h4>{selectedScreener.title}</h4>
                    <p>{selectedScreener.description}</p>
                  </div>
                  <div className="dashboard-screener-info-grid">
                    <InfoStat label="Universe" value={appliedUniverse.label} />
                    <InfoStat label="Scoped stocks" value={resultStats.count.toLocaleString()} />
                    <InfoStat label="Avg day change" value={formatSignedPercent(resultStats.avgChange)} />
                    <InfoStat label="Avg AI" value={formatPercent(resultStats.avgAi, 1)} />
                  </div>
                </div>
              ) : null}

              {resultView === "table" ? (
                <ScreenerResultsTable
                  rows={tableRows}
                  totalCount={scopedRows.length}
                  columns={resultColumns}
                  searchOpen={tableSearchOpen}
                  searchQuery={tableQuery}
                  setSearchQuery={setTableQuery}
                  searchInputRef={tableSearchInputRef}
                  sortState={tableSort}
                  setSortState={setTableSort}
                />
              ) : null}

              {resultView === "charts" ? (
                <div className="dashboard-screener-visual-grid">
                  <div className="dashboard-screener-chart-card">
                    <div className="dashboard-screener-overline">{METRIC_TABS.find((tab) => tab.id === metricTab)?.label}</div>
                    <h4>{chartMetric.chartLabel}</h4>
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={chartRows} margin={{ top: 8, right: 24, left: 0, bottom: 48 }}>
                        <CartesianGrid stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="ticker" stroke="var(--text-muted)" angle={-20} textAnchor="end" height={72} tick={{ fontSize: 11 }} />
                        <YAxis stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(value) => formatMetricTooltip(value, metricTab)} />
                        <Bar dataKey="metric" fill={chartMetric.color} radius={[10, 10, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="dashboard-screener-chart-card summary-card">
                    <div className="dashboard-screener-overline">Breakdown</div>
                    <h4>Screener pulse</h4>
                    <div className="dashboard-screener-breakdown-list">
                      {buildBreakdownRows(scopedRows).map((item) => (
                        <div key={item.label} className="dashboard-screener-breakdown-item">
                          <span>{item.label}</span>
                          <strong>{item.value}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {resultView === "heatmap" ? (
                <HeatmapView rows={scopedRows} metricTab={metricTab} />
              ) : null}
            </div>
          )}
        </div>
      </div>

      {universeOpen ? (
        <div className="dashboard-screener-modal-backdrop" onClick={() => setUniverseOpen(false)}>
          <div
            id="dashboard-screener-universe-modal"
            className="dashboard-screener-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dashboard-screener-universe-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dashboard-screener-modal-head">
              <div className="dashboard-screener-modal-head-copy">
                <div className="dashboard-screener-modal-title-row">
                  <div>
                    <div className="dashboard-screener-modal-eyebrow">Premium scope picker</div>
                    <h3 id="dashboard-screener-universe-title">Universe</h3>
                  </div>
                  <span className="dashboard-screener-modal-pill">
                    {universeSource?.broker_connected ? "Broker-linked" : "Market-backed"}
                  </span>
                </div>
                <p className="dashboard-screener-modal-subcopy">
                  {universeCatalogLoading || marketUniverseLoading
                    ? "Loading broker and market universe lists..."
                    : universeSource?.broker_connected
                      ? "Broker lists are live from FYERS. Market baskets use local constituents with FYERS-backed scans."
                      : "Broker lists are unavailable. Market baskets still use local constituents with FYERS-backed scans."}
                </p>
              </div>
              <button type="button" className="dashboard-screener-icon-btn dashboard-screener-modal-close" onClick={() => setUniverseOpen(false)}>
                <CloseIcon />
              </button>
            </div>
            <div className="dashboard-screener-modal-search-wrap">
              <SearchIcon />
              <input
                type="text"
                className="dashboard-screener-modal-search"
                placeholder="Search lists, sectors, indices, and ETFs"
                value={universeSearch}
                onChange={(event) => setUniverseSearch(event.target.value)}
              />
            </div>

            <div className="dashboard-screener-modal-body">
              <div className="dashboard-screener-modal-sections">
                {universeSectionCards.map(({ id, label, hint, count }) => (
                  <button
                    key={id}
                    type="button"
                    className={`dashboard-screener-modal-section-btn${universeCategory === id ? " active" : ""}`}
                    onClick={() => setUniverseCategory(id)}
                  >
                    <div className="dashboard-screener-modal-section-copy">
                      <strong>{label}</strong>
                      <span>{hint}</span>
                    </div>
                    <em>{count}</em>
                  </button>
                ))}
              </div>

              <div className="dashboard-screener-modal-items">
                {filteredUniverseItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`dashboard-screener-modal-item${draftUniverse.id === item.id ? " active" : ""}`}
                    onClick={() => setDraftUniverse(item)}
                  >
                    <div className="dashboard-screener-modal-item-main">
                      <strong>{item.label}</strong>
                      <span>{item.caption || "Ready for direct FYERS-backed screening"}</span>
                    </div>
                    <div className="dashboard-screener-modal-item-meta">
                      {item.source ? <span className="dashboard-screener-modal-badge">{item.source}</span> : null}
                      <span className="dashboard-screener-modal-select-state">
                        {draftUniverse.id === item.id ? "Selected" : "Choose"}
                      </span>
                    </div>
                  </button>
                ))}
                {!filteredUniverseItems.length ? <div className="dashboard-screener-modal-empty">No universe options match this search.</div> : null}
              </div>
            </div>

            <div className="dashboard-screener-modal-foot">
              <div className="dashboard-screener-modal-foot-note">
                <span>Selected universe</span>
                <strong>{draftUniverse.label}</strong>
                <small>{draftUniverse.caption || "Using the ranked default market scope"}</small>
              </div>
              <div className="dashboard-screener-modal-foot-actions">
                <button type="button" className="btn-secondary" onClick={resetUniverse}>Reset</button>
                <button type="button" className="btn-primary dashboard-screener-modal-apply-btn" onClick={applyDraftUniverse}>Apply</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function InfoStat({ label, value }) {
  return (
    <div className="dashboard-screener-info-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ScreenerResultsTable({
  rows,
  totalCount,
  columns,
  searchOpen,
  searchQuery,
  setSearchQuery,
  searchInputRef,
  sortState,
  setSortState,
}) {
  function handleSort(key) {
    setSortState((current) => (
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "symbol" ? "asc" : "desc" }
    ));
  }

  return (
    <section className="dashboard-screener-table-shell">
      <div className="dashboard-screener-table-toolbar-row">
        <div>
          <div className="dashboard-screener-table-title">Results</div>
          <div className="dashboard-screener-table-count">Showing {rows.length} of {totalCount}</div>
        </div>
        {searchOpen || searchQuery ? (
          <div className="dashboard-screener-inline-search">
            <SearchIcon />
            <input
              ref={searchInputRef}
              type="text"
              className="dashboard-screener-inline-search-input"
              placeholder="Search rows"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
        ) : null}
      </div>

      <div className="dashboard-screener-table-wrap">
        <table className="dashboard-screener-table-grid">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={column.align === "right" ? "align-right" : ""}
                  onClick={column.sortable !== false ? () => handleSort(column.key) : undefined}
                >
                  <span>{column.label}</span>
                  {column.sortable !== false ? (
                    <span className={`sort-arrow${sortState.key === column.key ? " active" : ""}`}>
                      {sortState.key === column.key ? (sortState.direction === "asc" ? "▲" : "▼") : "⇅"}
                    </span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row, index) => (
              <tr key={`${row.Ticker}-${index}`}>
                {columns.map((column) => (
                  <td key={`${column.key}-${row.Ticker}-${index}`} className={column.align === "right" ? "align-right" : ""}>
                    {renderTableCell(column, row)}
                  </td>
                ))}
              </tr>
            )) : (
              <tr>
                <td colSpan={columns.length} className="dashboard-screener-table-empty">No stocks match this screener and universe combination.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function renderTableCell(column, row) {
  if (column.render) {
    return column.render(row);
  }
  const value = column.getValue(row);
  if (column.type === "price") {
    return formatPrice(value);
  }
  if (column.type === "compact") {
    return formatCompactDecimal(value);
  }
  if (column.type === "compact-number") {
    return formatCompactNumber(value);
  }
  if (column.type === "percent") {
    return <span className={metricTone(value)}>{formatPercent(value, 1)}</span>;
  }
  if (column.type === "signed-percent") {
    return <span className={metricTone(value)}>{formatSignedPercent(value, 2)}</span>;
  }
  if (column.type === "signal") {
    return <span className={`dashboard-screener-signal ${signalTone(value)}`}>{value || "-"}</span>;
  }
  return value ?? "-";
}

function DirectionGlyph({ direction }) {
  if (direction === "down") {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14" />
        <path d="m19 12-7 7-7-7" />
      </svg>
    );
  }
  if (direction === "flat") {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14" />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  );
}

function HeatmapView({ rows, metricTab }) {
  const chartMetric = METRIC_CONFIG[metricTab] || METRIC_CONFIG.overview;
  const rankedRows = useMemo(
    () => sortRows(rows, chartMetric.metric, chartMetric.id === "performance" ? "desc" : "desc").slice(0, 32),
    [rows, chartMetric],
  );
  const values = rankedRows.map((row) => chartMetric.metric(row)).filter(Number.isFinite);
  const minValue = values.length ? Math.min(...values) : 0;
  const maxValue = values.length ? Math.max(...values) : 1;

  if (!rankedRows.length) {
    return <div className="dashboard-screener-empty-state compact"><p>No heatmap data for this screener.</p></div>;
  }

  return (
    <div className="dashboard-screener-heatmap-wrap">
      <div className="dashboard-screener-heatmap-legend">
        <span>{METRIC_TABS.find((tab) => tab.id === metricTab)?.label}</span>
        <span>{formatMetricTooltip(minValue, metricTab)}</span>
        <div className="dashboard-screener-heatmap-scale" />
        <span>{formatMetricTooltip(maxValue, metricTab)}</span>
      </div>
      <div className="dashboard-screener-heatmap-grid">
        {rankedRows.map((row) => {
          const metric = chartMetric.metric(row);
          const intensity = computeIntensity(metric, minValue, maxValue);
          return (
            <div
              key={`${row.Ticker}-${metricTab}`}
              className="dashboard-screener-heatmap-card"
              style={{
                background: heatmapColor(metric, intensity),
                borderColor: heatmapBorder(metric),
              }}
            >
              <strong>{compactTicker(row.Ticker)}</strong>
              <span>{row.Signal || row.Sector || "-"}</span>
              <b>{formatMetricTooltip(metric, metricTab)}</b>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getPreferredCategoryCardId(category, preferredId = "") {
  const cards = category?.cards || [];
  if (!cards.length) {
    return "";
  }
  if (preferredId && cards.some((card) => card.id === preferredId)) {
    return preferredId;
  }
  return cards.find((card) => Array.isArray(card.rows) && card.rows.length > 0)?.id || cards[0].id;
}

function buildCategories(rows, favoriteIds) {
  const baseCategories = buildBaseCategories(rows);
  const cardLookup = new Map(
    baseCategories.flatMap((category) => category.cards.map((card) => [card.id, card]))
  );
  const curatedFallbackIds = [
    "intraday-top-gainers",
    "fresh-52w-high-breakout",
    "breakout-volume-52w-high",
    "technical-golden-crossover",
    "fundamentals-quality-compounders",
    "commodities-gold-silver-leaders",
  ];
  const myCards = (favoriteIds.length ? favoriteIds : curatedFallbackIds)
    .map((id) => cardLookup.get(id))
    .filter(Boolean)
    .map((card) => ({ ...card }));

  return [
    {
      ...CATEGORY_META.find((item) => item.id === "my-screeners"),
      cards: myCards,
    },
    ...baseCategories,
  ];
}

function buildBaseCategories(rows) {
  const categoryMetaMap = Object.fromEntries(CATEGORY_META.map((item) => [item.id, item]));

  const strongBuyRows = sortRows(rows.filter((row) => row.Signal === "STRONG BUY" || (row.AI_Pick && row.Accumulation)), compositeRank, "desc");
  const aiPickRows = sortRows(rows.filter((row) => row.AI_Pick || aiProbability(row) >= 62), compositeRank, "desc");
  const accumulationRows = sortRows(rows.filter((row) => row.Accumulation || numberValue(row.AccumScore) >= 68), (row) => numberValue(row.AccumScore), "desc");
  const volumeBreakoutRows = sortRows(rows.filter((row) => row.VolBreakout || numberValue(row.VolRatio) >= 1.9), breakoutRank, "desc");
  const near52wRows = sortRows(rows.filter((row) => row.Near52WHigh), breakoutRank, "desc");
  const rsLeaderRows = sortRows(rows.filter((row) => numberValue(row.RS_rating_1_100) >= 78), (row) => numberValue(row.RS_rating_1_100), "desc");
  const topGainersRows = sortRows(rows.filter((row) => dayChangeValue(row) !== null), dayChangeValue, "desc");
  const topLosersRows = sortRows(rows.filter((row) => dayChangeValue(row) !== null), dayChangeValue, "asc");

  return [
    {
      ...categoryMetaMap["trending-screeners"],
      cards: [
        createCard("trending-intraday-surges", "Intraday surges", "Stocks making sudden, sharp price increase in very small time intervals.", sortRows(rows.filter((row) => intradaySurge(row)), surgeRank, "desc"), "bullish", (row) => numberValue(row["IntradayRet_1Bar_%"]), formatSignedPercent),
        createCard("trending-recovery-from-lows", "Recovery from lows", "Stocks bouncing back strongly after hitting a new low for the day.", sortRows(rows.filter((row) => Boolean(row.ReversalFromLow)), recoveryRank, "desc"), "bullish", dayChangeValue, formatSignedPercent),
        createCard("trending-intraday-falls", "Intraday falls", "Stocks making sudden, sharp price drops in very small time intervals.", sortRows(rows.filter((row) => intradayFall(row)), fallRank, "asc"), "bearish", (row) => numberValue(row["IntradayRet_1Bar_%"]), formatSignedPercent),
        createCard("trending-1m-high-breakout", "1M high breakout", "Names pushing through the 20-day breakout zone with sustained momentum.", sortRows(rows.filter((row) => matchesHighBreakout(row, "1m")), breakoutRank, "desc"), "bullish", breakoutRank, formatCompactDecimal),
        createCard("trending-52w-high-breakout", "52W high breakout", "Stocks pressing into yearly highs with leadership characteristics.", sortRows(rows.filter((row) => matchesHighBreakout(row, "52w")), breakoutRank, "desc"), "bullish", breakoutRank, formatCompactDecimal),
        createCard("trending-all-time-high-breakout", "All-time high breakout", "Near-high leaders with top relative strength and AI confirmation.", sortRows(rows.filter((row) => matchesHighBreakout(row, "ath")), breakoutRank, "desc"), "bullish", compositeRank, formatCompactDecimal),
        createCard("technical-golden-crossover", "Golden crossover", "Above-200 DMA setups with leadership and improving breadth.", sortRows(rows.filter((row) => isGoldenCrossover(row)), compositeRank, "desc"), "bullish", (row) => numberValue(row.RS_rating_1_100), formatCompactDecimal),
        createCard("options-oi-gainers", "OI gainers - options", "High participation proxies using volume, breadth, and high-beta moves.", sortRows(rows.filter((row) => optionsOiGainer(row)), optionsRank, "desc"), "bullish", (row) => numberValue(row.VolRatio), formatCompactDecimal),
        createCard("options-long-buildup", "Long buildup - options", "Directional expansion with positive day return from open and strength persistence.", sortRows(rows.filter((row) => longBuildup(row)), optionsRank, "desc"), "bullish", (row) => numberValue(row["DayRetFromOpen_%"]), formatSignedPercent),
      ],
    },
    {
      ...categoryMetaMap["intraday-screeners"],
      cards: [
        createCard("intraday-top-gainers", "Top gainers", "Stocks with the biggest price increases today.", topGainersRows, "bullish", dayChangeValue, formatSignedPercent),
        createCard("intraday-surges", "Intraday surges", "Stocks making sudden, sharp price increase in very small time intervals.", sortRows(rows.filter((row) => intradaySurge(row)), surgeRank, "desc"), "bullish", (row) => numberValue(row["IntradayRet_1Bar_%"]), formatSignedPercent),
        createCard("intraday-open-equals-low", "Open = low", "Contracts opening at the session low, indicating early buying strength.", sortRows(rows.filter((row) => approxEqual(openValue(row), lowValue(row)) && dayChangeValue(row) > 0), surgeRank, "desc"), "bullish", dayChangeValue, formatSignedPercent),
        createCard("intraday-gap-up", "Gap up", "Stocks that opened significantly higher than the previous close.", sortRows(rows.filter((row) => numberValue(row["GapUp_%"]) >= 0.75), gapRank, "desc"), "bullish", (row) => numberValue(row["GapUp_%"]), formatSignedPercent),
        createCard("intraday-recovery-from-lows", "Recovery from lows", "Stocks bouncing back strongly after a morning washout.", sortRows(rows.filter((row) => Boolean(row.ReversalFromLow)), recoveryRank, "desc"), "bullish", (row) => numberValue(row["DayRetFromOpen_%"]), formatSignedPercent),
        createCard("intraday-high-volume", "Unusually high volume", "Stocks trading with much higher volume than usual.", sortRows(rows.filter((row) => numberValue(row.VolRatio) >= 2), (row) => numberValue(row.VolRatio), "desc"), "neutral", (row) => numberValue(row.VolRatio), formatCompactDecimal),
        createCard("intraday-only-buyers", "Only buyers", "Stocks locked at the session high with little selling pressure.", sortRows(rows.filter((row) => approxEqual(priceValue(row), highValue(row)) && dayChangeValue(row) > 0), surgeRank, "desc"), "bullish", dayChangeValue, formatSignedPercent),
        createCard("intraday-gap-down-reversal", "Gap down reversal", "Stocks that gapped lower at the open but are now reclaiming ground.", sortRows(rows.filter((row) => numberValue(row["GapUp_%"]) <= -0.6 && numberValue(row["DayRetFromOpen_%"]) >= 0.6), recoveryRank, "desc"), "bullish", (row) => numberValue(row["DayRetFromOpen_%"]), formatSignedPercent),
        createCard("intraday-top-losers", "Top losers", "Stocks with the biggest price drops today.", topLosersRows, "bearish", dayChangeValue, formatSignedPercent),
        createCard("intraday-falls", "Intraday falls", "Stocks making sudden, sharp price drops in very small time intervals.", sortRows(rows.filter((row) => intradayFall(row)), fallRank, "asc"), "bearish", (row) => numberValue(row["IntradayRet_1Bar_%"]), formatSignedPercent),
        createCard("intraday-open-equals-high", "Open = high", "Contracts opening at the session high, indicating early selling pressure.", sortRows(rows.filter((row) => approxEqual(openValue(row), highValue(row)) && dayChangeValue(row) < 0), fallRank, "asc"), "bearish", dayChangeValue, formatSignedPercent),
        createCard("intraday-gap-down", "Gap down", "Stocks that opened significantly lower than the previous close.", sortRows(rows.filter((row) => numberValue(row["GapUp_%"]) <= -0.75), gapRank, "asc"), "bearish", (row) => numberValue(row["GapUp_%"]), formatSignedPercent),
        createCard("intraday-fall-from-highs", "Fall from highs", "Stocks dropping sharply after reaching a new high for the day.", sortRows(rows.filter((row) => approxEqual(priceValue(row), lowValue(row)) && dayChangeValue(row) < 0), fallRank, "asc"), "bearish", dayChangeValue, formatSignedPercent),
        createCard("intraday-only-sellers", "Only sellers", "Stocks locked near session lows with no meaningful bounce.", sortRows(rows.filter((row) => approxEqual(priceValue(row), lowValue(row)) && dayChangeValue(row) <= -0.4), fallRank, "asc"), "bearish", dayChangeValue, formatSignedPercent),
        createCard("intraday-gap-up-reversal", "Gap up reversal", "Stocks that gapped up at the open but are now fading intraday.", sortRows(rows.filter((row) => numberValue(row["GapUp_%"]) >= 0.6 && numberValue(row["DayRetFromOpen_%"]) <= -0.5), fallRank, "asc"), "bearish", (row) => numberValue(row["DayRetFromOpen_%"]), formatSignedPercent),
        createCard("intraday-most-traded", "Most traded", "Stocks with the highest participation and notional interest today.", sortRows(rows.filter((row) => numberValue(row.Volume) !== null), (row) => numberValue(row.Volume), "desc"), "neutral", (row) => numberValue(row.Volume), formatCompactNumber),
      ],
    },
    {
      ...categoryMetaMap["breakout-with-volume"],
      cards: buildBreakoutCards(rows, true),
    },
    {
      ...categoryMetaMap["technical-crossovers"],
      cards: [
        createCard("technical-golden-crossover-core", "Golden crossover", "Leadership setups above long-term trend with relative strength support.", sortRows(rows.filter((row) => isGoldenCrossover(row)), compositeRank, "desc"), "bullish", (row) => numberValue(row.RS_rating_1_100), formatCompactDecimal),
        createCard("technical-momentum-continuation", "Momentum continuation", "Positive trend continuation with volume and day-return support.", sortRows(rows.filter((row) => continuationMomentum(row)), continuationRank, "desc"), "bullish", dayChangeValue, formatSignedPercent),
        createCard("technical-rsi-strength", "RSI strength", "Momentum setups with RSI above 60 and price above long-term trend.", sortRows(rows.filter((row) => numberValue(row.RSI14) >= 60 && row.Above200DMA), continuationRank, "desc"), "bullish", (row) => numberValue(row.RSI14), formatCompactDecimal),
        createCard("technical-rs-leaders", "Relative strength leaders", "Top ranked outperformers versus NIFTY across medium horizons.", rsLeaderRows, "bullish", (row) => numberValue(row.RS_rating_1_100), formatCompactDecimal),
        createCard("technical-vwap-reclaim", "VWAP reclaim", "Stocks trading back above VWAP after opening weaker.", sortRows(rows.filter((row) => numberValue(row["VWAPDist_%"]) >= 0.2 && numberValue(row["DayRetFromOpen_%"]) > 0), recoveryRank, "desc"), "bullish", (row) => numberValue(row["VWAPDist_%"]), formatSignedPercent),
        createCard("technical-death-crossover", "Death crossover", "Weak trend structures trading below 200 DMA with falling breadth.", sortRows(rows.filter((row) => isDeathCrossover(row)), bearishCompositeRank, "asc"), "bearish", (row) => numberValue(row.RS_rating_1_100), formatCompactDecimal),
        createCard("technical-rsi-breakdown", "RSI breakdown", "Stocks with RSI below 40 and persistent intraday weakness.", sortRows(rows.filter((row) => numberValue(row.RSI14) <= 40 && dayChangeValue(row) < 0), bearishCompositeRank, "asc"), "bearish", (row) => numberValue(row.RSI14), formatCompactDecimal),
        createCard("technical-trend-below-200dma", "Trend below 200DMA", "Laggards below major moving averages with weak relative strength.", sortRows(rows.filter((row) => row.Above200DMA === false), bearishCompositeRank, "asc"), "bearish", dayChangeValue, formatSignedPercent),
        createCard("technical-mean-reversion", "Mean reversion bounce", "Oversold names attempting a tactical bounce from support.", sortRows(rows.filter((row) => meanReversionBounce(row)), recoveryRank, "desc"), "bullish", (row) => numberValue(row.Support), formatPrice),
      ],
    },
    {
      ...categoryMetaMap["commodities-futures"],
      cards: [
        createCard("commodities-gold-silver-leaders", "Gold & silver leaders", "Precious-metal linked counters and ETFs with current strength.", sortRows(filterRowsByGroup(rows, "gold-silver"), compositeRank, "desc"), "bullish", dayChangeValue, formatSignedPercent),
        createCard("commodities-metals-momentum", "Metals momentum", "Nifty Metals constituents with improving breakout pressure.", sortRows(filterRowsByGroup(rows, "nifty-metals").filter((row) => dayChangeValue(row) >= 0), continuationRank, "desc"), "bullish", dayChangeValue, formatSignedPercent),
        createCard("commodities-energy-thrust", "Energy thrust", "Energy-linked leaders supported by momentum and relative strength.", sortRows(filterRowsByGroup(rows, "nifty-energy").filter((row) => dayChangeValue(row) >= 0), continuationRank, "desc"), "bullish", dayChangeValue, formatSignedPercent),
        createCard("commodities-oil-gas-breakout", "Oil and gas breakout", "Oil and gas names pressing into expansion zones.", sortRows(filterRowsByGroup(rows, "nifty-oil-and-gas").filter((row) => breakoutRank(row) >= 40), breakoutRank, "desc"), "bullish", breakoutRank, formatCompactDecimal),
        createCard("commodities-commodities-basket", "Commodity basket surge", "Broader commodity basket names ranked by current scanner score.", sortRows(filterRowsByGroup(rows, "nifty-commodities"), compositeRank, "desc"), "neutral", (row) => numberValue(row.Score), formatCompactDecimal),
        createCard("commodities-infra-buildout", "Infra raw-material buildout", "Infra and heavy materials names with delivery-supported moves.", sortRows(filterRowsByGroup(rows, "nifty-infra").filter((row) => numberValue(row.DeliveryPct) >= 40), continuationRank, "desc"), "bullish", (row) => numberValue(row.DeliveryPct), formatPercent),
      ],
    },
    {
      ...categoryMetaMap["futures-scan"],
      cards: [
        createCard("futures-long-buildup", "Long buildup", "Price up with expanding participation and positive return from open.", sortRows(rows.filter((row) => longBuildup(row)), optionsRank, "desc"), "bullish", dayChangeValue, formatSignedPercent),
        createCard("futures-short-buildup", "Short buildup", "Price down with expanding participation and persistent weakness.", sortRows(rows.filter((row) => shortBuildup(row)), bearishCompositeRank, "asc"), "bearish", dayChangeValue, formatSignedPercent),
        createCard("futures-short-covering", "Short covering", "Weak leaders squeezing higher from support zones.", sortRows(rows.filter((row) => shortCovering(row)), recoveryRank, "desc"), "bullish", (row) => numberValue(row["DayRetFromOpen_%"]), formatSignedPercent),
        createCard("futures-long-unwinding", "Long unwinding", "Losing momentum after prior leadership with fading day-from-open returns.", sortRows(rows.filter((row) => longUnwinding(row)), bearishCompositeRank, "asc"), "bearish", (row) => numberValue(row["DayRetFromOpen_%"]), formatSignedPercent),
        createCard("futures-high-delivery", "High delivery thrust", "Delivery-supported setups with improving relative strength.", sortRows(rows.filter((row) => numberValue(row.DeliveryPct) >= 48 && dayChangeValue(row) > 0), continuationRank, "desc"), "bullish", (row) => numberValue(row.DeliveryPct), formatPercent),
        createCard("futures-breakdown-pressure", "Breakdown with pressure", "Support breaches backed by rising volume ratio and weak breadth.", sortRows(rows.filter((row) => matchesLowBreakout(row, "s1") && numberValue(row.VolRatio) >= 1.5), bearishCompositeRank, "asc"), "bearish", (row) => numberValue(row.VolRatio), formatCompactDecimal),
      ],
    },
    {
      ...categoryMetaMap["options-trading"],
      cards: [
        createCard("options-oi-gainers-core", "OI gainers - options", "Fast names with strong participation and high beta proxy behavior.", sortRows(rows.filter((row) => optionsOiGainer(row)), optionsRank, "desc"), "bullish", (row) => numberValue(row.VolRatio), formatCompactDecimal),
        createCard("options-long-buildup-core", "Long buildup - options", "Positive day returns from open with broad participation strength.", sortRows(rows.filter((row) => longBuildup(row)), optionsRank, "desc"), "bullish", (row) => numberValue(row["DayRetFromOpen_%"]), formatSignedPercent),
        createCard("options-short-buildup", "Short buildup - options", "Weak directional names with deep negative day-from-open reading.", sortRows(rows.filter((row) => shortBuildup(row)), bearishCompositeRank, "asc"), "bearish", (row) => numberValue(row["DayRetFromOpen_%"]), formatSignedPercent),
        createCard("options-short-covering", "Short covering - options", "Recovery candidates reclaiming VWAP with urgency.", sortRows(rows.filter((row) => shortCovering(row)), recoveryRank, "desc"), "bullish", (row) => numberValue(row["VWAPDist_%"]), formatSignedPercent),
        createCard("options-high-beta", "High beta momentum", "High score, high AI probability, and elevated participation.", sortRows(rows.filter((row) => compositeRank(row) >= 65), optionsRank, "desc"), "bullish", (row) => aiProbability(row), formatPercent),
        createCard("options-volatility-spike", "Volatility spike", "Extreme movement names suited to fast tactical trading.", sortRows(rows.filter((row) => Math.abs(dayChangeValue(row) || 0) >= 3 && numberValue(row.VolRatio) >= 1.8), optionsRank, "desc"), "neutral", dayChangeValue, formatSignedPercent),
      ],
    },
    {
      ...categoryMetaMap["fresh-breakouts"],
      cards: buildFreshBreakoutCards(rows),
    },
    {
      ...categoryMetaMap["near-breakouts"],
      cards: buildNearBreakoutCards(rows),
    },
    {
      ...categoryMetaMap["candlestick-screeners"],
      cards: [
        createCard("candles-bullish-marubozu", "Bullish marubozu", "Open near low and price pressing the session high.", sortRows(rows.filter((row) => approxEqual(openValue(row), lowValue(row)) && approxEqual(priceValue(row), highValue(row)) && dayChangeValue(row) > 0), surgeRank, "desc"), "bullish", dayChangeValue, formatSignedPercent),
        createCard("candles-hammer", "Hammer", "Long lower wick with close recovering toward the session high.", sortRows(rows.filter((row) => isHammer(row)), recoveryRank, "desc"), "bullish", (row) => numberValue(row["DayRetFromOpen_%"]), formatSignedPercent),
        createCard("candles-close-near-high", "Close near high", "Names closing firmly in the upper end of the live range.", sortRows(rows.filter((row) => closeNearHigh(row)), surgeRank, "desc"), "bullish", dayChangeValue, formatSignedPercent),
        createCard("candles-bullish-reversal", "Bullish reversal", "Gap-down recovery and support reclaim setups.", sortRows(rows.filter((row) => bullishReversal(row)), recoveryRank, "desc"), "bullish", (row) => numberValue(row["DayRetFromOpen_%"]), formatSignedPercent),
        createCard("candles-bearish-marubozu", "Bearish marubozu", "Open near high and price pressing the session low.", sortRows(rows.filter((row) => approxEqual(openValue(row), highValue(row)) && approxEqual(priceValue(row), lowValue(row)) && dayChangeValue(row) < 0), fallRank, "asc"), "bearish", dayChangeValue, formatSignedPercent),
        createCard("candles-shooting-star", "Shooting star", "Long upper wick with sellers forcing a late fade.", sortRows(rows.filter((row) => isShootingStar(row)), bearishCompositeRank, "asc"), "bearish", (row) => numberValue(row["DayRetFromOpen_%"]), formatSignedPercent),
        createCard("candles-close-near-low", "Close near low", "Names ending near the bottom of the intraday range.", sortRows(rows.filter((row) => closeNearLow(row)), fallRank, "asc"), "bearish", dayChangeValue, formatSignedPercent),
        createCard("candles-bearish-reversal", "Bearish reversal", "Gap-up fades and failure swings below VWAP.", sortRows(rows.filter((row) => bearishReversal(row)), bearishCompositeRank, "asc"), "bearish", (row) => numberValue(row["DayRetFromOpen_%"]), formatSignedPercent),
      ],
    },
    {
      ...categoryMetaMap["fundamentals"],
      cards: [
        createCard("fundamentals-quality-compounders", "Quality compounders", "High score names with AI confirmation, accumulation, and long-term trend support.", strongBuyRows, "bullish", (row) => numberValue(row.Score), formatCompactDecimal),
        createCard("fundamentals-high-rs-leaders", "High RS leaders", "Sector leaders with strong medium-term outperformance versus NIFTY.", rsLeaderRows, "bullish", (row) => numberValue(row.RS_rating_1_100), formatCompactDecimal),
        createCard("fundamentals-accumulation-leaders", "Accumulation leaders", "Delivery and volume-supported leadership setups.", accumulationRows, "bullish", (row) => numberValue(row.AccumScore), formatCompactDecimal),
        createCard("fundamentals-high-delivery", "High delivery names", "Stocks attracting strong delivery participation.", sortRows(rows.filter((row) => numberValue(row.DeliveryPct) >= 45), (row) => numberValue(row.DeliveryPct), "desc"), "neutral", (row) => numberValue(row.DeliveryPct), formatPercent),
        createCard("fundamentals-low-risk-entries", "Low risk entries", "Tighter stop-distance candidates with stable breadth metrics.", sortRows(rows.filter((row) => lowRiskEntry(row)), (row) => numberValue(row.RiskPerShare), "asc"), "bullish", (row) => numberValue(row.RiskPerShare), formatPrice),
        createCard("fundamentals-turnaround", "Turnaround candidates", "Recovery setups where AI and reversal cues start improving from weak zones.", sortRows(rows.filter((row) => turnaroundCandidate(row)), recoveryRank, "desc"), "bullish", aiProbability, formatPercent),
      ],
    },
    {
      ...categoryMetaMap["etf"],
      cards: [
        createCard("etf-gold", "Gold ETFs", "Gold-linked ETFs and trackers in the current ranked universe.", sortRows(filterRowsByTickerPattern(filterRowsByGroup(rows, "gold-silver"), /(GOLD|BEES|ETF|IETF)/), compositeRank, "desc"), "bullish", dayChangeValue, formatSignedPercent),
        createCard("etf-silver", "Silver ETFs", "Silver-linked trackers and related exchange traded symbols.", sortRows(filterRowsByTickerPattern(rows, /(SILVER|SILV)/), compositeRank, "desc"), "bullish", dayChangeValue, formatSignedPercent),
        createCard("etf-nifty50", "Nifty 50 ETFs", "Index trackers tied to the Nifty 50 basket.", sortRows(filterRowsByTickerPattern(rows, /(NIFTY|BEES|ETF|IETF)/), compositeRank, "desc"), "neutral", dayChangeValue, formatSignedPercent),
        createCard("etf-bank", "Bank ETFs", "Banking tracker ETFs and bank-heavy index vehicles.", sortRows(filterRowsByTickerPattern(filterRowsByGroup(rows, "nifty-bank"), /(BANK|ETF|BEES|IETF)/), compositeRank, "desc"), "neutral", dayChangeValue, formatSignedPercent),
        createCard("etf-sensex", "Sensex ETFs", "Sensex trackers and related benchmark vehicles.", sortRows(filterRowsByTickerPattern(filterRowsByGroup(rows, "bse-sensex"), /(SENSEX|ETF|BEES|IETF)/), compositeRank, "desc"), "neutral", dayChangeValue, formatSignedPercent),
        createCard("etf-sector", "Sector ETFs", "Theme and sector-linked exchange traded baskets.", sortRows(filterRowsByTickerPattern(rows, /(ETF|BEES|IETF)/), compositeRank, "desc"), "neutral", (row) => numberValue(row.Score), formatCompactDecimal),
      ],
    },
  ];
}

function buildBreakoutCards(rows, withVolume) {
  const prefix = withVolume ? "breakout-volume" : "fresh";
  return [
    createBreakoutCard(rows, prefix, "1w", "high", withVolume),
    createBreakoutCard(rows, prefix, "1m", "high", withVolume),
    createBreakoutCard(rows, prefix, "6m", "high", withVolume),
    createBreakoutCard(rows, prefix, "52w", "high", withVolume),
    createBreakoutCard(rows, prefix, "2y", "high", withVolume),
    createBreakoutCard(rows, prefix, "ath", "high", withVolume),
    createBreakoutCard(rows, prefix, "1w", "low", withVolume),
    createBreakoutCard(rows, prefix, "1m", "low", withVolume),
    createBreakoutCard(rows, prefix, "6m", "low", withVolume),
    createBreakoutCard(rows, prefix, "52w", "low", withVolume),
    createBreakoutCard(rows, prefix, "2y", "low", withVolume),
    createBreakoutCard(rows, prefix, "ath", "low", withVolume),
  ];
}

function buildFreshBreakoutCards(rows) {
  return [
    createBreakoutCard(rows, "fresh", "1w", "high", false),
    createBreakoutCard(rows, "fresh", "1m", "high", false),
    createBreakoutCard(rows, "fresh", "6m", "high", false),
    createBreakoutCard(rows, "fresh", "52w", "high", false),
    createBreakoutCard(rows, "fresh", "2y", "high", false),
    createBreakoutCard(rows, "fresh", "ath", "high", false),
    createBreakoutCard(rows, "fresh", "r1", "high", false),
    createBreakoutCard(rows, "fresh", "r2", "high", false),
    createBreakoutCard(rows, "fresh", "1w", "low", false),
    createBreakoutCard(rows, "fresh", "1m", "low", false),
    createBreakoutCard(rows, "fresh", "6m", "low", false),
    createBreakoutCard(rows, "fresh", "52w", "low", false),
    createBreakoutCard(rows, "fresh", "2y", "low", false),
    createBreakoutCard(rows, "fresh", "ath", "low", false),
    createBreakoutCard(rows, "fresh", "s1", "low", false),
    createBreakoutCard(rows, "fresh", "s2", "low", false),
  ];
}

function buildNearBreakoutCards(rows) {
  return [
    createBreakoutCard(rows, "near", "1w", "high", false, true),
    createBreakoutCard(rows, "near", "1m", "high", false, true),
    createBreakoutCard(rows, "near", "6m", "high", false, true),
    createBreakoutCard(rows, "near", "52w", "high", false, true),
    createBreakoutCard(rows, "near", "2y", "high", false, true),
    createBreakoutCard(rows, "near", "ath", "high", false, true),
    createBreakoutCard(rows, "near", "r1", "high", false, true),
    createBreakoutCard(rows, "near", "r2", "high", false, true),
    createBreakoutCard(rows, "near", "1w", "low", false, true),
    createBreakoutCard(rows, "near", "52w", "low", false, true),
    createBreakoutCard(rows, "near", "s1", "low", false, true),
    createBreakoutCard(rows, "near", "s2", "low", false, true),
  ];
}

function createBreakoutCard(rows, prefix, level, side, withVolume, near = false) {
  const isHigh = side === "high";
  const title = breakoutTitle(level, side, withVolume, near);
  const id = `${prefix}-${level}-${side}${withVolume ? "-volume" : ""}${near ? "-near" : ""}`;
  const matchingRows = sortRows(
    rows.filter((row) => (
      isHigh
        ? matchesHighBreakout(row, level, withVolume, near)
        : matchesLowBreakout(row, level, withVolume, near)
    )),
    isHigh ? breakoutRank : bearishCompositeRank,
    isHigh ? "desc" : "asc",
  );

  return createCard(
    id,
    title,
    breakoutDescription(level, side, withVolume, near),
    matchingRows,
    isHigh ? "bullish" : "bearish",
    isHigh ? breakoutRank : dayChangeValue,
    isHigh ? formatCompactDecimal : formatSignedPercent,
  );
}

function buildUniverseSections(rows, universeCatalog, marketUniverseCatalog) {
  const smartLists = (universeCatalog?.tabs?.smart?.lists || []).map((list) => catalogListToUniverseItem(list, "watchlist", "Broker"));
  const myWatchlists = Object.entries(universeCatalog?.tabs?.my?.watchlists || {}).map(([name, symbols]) => ({
    id: `wl-${slugify(name)}`,
    label: name,
    kind: "watchlist",
    value: slugify(name),
    symbols: normalizeUniverseSymbols(symbols),
    caption: `My list | ${(symbols || []).length} symbols`,
    source: "My Watchlist",
    scanMode: "broker",
  }));
  const sectorOptions = Array.from(new Set(rows.map((row) => row.Sector).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b))
    .map((sector) => ({ id: `sector-${sector}`, label: sector, kind: "sector", value: sector, caption: "Scanner sector" }));

  return {
    "broad-indices": marketUniverseCatalog.broadIndices,
    "sector-indices": marketUniverseCatalog.sectorIndices,
    stocks: [...smartLists, ...myWatchlists],
    "sector-industry": sectorOptions,
    "etf-others": marketUniverseCatalog.etfOthers,
  };
}

function applyUniverseFilter(rows, universe) {
  if (!rows?.length || !universe) {
    return rows || [];
  }

  if (universe.kind === "watchlist" || universe.kind === "market-list") {
    const symbols = new Set(normalizeUniverseSymbols(universe.symbols));
    if (!symbols.size) {
      return rows;
    }
    return rows.filter((row) => symbols.has(normalizeUniverseSymbol(row.Ticker || row.Symbol || row.symbol)));
  }

  if (universe.kind === "preset") {
    if (universe.value === "market-ranked") {
      return rows;
    }
    return rows;
  }

  if (universe.kind === "group") {
    return filterRowsByGroup(rows, universe.value);
  }

  if (universe.kind === "sector") {
    return rows.filter((row) => row.Sector === universe.value);
  }

  if (universe.kind === "basket") {
    switch (universe.value) {
      case "top-200":
        return sortRows(rows, compositeRank, "desc").slice(0, 200);
      case "top-100":
        return sortRows(rows, compositeRank, "desc").slice(0, 100);
      case "ai-picks":
        return rows.filter((row) => row.AI_Pick || aiProbability(row) >= 62);
      case "accumulation":
        return rows.filter((row) => row.Accumulation || numberValue(row.AccumScore) >= 68);
      case "strong-buy":
        return rows.filter((row) => row.Signal === "STRONG BUY" || (row.AI_Pick && row.Accumulation));
      case "index-tracker":
        return filterRowsByTickerPattern(rows, /(ETF|BEES|IETF)/);
      case "etf":
        return filterRowsByTickerPattern(rows, /(ETF|BEES|IETF|GOLD|SILVER)/);
      case "sensex-etf":
        return filterRowsByTickerPattern(rows, /(SENSEX|BANKEX|ETF|IETF)/);
      default:
        return rows;
    }
  }

  return rows;
}

function buildResultColumns(metricTab) {
  const metricColumns = {
    overview: [
      resultColumn("signal", "Signal", (row) => row.Signal, "signal"),
      resultColumn("score", "Score", (row) => numberValue(row.Score), "compact", "right"),
      resultColumn("dayChange", "Day Change %", dayChangeValue, "signed-percent", "right"),
      resultColumn("volRatio", "Volume Ratio", (row) => numberValue(row.VolRatio), "compact", "right"),
      resultColumn("aiProb", "AI Prob %", aiProbability, "percent", "right"),
      resultColumn("support", "Support", (row) => numberValue(row.Support), "price", "right"),
      resultColumn("resistance", "Resistance", (row) => numberValue(row.Resistance), "price", "right"),
    ],
    performance: [
      resultColumn("dayChange", "Day Change %", dayChangeValue, "signed-percent", "right"),
      resultColumn("gap", "Gap %", (row) => numberValue(row["GapUp_%"]), "signed-percent", "right"),
      resultColumn("oneBar", "1 Bar %", (row) => numberValue(row["IntradayRet_1Bar_%"]), "signed-percent", "right"),
      resultColumn("sixBar", "6 Bar %", (row) => numberValue(row["IntradayRet_6Bar_%"]), "signed-percent", "right"),
      resultColumn("fromOpen", "From Open %", (row) => numberValue(row["DayRetFromOpen_%"]), "signed-percent", "right"),
      resultColumn("vwap", "VWAP Dist %", (row) => numberValue(row["VWAPDist_%"]), "signed-percent", "right"),
      resultColumn("volRatio", "Volume Ratio", (row) => numberValue(row.VolRatio), "compact", "right"),
    ],
    valuation: [
      resultColumn("rsRating", "RS Rating", (row) => numberValue(row.RS_rating_1_100), "compact", "right"),
      resultColumn("delivery", "Delivery %", (row) => numberValue(row.DeliveryPct), "percent", "right"),
      resultColumn("score", "Score", (row) => numberValue(row.Score), "compact", "right"),
      resultColumn("aiProb", "AI Prob %", aiProbability, "percent", "right"),
      resultColumn("support", "Support", (row) => numberValue(row.Support), "price", "right"),
      resultColumn("resistance", "Resistance", (row) => numberValue(row.Resistance), "price", "right"),
      resultColumn("riskPerShare", "Risk/Share", (row) => numberValue(row.RiskPerShare), "price", "right"),
    ],
    margins: [
      resultColumn("signal", "Signal", (row) => row.Signal, "signal"),
      resultColumn("accumScore", "Accum Score", (row) => numberValue(row.AccumScore), "compact", "right"),
      resultColumn("volRatio", "Volume Ratio", (row) => numberValue(row.VolRatio), "compact", "right"),
      resultColumn("delivery", "Delivery %", (row) => numberValue(row.DeliveryPct), "percent", "right"),
      resultColumn("aiProb", "AI Prob %", aiProbability, "percent", "right"),
      resultColumn("riskPerShare", "Risk/Share", (row) => numberValue(row.RiskPerShare), "price", "right"),
      resultColumn("riskQty", "Qty for Risk", (row) => numberValue(row["Qty_for_Risk(INR)"]), "compact-number", "right"),
    ],
    growth: [
      resultColumn("rs3m", "RS 3M %", (row) => numberValue(row["RS_3M_vs_NIFTY_%"]), "signed-percent", "right"),
      resultColumn("rs6m", "RS 6M %", (row) => numberValue(row["RS_6M_vs_NIFTY_%"]), "signed-percent", "right"),
      resultColumn("rsRating", "RS Rating", (row) => numberValue(row.RS_rating_1_100), "compact", "right"),
      resultColumn("momentum", "Momentum", (row) => numberValue(row.IntradayMomentumScore), "compact", "right"),
      resultColumn("aiProb", "AI Prob %", aiProbability, "percent", "right"),
      resultColumn("score", "Score", (row) => numberValue(row.Score), "compact", "right"),
    ],
    liquidity: [
      resultColumn("volume", "Volume", (row) => numberValue(row.Volume), "compact-number", "right"),
      resultColumn("avgVol", "Avg Vol 20", (row) => numberValue(row.AvgVol20), "compact-number", "right"),
      resultColumn("volRatio", "Volume Ratio", (row) => numberValue(row.VolRatio), "compact", "right"),
      resultColumn("atr14", "ATR14", (row) => numberValue(row.ATR14), "compact", "right"),
      resultColumn("riskPerShare", "Risk/Share", (row) => numberValue(row.RiskPerShare), "price", "right"),
      resultColumn("vwap", "VWAP Dist %", (row) => numberValue(row["VWAPDist_%"]), "signed-percent", "right"),
      resultColumn("riskQty", "Qty for Risk", (row) => numberValue(row["Qty_for_Risk(INR)"]), "compact-number", "right"),
    ],
  };

  return [
    {
      key: "symbol",
      label: "Symbol",
      getValue: (row) => compactTicker(row.Ticker),
      render: (row) => <SymbolCell row={row} />,
    },
    {
      key: "trend",
      label: "",
      sortable: false,
      render: (row) => <MiniTrendSparkline row={row} />,
    },
    {
      key: "price",
      label: "Price",
      align: "right",
      getValue: (row) => priceValue(row),
      render: (row) => <PriceCell row={row} />,
    },
    ...(metricColumns[metricTab] || metricColumns.overview),
  ];
}

function resultColumn(key, label, getValue, type, align = "left") {
  return { key, label, getValue, type, align };
}

function filterTableRows(rows, columns, query) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return rows;
  }
  return rows.filter((row) => {
    const searchable = [
      compactTicker(row.Ticker),
      exchangeLabel(row.Ticker),
      row.Sector,
      row.Signal,
      ...columns.map((column) => column.getValue?.(row)),
    ]
      .filter((value) => value !== null && value !== undefined)
      .join(" ")
      .toLowerCase();
    return searchable.includes(normalizedQuery);
  });
}

function sortTableRows(rows, columns, sortState) {
  if (!sortState?.key) {
    return rows;
  }
  const column = columns.find((item) => item.key === sortState.key);
  if (!column || column.sortable === false) {
    return rows;
  }
  const accessor = column.getValue || ((row) => row[column.key]);
  return [...rows].sort((left, right) => compareSortValues(accessor(left), accessor(right), sortState.direction));
}

function compareSortValues(left, right, direction) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  const bothNumeric = Number.isFinite(leftNumber) && Number.isFinite(rightNumber);
  if (bothNumeric) {
    return direction === "asc" ? leftNumber - rightNumber : rightNumber - leftNumber;
  }
  const leftText = String(left ?? "");
  const rightText = String(right ?? "");
  return direction === "asc"
    ? leftText.localeCompare(rightText)
    : rightText.localeCompare(leftText);
}

function buildChartRows(rows, metricTab) {
  const config = METRIC_CONFIG[metricTab] || METRIC_CONFIG.overview;
  return sortRows(rows, config.metric, metricTab === "liquidity" ? "desc" : "desc")
    .slice(0, 12)
    .map((row) => ({
      ticker: compactTicker(row.Ticker),
      metric: config.metric(row) ?? 0,
    }));
}

function buildBreakdownRows(rows) {
  return [
    { label: "Bullish signals", value: rows.filter((row) => /BUY/.test(row.Signal || "")).length.toLocaleString() },
    { label: "Bearish signals", value: rows.filter((row) => /(SELL|AVOID)/.test(row.Signal || "")).length.toLocaleString() },
    { label: "Avg delivery", value: formatPercent(average(rows, (row) => numberValue(row.DeliveryPct)), 1) },
    { label: "Avg RS rating", value: formatCompactDecimal(average(rows, (row) => numberValue(row.RS_rating_1_100))) },
    { label: "Avg score", value: formatCompactDecimal(average(rows, (row) => numberValue(row.Score))) },
  ];
}

function buildResultStats(rows) {
  return {
    count: rows.length,
    positive: rows.filter((row) => (dayChangeValue(row) || 0) > 0).length,
    avgChange: average(rows, dayChangeValue),
    avgAi: average(rows, aiProbability),
    avgVolumeRatio: average(rows, (row) => numberValue(row.VolRatio)),
  };
}

function createCard(id, title, description, rows, tone = "neutral", metricAccessor = compositeRank, metricFormatter = formatCompactDecimal) {
  const safeRows = rows || [];
  const leadRow = safeRows[0];
  const metricValue = leadRow ? metricAccessor(leadRow) : null;
  return {
    id,
    title,
    description,
    rows: safeRows,
    count: safeRows.length,
    tone,
    direction: tone === "bearish" ? "down" : tone === "bullish" ? "up" : "flat",
    metricValue,
    metricLabel: metricFormatter(metricValue),
    leadTicker: leadRow ? compactTicker(leadRow.Ticker) : "",
    leadSignal: leadRow?.Signal || "Awaiting fresh data",
  };
}

function mergeLiveDataWithRows(rows, liveDataList) {
  if (!rows || !liveDataList || liveDataList.length === 0) {
    return rows || [];
  }

  const liveMap = {};
  liveDataList.forEach((live) => {
    const symbolKey = normalizeTicker(live.Ticker || live.Symbol || live.symbol);
    if (symbolKey) {
      liveMap[symbolKey] = live;
    }
  });

  return rows.map((row) => {
    const liveRow = liveMap[normalizeTicker(row.Ticker || row.Symbol || row.symbol)];
    if (!liveRow) {
      return row;
    }
    return {
      ...row,
      LTP: pickValue(liveRow, ["LTP", "ltp", "lp", "Price", "price"]) ?? row.LTP,
      Open: pickValue(liveRow, ["Open", "open", "o", "open_price"]) ?? row.Open,
      High: pickValue(liveRow, ["High", "high", "h", "high_price"]) ?? row.High,
      Low: pickValue(liveRow, ["Low", "low", "l", "low_price"]) ?? row.Low,
      Close: pickValue(liveRow, ["Close", "close", "c", "prev_close", "prev_close_price"]) ?? row.Close,
      Volume: pickValue(liveRow, ["Volume", "volume", "v"]) ?? row.Volume,
    };
  });
}

function pickValue(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== null && value !== undefined && value !== "") {
      return value;
    }
  }
  return undefined;
}

function filterRowsByGroup(rows, groupId) {
  const enrichedRows = rows.map((row) => ({
    ...row,
    symbol: row.Ticker || row.Symbol || row.symbol,
    short: compactTicker(row.Ticker || row.Symbol || row.symbol),
    name: `${row.Sector || ""} ${row.Ticker || row.Symbol || row.symbol || ""}`.trim(),
  }));
  return filterSymbolsByNseGroup(enrichedRows, groupId);
}

function filterRowsByTickerPattern(rows, pattern) {
  return rows.filter((row) => pattern.test(String(row.Ticker || "").toUpperCase()));
}

function breakoutTitle(level, side, withVolume, near) {
  const base = {
    "1w": "1W",
    "1m": "1M",
    "6m": "6M",
    "52w": "52W",
    "2y": "2Y",
    ath: "All-time",
    r1: "R1",
    r2: "R2",
    s1: "S1",
    s2: "S2",
  }[level] || level.toUpperCase();

  if (level === "r1" || level === "r2") {
    return `${base} ${near ? "near breakout" : "breakout"}`;
  }
  if (level === "s1" || level === "s2") {
    return `${base} ${near ? "near breakdown" : "breakdown"}`;
  }
  if (near) {
    return `${base} ${side === "high" ? "near high breakout" : "near low breakdown"}`;
  }
  return `${base} ${side === "high" ? "high breakout" : "low breakout"}${withVolume ? " with volume" : ""}`;
}

function breakoutDescription(level, side, withVolume, near) {
  if (near) {
    return side === "high"
      ? `Names clustering just under the ${level.toUpperCase()} breakout trigger.`
      : `Names trading close to the ${level.toUpperCase()} breakdown zone.`;
  }
  if (withVolume) {
    return side === "high"
      ? "Breakout candidates with volume confirmation and participation support."
      : "Breakdown candidates with volume confirmation and selling pressure. ";
  }
  return side === "high"
    ? "Fresh breakout candidates ordered by current strength and breadth."
    : "Fresh breakdown candidates ordered by weakness and pressure.";
}

function matchesHighBreakout(row, level, withVolume = false, near = false) {
  const day = dayChangeValue(row) ?? 0;
  const vol = numberValue(row.VolRatio) ?? 0;
  const rs = numberValue(row.RS_rating_1_100) ?? 0;
  const ai = aiProbability(row) ?? 0;
  const price = priceValue(row);
  const resistance = numberValue(row.Resistance);
  const distHigh = numberValue(row["DistFrom52WHigh_%"]);
  const volumeCheck = !withVolume || vol >= 1.5;

  if (!volumeCheck) {
    return false;
  }

  switch (level) {
    case "1w":
      return near
        ? (day >= -0.2 && (numberValue(row["IntradayRet_1Bar_%"]) ?? 0) >= -0.1 && resistance !== null && price !== null && price >= resistance * 0.985)
        : day >= 0.8 && ((numberValue(row["IntradayRet_1Bar_%"]) ?? 0) >= 0.3 || row.Breakout20D);
    case "1m":
      return near ? row.Breakout20D || (rs >= 65 && day >= -0.5) : Boolean(row.Breakout20D) && day >= 0;
    case "6m":
      return near ? Boolean(row.Near52WHigh) || (distHigh !== null && distHigh <= 3.5) : Boolean(row.Near52WHigh) && rs >= 72;
    case "52w":
      return near ? Boolean(row.Near52WHigh) || (distHigh !== null && distHigh <= 2.5) : Boolean(row.Near52WHigh) && (row.Above200DMA || rs >= 70);
    case "2y":
      return near ? Boolean(row.Near52WHigh) && rs >= 78 : Boolean(row.Near52WHigh) && rs >= 80 && ai >= 58;
    case "ath":
      return near ? Boolean(row.Near52WHigh) && rs >= 84 : Boolean(row.Near52WHigh) && rs >= 85 && ai >= 62 && compositeRank(row) >= 65;
    case "r1":
      return price !== null && resistance !== null && (near ? price >= resistance * 0.99 : price >= resistance);
    case "r2":
      return price !== null && resistance !== null && (near ? price >= resistance * 1.005 : price >= resistance * 1.02);
    default:
      return false;
  }
}

function matchesLowBreakout(row, level, withVolume = false, near = false) {
  const day = dayChangeValue(row) ?? 0;
  const vol = numberValue(row.VolRatio) ?? 0;
  const rs = numberValue(row.RS_rating_1_100) ?? 0;
  const price = priceValue(row);
  const support = numberValue(row.Support);
  const distLow = numberValue(row["DistFrom52WLow_%"]);
  const volumeCheck = !withVolume || vol >= 1.5;

  if (!volumeCheck) {
    return false;
  }

  switch (level) {
    case "1w":
      return near
        ? day <= 0.2 && support !== null && price !== null && price <= support * 1.015
        : day <= -0.8 && ((numberValue(row["IntradayRet_1Bar_%"]) ?? 0) <= -0.3 || numberValue(row["GapUp_%"]) <= -0.4);
    case "1m":
      return near ? row.Above200DMA === false && day <= 0.2 : row.Above200DMA === false && day < 0 && numberValue(row["GapUp_%"]) <= 0;
    case "6m":
      return near ? Boolean(row.Near52WLow) || (distLow !== null && distLow <= 3.5) : Boolean(row.Near52WLow) && rs <= 40;
    case "52w":
      return near ? Boolean(row.Near52WLow) || (distLow !== null && distLow <= 2.5) : Boolean(row.Near52WLow) && row.Above200DMA === false;
    case "2y":
      return near ? Boolean(row.Near52WLow) && rs <= 30 : Boolean(row.Near52WLow) && rs <= 28;
    case "ath":
      return near ? Boolean(row.Near52WLow) && compositeRank(row) <= 45 : Boolean(row.Near52WLow) && compositeRank(row) <= 42;
    case "s1":
      return price !== null && support !== null && (near ? price <= support * 1.01 : price <= support);
    case "s2":
      return price !== null && support !== null && (near ? price <= support * 0.995 : price <= support * 0.98);
    default:
      return false;
  }
}

function intradaySurge(row) {
  return (numberValue(row["IntradayRet_1Bar_%"]) ?? 0) >= 0.55 || (numberValue(row["IntradayRet_6Bar_%"]) ?? 0) >= 1.4;
}

function intradayFall(row) {
  return (numberValue(row["IntradayRet_1Bar_%"]) ?? 0) <= -0.55 || (numberValue(row["IntradayRet_6Bar_%"]) ?? 0) <= -1.4;
}

function isGoldenCrossover(row) {
  return Boolean(row.Above200DMA) && numberValue(row.RS_rating_1_100) >= 68 && dayChangeValue(row) >= 0;
}

function isDeathCrossover(row) {
  return row.Above200DMA === false && numberValue(row.RS_rating_1_100) <= 40 && dayChangeValue(row) <= 0;
}

function continuationMomentum(row) {
  return Boolean(row.Above200DMA) && dayChangeValue(row) >= 1 && numberValue(row.VolRatio) >= 1.2 && numberValue(row["RS_3M_vs_NIFTY_%"]) >= 0;
}

function meanReversionBounce(row) {
  return Boolean(row.ReversalFromLow) && numberValue(row.RiskPerShare) !== null && numberValue(row.RiskPerShare) <= (priceValue(row) || 0) * 0.035;
}

function longBuildup(row) {
  return dayChangeValue(row) >= 1 && numberValue(row.VolRatio) >= 1.4 && numberValue(row["DayRetFromOpen_%"]) >= 0.7;
}

function shortBuildup(row) {
  return dayChangeValue(row) <= -1 && numberValue(row.VolRatio) >= 1.4 && numberValue(row["DayRetFromOpen_%"]) <= -0.7;
}

function shortCovering(row) {
  return Boolean(row.ReversalFromLow) && numberValue(row["VWAPDist_%"]) >= 0 && dayChangeValue(row) >= 0.6;
}

function longUnwinding(row) {
  return dayChangeValue(row) <= -0.8 && numberValue(row["DayRetFromOpen_%"]) <= -0.4 && numberValue(row.RS_rating_1_100) >= 55;
}

function optionsOiGainer(row) {
  return numberValue(row.VolRatio) >= 1.8 && Math.abs(dayChangeValue(row) || 0) >= 1.2 && compositeRank(row) >= 58;
}

function isHammer(row) {
  const open = openValue(row);
  const low = lowValue(row);
  const high = highValue(row);
  const price = priceValue(row);
  if (![open, low, high, price].every(Number.isFinite)) {
    return false;
  }
  const bodyLow = Math.min(open, price);
  const bodyHigh = Math.max(open, price);
  const lowerWick = bodyLow - low;
  const upperWick = high - bodyHigh;
  const body = Math.max(0.1, bodyHigh - bodyLow);
  return lowerWick >= body * 1.6 && upperWick <= body * 0.7;
}

function isShootingStar(row) {
  const open = openValue(row);
  const low = lowValue(row);
  const high = highValue(row);
  const price = priceValue(row);
  if (![open, low, high, price].every(Number.isFinite)) {
    return false;
  }
  const bodyLow = Math.min(open, price);
  const bodyHigh = Math.max(open, price);
  const lowerWick = bodyLow - low;
  const upperWick = high - bodyHigh;
  const body = Math.max(0.1, bodyHigh - bodyLow);
  return upperWick >= body * 1.6 && lowerWick <= body * 0.7;
}

function closeNearHigh(row) {
  return approxEqual(priceValue(row), highValue(row), 0.004) && dayChangeValue(row) > 0;
}

function closeNearLow(row) {
  return approxEqual(priceValue(row), lowValue(row), 0.004) && dayChangeValue(row) < 0;
}

function bullishReversal(row) {
  return numberValue(row["GapUp_%"]) <= -0.4 && numberValue(row["DayRetFromOpen_%"]) >= 0.6 && numberValue(row["VWAPDist_%"]) >= 0;
}

function bearishReversal(row) {
  return numberValue(row["GapUp_%"]) >= 0.4 && numberValue(row["DayRetFromOpen_%"]) <= -0.6 && numberValue(row["VWAPDist_%"]) <= 0;
}

function lowRiskEntry(row) {
  const price = priceValue(row);
  const risk = numberValue(row.RiskPerShare);
  return Number.isFinite(price) && Number.isFinite(risk) && risk > 0 && risk <= price * 0.03 && compositeRank(row) >= 52;
}

function turnaroundCandidate(row) {
  return Boolean(row.ReversalFromLow) && aiProbability(row) >= 50 && (numberValue(row.RS_rating_1_100) ?? 0) <= 60;
}

function breakoutRank(row) {
  return compositeRank(row) + (numberValue(row.VolRatio) ?? 0) * 6 + ((numberValue(row["GapUp_%"]) ?? 0) * 2);
}

function recoveryRank(row) {
  return (numberValue(row["DayRetFromOpen_%"]) ?? 0) * 6 + (dayChangeValue(row) ?? 0) * 4 + (numberValue(row.VolRatio) ?? 0) * 3 + aiProbability(row) * 0.1;
}

function continuationRank(row) {
  return compositeRank(row) + (numberValue(row["RS_3M_vs_NIFTY_%"]) ?? 0) * 4 + (dayChangeValue(row) ?? 0) * 5;
}

function optionsRank(row) {
  return Math.abs(dayChangeValue(row) ?? 0) * 7 + (numberValue(row.VolRatio) ?? 0) * 8 + aiProbability(row) * 0.12;
}

function surgeRank(row) {
  return (numberValue(row["IntradayRet_1Bar_%"]) ?? 0) * 10 + (numberValue(row["IntradayRet_6Bar_%"]) ?? 0) * 5 + (numberValue(row.VolRatio) ?? 0) * 3 + compositeRank(row);
}

function fallRank(row) {
  return (numberValue(row["IntradayRet_1Bar_%"]) ?? 0) * 10 + (numberValue(row["IntradayRet_6Bar_%"]) ?? 0) * 5 + (dayChangeValue(row) ?? 0) * 5;
}

function gapRank(row) {
  return numberValue(row["GapUp_%"]) ?? 0;
}

function compositeRank(row) {
  return (numberValue(row.Score) ?? 0) + (numberValue(row.RS_rating_1_100) ?? 0) * 0.45 + aiProbability(row) * 0.25 + (numberValue(row.VolRatio) ?? 0) * 8;
}

function bearishCompositeRank(row) {
  return (dayChangeValue(row) ?? 0) * 7 - (numberValue(row.RS_rating_1_100) ?? 0) * 0.35 - (numberValue(row.VolRatio) ?? 0) * 2;
}

function sortRows(rows, accessor, direction = "desc") {
  return [...(rows || [])].sort((left, right) => {
    const leftValue = accessor(left);
    const rightValue = accessor(right);
    const safeLeft = Number.isFinite(leftValue) ? leftValue : direction === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    const safeRight = Number.isFinite(rightValue) ? rightValue : direction === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    return direction === "asc" ? safeLeft - safeRight : safeRight - safeLeft;
  });
}

function numberValue(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function aiProbability(row) {
  const probability = numberValue(row.AI_Prob);
  if (probability === null) {
    return 0;
  }
  return probability <= 1 ? probability * 100 : probability;
}

function priceValue(row) {
  return firstNumber(row.LTP, row.CurrentPrice, row.DayClosePrice, row.Close);
}

function openValue(row) {
  return firstNumber(row.Open, row.DayOpen);
}

function highValue(row) {
  return firstNumber(row.High, row["52W_High"]);
}

function lowValue(row) {
  return firstNumber(row.Low, row["52W_Low"]);
}

function dayChangeValue(row) {
  return firstNumber(row["DayChange_%"], row["Chg%"], row["Change_%"]);
}

function firstNumber(...values) {
  for (const value of values) {
    const number = numberValue(value);
    if (number !== null) {
      return number;
    }
  }
  return null;
}

function compactTicker(ticker) {
  return normalizeTicker(ticker).replace(/-EQ$/i, "").replace(/-INDEX$/i, "");
}

function normalizeTicker(ticker) {
  return String(ticker || "")
    .replace(/^NSE:/i, "")
    .replace(/^BSE:/i, "")
    .trim()
    .toUpperCase();
}

function approxEqual(left, right, tolerance = 0.003) {
  if (![left, right].every(Number.isFinite)) {
    return false;
  }
  const base = Math.max(1, Math.abs(right));
  return Math.abs(left - right) / base <= tolerance;
}

function average(rows, accessor) {
  const values = rows.map(accessor).filter(Number.isFinite);
  if (!values.length) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function SymbolCell({ row }) {
  return (
    <div className="dashboard-screener-symbol-cell">
      <strong>{compactTicker(row.Ticker)}</strong>
      <span>{exchangeLabel(row.Ticker)}</span>
    </div>
  );
}

function PriceCell({ row }) {
  const price = priceValue(row);
  const changePct = dayChangeValue(row);
  const absChange = absoluteChangeValue(row);
  return (
    <div className="dashboard-screener-price-cell">
      <strong>{formatPrice(price)}</strong>
      <span className={metricTone(changePct)}>
        {absChange !== null ? `${absChange >= 0 ? "+" : "-"}${formatPrice(Math.abs(absChange))}` : "-"}
        {changePct !== null ? ` (${formatSignedPercent(changePct, 2)})` : ""}
      </span>
    </div>
  );
}

function MiniTrendSparkline({ row }) {
  const points = buildSparklinePoints(row);
  if (!points.length) {
    return <div className="dashboard-screener-mini-trend empty" />;
  }
  const minValue = Math.min(...points);
  const maxValue = Math.max(...points);
  const range = Math.max(1, maxValue - minValue);
  const polyline = points
    .map((value, index) => {
      const x = (index / Math.max(1, points.length - 1)) * 100;
      const y = 100 - ((value - minValue) / range) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="dashboard-screener-mini-trend">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={`dashboard-screener-mini-trend-svg ${metricTone(dayChangeValue(row))}`}>
        <polyline points={polyline} fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function buildSparklinePoints(row) {
  const open = openValue(row);
  const high = highValue(row);
  const low = lowValue(row);
  const price = priceValue(row);
  const support = numberValue(row.Support);
  const resistance = numberValue(row.Resistance);
  const dayChange = dayChangeValue(row) ?? 0;

  const sequence = [];
  if (Number.isFinite(open)) sequence.push(open);
  if (dayChange >= 0) {
    if (Number.isFinite(low)) sequence.push(low);
    if (Number.isFinite(high)) sequence.push(high);
  } else {
    if (Number.isFinite(high)) sequence.push(high);
    if (Number.isFinite(low)) sequence.push(low);
  }
  if (Number.isFinite(price)) sequence.push(price);
  if (Number.isFinite(support) && (!Number.isFinite(low) || Math.abs(support - low) / Math.max(1, Math.abs(low)) > 0.002)) sequence.unshift(support);
  if (Number.isFinite(resistance) && (!Number.isFinite(high) || Math.abs(resistance - high) / Math.max(1, Math.abs(high)) > 0.002)) sequence.push(resistance);
  return sequence.filter(Number.isFinite).slice(0, 6);
}

function absoluteChangeValue(row) {
  const price = priceValue(row);
  const pct = dayChangeValue(row);
  if (!Number.isFinite(price) || !Number.isFinite(pct)) {
    return null;
  }
  const previousClose = price / (1 + pct / 100);
  return price - previousClose;
}

function exchangeLabel(ticker) {
  if (String(ticker || "").toUpperCase().startsWith("BSE:")) {
    return "BSE";
  }
  return "NSE";
}

function formatMetricTooltip(value, metricTab) {
  if (!Number.isFinite(Number(value))) {
    return "-";
  }
  const safe = Number(value);
  if (metricTab === "liquidity" && Math.abs(safe) >= 1000) {
    return formatCompactNumber(safe);
  }
  if (metricTab === "overview" || metricTab === "valuation" || metricTab === "growth" || metricTab === "margins") {
    return formatCompactDecimal(safe);
  }
  if (metricTab === "percent") {
    return formatPercent(safe, 1);
  }
  return formatSignedPercent(safe, 2);
}

function formatPrice(value) {
  const number = numberValue(value);
  if (number === null) {
    return "-";
  }
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number);
}

function formatPercent(value, digits = 2) {
  const number = numberValue(value);
  if (number === null) {
    return "-";
  }
  return `${number.toFixed(digits)}%`;
}

function formatSignedPercent(value, digits = 2) {
  const number = numberValue(value);
  if (number === null) {
    return "-";
  }
  return `${number > 0 ? "+" : number < 0 ? "" : ""}${number.toFixed(digits)}%`;
}

function formatCompactNumber(value) {
  const number = numberValue(value);
  if (number === null) {
    return "-";
  }
  return new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 2 }).format(number);
}

function formatCompactDecimal(value) {
  const number = numberValue(value);
  if (number === null) {
    return "-";
  }
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(number);
}

function metricTone(value) {
  const number = numberValue(value);
  if (number === null) {
    return "neutral";
  }
  if (number > 0) {
    return "positive";
  }
  if (number < 0) {
    return "negative";
  }
  return "neutral";
}

function signalTone(value) {
  const label = String(value || "").toUpperCase();
  if (label.includes("BUY")) {
    return "positive";
  }
  if (label.includes("SELL") || label.includes("AVOID")) {
    return "negative";
  }
  return "neutral";
}

function computeIntensity(value, minValue, maxValue) {
  if (!Number.isFinite(value)) {
    return 0.5;
  }
  if (minValue === maxValue) {
    return 0.75;
  }
  return (value - minValue) / (maxValue - minValue);
}

function heatmapColor(value, intensity) {
  const number = numberValue(value) ?? 0;
  if (number >= 0) {
    return `linear-gradient(180deg, rgba(19, 222, 185, ${0.18 + intensity * 0.34}), rgba(93, 135, 255, ${0.10 + intensity * 0.22}))`;
  }
  return `linear-gradient(180deg, rgba(250, 137, 107, ${0.18 + intensity * 0.34}), rgba(255, 174, 31, ${0.10 + intensity * 0.16}))`;
}

function heatmapBorder(value) {
  const number = numberValue(value) ?? 0;
  return number >= 0 ? "rgba(19, 222, 185, 0.34)" : "rgba(250, 137, 107, 0.32)";
}

function formatTimestamp(date) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function detectUniverseSection(universe) {
  if (!universe) {
    return "broad-indices";
  }
  if (universe.kind === "market-list") {
    return universe.sectionId || "broad-indices";
  }
  if (universe.kind === "watchlist") {
    return "stocks";
  }
  if (universe.kind === "sector") {
    return "sector-industry";
  }
  if (universe.kind === "group") {
    return ["gold-silver"].includes(universe.value) ? "etf-others" : "sector-indices";
  }
  if (universe.kind === "basket") {
    return universe.value.includes("etf") ? "etf-others" : "stocks";
  }
  return "broad-indices";
}

function catalogListToUniverseItem(list, kind = "watchlist", source = "Catalog") {
  const symbols = normalizeUniverseSymbols(list?.symbols || []);
  return {
    id: `catalog-${slugify(list?.id || list?.name || source)}`,
    label: list?.name || source,
    kind,
    value: slugify(list?.id || list?.name || source),
    symbols,
    caption: `${source} | ${symbols.length} symbols`,
    source,
    scanMode: source === "Broker" ? "broker" : undefined,
  };
}

function buildMarketUniverseCatalog(symbolRows, fallbackRows = []) {
  const catalogRows = normalizeMarketCatalogRows(symbolRows, fallbackRows);

  const groupUniverse = (id, label, groupId, sectionId, captionPrefix = "Market universe") => {
    const matchedRows = filterSymbolsByNseGroup(catalogRows, groupId);
    const symbols = normalizeUniverseSymbols(matchedRows.map((row) => row.symbol));
    if (!symbols.length) {
      return null;
    }
    return {
      id,
      label,
      kind: "market-list",
      value: groupId,
      sectionId,
      symbols,
      scanMode: "market",
      caption: `${captionPrefix} | ${symbols.length} symbols`,
      source: "Market",
    };
  };

  const patternUniverse = (id, label, pattern, sectionId, captionPrefix = "Market basket") => {
    const symbols = normalizeUniverseSymbols(
      catalogRows
        .filter((row) => pattern.test(buildMarketCatalogText(row)))
        .map((row) => row.symbol),
    );
    if (!symbols.length) {
      return null;
    }
    return {
      id,
      label,
      kind: "market-list",
      value: id,
      sectionId,
      symbols,
      scanMode: "market",
      caption: `${captionPrefix} | ${symbols.length} symbols`,
      source: "Market",
    };
  };

  return {
    broadIndices: [
      groupUniverse("market-nifty-50", "NIFTY 50", "nifty-50", "broad-indices"),
      groupUniverse("market-nifty-next-50", "Nifty next 50", "niftynxt50", "broad-indices"),
      groupUniverse("market-nifty-bank", "Nifty bank", "nifty-bank", "broad-indices"),
      groupUniverse("market-fin-nifty", "Nifty financial services (Finnifty)", "fin-nifty", "broad-indices"),
      groupUniverse("market-midcap-select", "Nifty midcap select (Midcpnifty)", "nifty-midcap-select", "broad-indices"),
      groupUniverse("market-sensex", "Sensex", "bse-sensex", "broad-indices"),
      groupUniverse("market-bankex", "Bankex", "nifty-bank", "broad-indices", "Mapped market universe"),
    ].filter(Boolean),
    sectorIndices: [
      "nifty-pharma",
      "nifty-it",
      "nifty-private-bank",
      "nifty-psu-bank",
      "fin-nifty",
      "nifty-auto",
      "nifty-fmcg",
      "nifty-media",
      "nifty-realty",
      "nifty-metals",
      "nifty-commodities",
      "nifty-infra",
      "nifty-energy",
      "nifty-oil-and-gas",
      "nifty-healthcare",
    ].map((groupId) => groupUniverse(
      `market-${groupId}`,
      getNseGroupOption(groupId).name,
      groupId,
      "sector-indices",
    )).filter(Boolean),
    etfOthers: [
      groupUniverse("market-gold-silver", "Gold & Silver", "gold-silver", "etf-others"),
      patternUniverse("market-index-trackers", "Index trackers", /(ETF|BEES|IETF).*(NIFTY|SENSEX|BANKEX)|(^|\s)(NIFTY|SENSEX|BANKEX).*(ETF|BEES|IETF)/, "etf-others"),
      patternUniverse("market-etf-basket", "ETF basket", /(ETF|BEES|IETF)/, "etf-others"),
      patternUniverse("market-sensex-etf", "Sensex ETFs", /(SENSEX|BANKEX).*(ETF|BEES|IETF)/, "etf-others"),
    ].filter(Boolean),
  };
}

function buildMarketCatalogText(row) {
  return `${row?.symbol || ""} ${row?.short || ""} ${row?.name || ""}`.toUpperCase();
}

function requiresUniverseScan(universe) {
  return universe?.scanMode === "broker" || universe?.scanMode === "market";
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function loadFavorites() {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveFavorites(favoriteIds) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favoriteIds));
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="20" y1="20" x2="16.65" y2="16.65" />
    </svg>
  );
}

function HeartIcon({ filled }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ShellHomePanel({ loading, error, profile, funds, summary, holdings, positions, trades, smartLists }) {
  if (loading && !holdings.length && !positions.length) {
    return (
      <div className="dashboard-screener-empty-state compact">
        <div className="scan-cold-spinner" />
        <p>Loading FYERS broker overview.</p>
      </div>
    );
  }

  if (error && !holdings.length && !positions.length) {
    return (
      <div className="dashboard-screener-empty-state compact error">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="dashboard-screener-shell-stack">
      {error ? <div className="dashboard-screener-shell-note warning">{error}</div> : null}
      <div className="dashboard-screener-shell-kpis">
        <ShellKpi label="Available balance" value={formatCompactCurrencyValue(funds.equityAmount ?? summary.available_balance ?? 0)} />
        <ShellKpi label="Holdings" value={`${holdings.length}`} subvalue="Long-term positions" />
        <ShellKpi label="Open positions" value={`${positions.length}`} subvalue="Active net positions" />
        <ShellKpi label="Today's activity" value={`${trades.length}`} subvalue="Recent tradebook rows" />
      </div>

      <div className="dashboard-screener-shell-grid two-up">
        <div className="dashboard-screener-chart-card">
          <div className="dashboard-screener-overline">Broker overview</div>
          <h4>{profile.name || profile.display_name || "FYERS account"}</h4>
          <div className="dashboard-screener-activity-list compact">
            <ActivityStat label="FYERS ID" value={profile.fy_id || profile.id || "-"} />
            <ActivityStat label="Client ID" value={profile.fyers_id || profile.client_id || profile.email_id || "-"} />
            <ActivityStat label="Invested value" value={formatCompactCurrencyValue(summary.invested_value ?? 0)} />
            <ActivityStat label="Total P&L" value={formatSignedCurrencyValue(summary.total_pnl ?? 0, true)} tone={metricTone(summary.total_pnl)} />
          </div>
        </div>

        <div className="dashboard-screener-chart-card">
          <div className="dashboard-screener-overline">Broker lists</div>
          <h4>Live FYERS-linked universes</h4>
          {smartLists.length ? (
            <div className="dashboard-screener-shell-tag-list">
              {smartLists.map((list) => (
                <span key={list.id || list.name} className="dashboard-screener-shell-tag">
                  <strong>{list.name}</strong>
                  <span>{(list.symbols || []).length} symbols</span>
                </span>
              ))}
            </div>
          ) : (
            <div className="dashboard-screener-shell-note">No live broker lists are available in the current session.</div>
          )}
        </div>
      </div>

      <div className="dashboard-screener-shell-grid two-up">
        <div className="dashboard-screener-chart-card">
          <div className="dashboard-screener-overline">Largest holdings</div>
          <h4>Top exposure by market value</h4>
          <div className="dashboard-screener-activity-list">
            {holdings.slice(0, 6).map((item) => (
              <ActivityRow
                key={item.key}
                title={item.label}
                meta={item.sector}
                value={formatCompactCurrencyValue(item.currentValue)}
                subvalue={formatSignedCurrencyValue(item.totalPnl, true)}
                tone={metricTone(item.totalPnl)}
              />
            ))}
            {!holdings.length ? <div className="dashboard-screener-shell-note">No holdings available from FYERS.</div> : null}
          </div>
        </div>

        <div className="dashboard-screener-chart-card summary-card">
          <div className="dashboard-screener-overline">Broker pulse</div>
          <h4>Latest trade activity</h4>
          <div className="dashboard-screener-breakdown-list">
            {trades.slice(0, 5).map((trade) => (
              <div key={trade.key} className="dashboard-screener-breakdown-item activity-tone">
                <span>{trade.label}</span>
                <strong>{trade.sideLabel} • {formatCompactCurrencyValue(trade.value)}</strong>
              </div>
            ))}
            {!trades.length ? <div className="dashboard-screener-shell-note">No recent trades are available from the broker tradebook.</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ShellNewsPanel({ loading, error, trades, orders }) {
  if (loading && !trades.length && !orders.length) {
    return (
      <div className="dashboard-screener-empty-state compact">
        <div className="scan-cold-spinner" />
        <p>Loading FYERS broker activity.</p>
      </div>
    );
  }

  return (
    <div className="dashboard-screener-shell-stack">
      <div className="dashboard-screener-shell-note">
        FYERS does not expose a news headline feed in this app. This tab shows live broker activity instead.
      </div>
      {error ? <div className="dashboard-screener-shell-note warning">{error}</div> : null}
      <div className="dashboard-screener-shell-grid two-up">
        <div className="dashboard-screener-chart-card">
          <div className="dashboard-screener-overline">Tradebook</div>
          <h4>Latest trades</h4>
          <div className="dashboard-screener-activity-list">
            {trades.map((trade) => (
              <ActivityRow
                key={trade.key}
                title={trade.label}
                meta={trade.timestampLabel}
                value={trade.sideLabel}
                subvalue={formatCompactCurrencyValue(trade.value)}
                tone={trade.sideLabel === "BUY" ? "positive" : "negative"}
              />
            ))}
            {!trades.length ? <div className="dashboard-screener-shell-note">No trades are available in the FYERS tradebook right now.</div> : null}
          </div>
        </div>

        <div className="dashboard-screener-chart-card">
          <div className="dashboard-screener-overline">Orderbook</div>
          <h4>Latest orders</h4>
          <div className="dashboard-screener-activity-list">
            {orders.map((order) => (
              <ActivityRow
                key={order.key}
                title={order.label}
                meta={order.timestampLabel}
                value={order.status}
                subvalue={formatCompactCurrencyValue(order.value)}
                tone={order.statusTone}
              />
            ))}
            {!orders.length ? <div className="dashboard-screener-shell-note">No orders are available in the FYERS orderbook right now.</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ShellAnalyticsPanel({ loading, error, summary, holdings, positions, sectorExposure, contributors }) {
  if (loading && !holdings.length && !positions.length) {
    return (
      <div className="dashboard-screener-empty-state compact">
        <div className="scan-cold-spinner" />
        <p>Loading FYERS analytics.</p>
      </div>
    );
  }

  return (
    <div className="dashboard-screener-shell-stack">
      {error ? <div className="dashboard-screener-shell-note warning">{error}</div> : null}
      <div className="dashboard-screener-shell-kpis">
        <ShellKpi label="Invested value" value={formatCompactCurrencyValue(summary.invested_value ?? 0)} />
        <ShellKpi label="Holdings P&L" value={formatSignedCurrencyValue(summary.holdings_pnl ?? 0, true)} tone={metricTone(summary.holdings_pnl)} />
        <ShellKpi label="Positions P&L" value={formatSignedCurrencyValue(summary.positions_pnl ?? 0, true)} tone={metricTone(summary.positions_pnl)} />
        <ShellKpi label="Total P&L" value={formatSignedCurrencyValue(summary.total_pnl ?? 0, true)} tone={metricTone(summary.total_pnl)} />
      </div>

      <div className="dashboard-screener-visual-grid">
        <div className="dashboard-screener-chart-card">
          <div className="dashboard-screener-overline">Sector mix</div>
          <h4>Exposure by sector</h4>
          {sectorExposure.length ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={sectorExposure.slice(0, 8)} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="sector" stroke="var(--text-muted)" angle={-18} textAnchor="end" height={72} tick={{ fontSize: 11 }} />
                <YAxis stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => formatCompactCurrencyValue(value)} />
                <Bar dataKey="value" fill="#5d87ff" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="dashboard-screener-shell-note">No holdings or positions are available to build sector exposure.</div>
          )}
        </div>

        <div className="dashboard-screener-chart-card summary-card">
          <div className="dashboard-screener-overline">P&L leaders</div>
          <h4>Top contributors</h4>
          <div className="dashboard-screener-breakdown-list">
            {contributors.map((item) => (
              <div key={item.key} className="dashboard-screener-breakdown-item activity-tone">
                <span>{item.label}</span>
                <strong className={metricTone(item.totalPnl)}>{formatSignedCurrencyValue(item.totalPnl, true)}</strong>
              </div>
            ))}
            {!contributors.length ? <div className="dashboard-screener-shell-note">No broker positions are available for P&L analytics.</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ShellKpi({ label, value, subvalue, tone = "neutral" }) {
  return (
    <div className={`dashboard-screener-shell-kpi ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {subvalue ? <small>{subvalue}</small> : null}
    </div>
  );
}

function ActivityStat({ label, value, tone = "neutral" }) {
  return (
    <div className="dashboard-screener-activity-item stat-row">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </div>
  );
}

function ActivityRow({ title, meta, value, subvalue, tone = "neutral" }) {
  return (
    <div className="dashboard-screener-activity-item">
      <div className="dashboard-screener-activity-item-head">
        <strong>{title}</strong>
        <span className={tone}>{value}</span>
      </div>
      <p>{meta}</p>
      {subvalue ? <small>{subvalue}</small> : null}
    </div>
  );
}

function normalizeBrokerHolding(item, index, symbolMeta) {
  const symbol = normalizeUniverseSymbol(item?.symbol || item?.ticker || item?.tradingSymbol || item?.fyToken || item?.fyTokenSymbol);
  const meta = symbol ? symbolMeta.get(symbol) : null;
  const quantity = numberValue(item?.quantity ?? item?.qty ?? item?.holdingQty);
  const marketPrice = firstNumber(item?.ltp, item?.marketPrice, item?.lastTradedPrice, meta ? priceValue(meta) : null);
  const averagePrice = firstNumber(item?.costPrice, item?.avgPrice, item?.buyPrice);
  const currentValue = firstNumber(item?.marketVal, item?.marketValue, marketPrice !== null && quantity !== null ? marketPrice * quantity : null);
  const investedValue = firstNumber(item?.cost, averagePrice !== null && quantity !== null ? averagePrice * quantity : null);
  const totalPnl = firstNumber(item?.pnl, item?.pl, currentValue !== null && investedValue !== null ? currentValue - investedValue : null);

  return {
    key: `holding-${symbol || index}`,
    symbol,
    label: compactTicker(symbol || item?.symbol || `Holding ${index + 1}`),
    sector: meta?.Sector || "Unknown",
    quantity,
    currentValue,
    investedValue,
    totalPnl,
  };
}

function normalizeBrokerPosition(item, index, symbolMeta) {
  const symbol = normalizeUniverseSymbol(item?.symbol || item?.ticker || item?.tradingSymbol);
  const meta = symbol ? symbolMeta.get(symbol) : null;
  const quantity = numberValue(item?.qty ?? item?.netQty ?? item?.netQuantity ?? item?.buyQty ?? item?.sellQty);
  const marketPrice = firstNumber(item?.ltp, item?.marketPrice, item?.lastTradedPrice, meta ? priceValue(meta) : null);
  const averagePrice = firstNumber(item?.avgPrice, item?.buyAvg, item?.sellAvg, item?.costPrice);
  const currentValue = firstNumber(item?.marketVal, item?.marketValue, marketPrice !== null && quantity !== null ? marketPrice * Math.abs(quantity) : null);
  const totalPnl = firstNumber(item?.pl, item?.pnl, item?.realized_profit, item?.unrealized_profit);

  return {
    key: `position-${symbol || index}`,
    symbol,
    label: compactTicker(symbol || item?.symbol || `Position ${index + 1}`),
    sector: meta?.Sector || "Unknown",
    quantity,
    averagePrice,
    currentValue,
    totalPnl,
  };
}

function normalizeBrokerTrade(item, index) {
  const symbol = normalizeUniverseSymbol(item?.symbol || item?.ticker || item?.tradingSymbol);
  const quantity = numberValue(item?.qty ?? item?.tradedQty ?? item?.filledQty);
  const price = firstNumber(item?.tradePrice, item?.tradedPrice, item?.avgTradePrice, item?.ltp);
  const timestamp = item?.tradeTime || item?.orderDateTime || item?.timestamp || item?.updatedTime;
  return {
    key: `trade-${symbol || index}-${timestamp || "na"}`,
    symbol,
    label: compactTicker(symbol || item?.symbol || `Trade ${index + 1}`),
    sideLabel: String(item?.side || item?.transactionType || item?.orderSide || "-").toUpperCase(),
    timestamp,
    timestampLabel: formatBrokerDateTime(timestamp),
    quantity,
    value: quantity !== null && price !== null ? quantity * price : price,
  };
}

function normalizeBrokerOrder(item, index) {
  const symbol = normalizeUniverseSymbol(item?.symbol || item?.ticker || item?.tradingSymbol);
  const quantity = numberValue(item?.qty ?? item?.orderQty ?? item?.filledQty);
  const price = firstNumber(item?.limitPrice, item?.price, item?.avgTradePrice, item?.stopPrice);
  const timestamp = item?.orderDateTime || item?.updatedTime || item?.timestamp;
  const status = String(item?.status || item?.orderStatus || "Pending");
  return {
    key: `order-${symbol || index}-${timestamp || "na"}`,
    symbol,
    label: compactTicker(symbol || item?.symbol || `Order ${index + 1}`),
    status,
    statusTone: /complete|filled|traded/i.test(status) ? "positive" : /cancel|reject|fail/i.test(status) ? "negative" : "neutral",
    timestamp,
    timestampLabel: formatBrokerDateTime(timestamp),
    quantity,
    value: quantity !== null && price !== null ? quantity * price : price,
  };
}

function buildBrokerSectorExposure(rows) {
  const totals = new Map();
  rows.forEach((row) => {
    const sector = row?.sector || "Unknown";
    const value = numberValue(row?.currentValue);
    if (value === null) {
      return;
    }
    totals.set(sector, (totals.get(sector) || 0) + value);
  });
  return [...totals.entries()]
    .map(([sector, value]) => ({ sector, value }))
    .sort((left, right) => right.value - left.value);
}

function formatCompactCurrencyValue(value) {
  const number = numberValue(value);
  if (number === null) {
    return "-";
  }
  const sign = number < 0 ? "-" : "";
  const formatted = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 2 }).format(Math.abs(number));
  return `${sign}₹${formatted}`;
}

function formatSignedCurrencyValue(value, compact = false) {
  const number = numberValue(value);
  if (number === null) {
    return "-";
  }
  const sign = number > 0 ? "+" : number < 0 ? "-" : "";
  if (compact) {
    return `${sign}${formatCompactCurrencyValue(Math.abs(number))}`;
  }
  return `${sign}₹${formatPrice(Math.abs(number))}`;
}

function formatBrokerDateTime(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  const numeric = Number(value);
  const candidate = Number.isFinite(numeric)
    ? new Date(String(Math.trunc(numeric)).length <= 10 ? numeric * 1000 : numeric)
    : new Date(value);
  if (Number.isNaN(candidate.getTime())) {
    return String(value);
  }
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(candidate);
}