import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createChart, createSeriesMarkers, ColorType, CrosshairMode, CandlestickSeries, LineSeries, LineStyle } from "lightweight-charts";
import {
  API_BASE,
  searchSymbols,
  fetchQuotes,
  fetchHistory,
  fetchWatchlistCatalog,
  createWatchlist,
  deleteWatchlist,
  addSymbolToWatchlist,
  removeSymbolFromWatchlist,
} from "../api";
import { normalizeMarketIndexSymbol } from "../lib/marketIndexes";
import { getNextSortState, sortRowsByAccessor } from "../lib/tableSort";

/* ─── helpers ──────────────────────────────────────────────────────────────── */
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function formatNum(v) {
  if (v == null) return "-";
  return Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function splitMarketSymbol(symbol) {
  const [exchange, ticker] = String(symbol || "").split(":");
  return {
    exchange: exchange || "NSE",
    ticker: ticker || String(symbol || ""),
  };
}

function SortableTableHeader({ label, sortKey, sortState, onSort, className = "", align = "left", defaultDirection = "asc" }) {
  const active = sortState.key === sortKey;
  return (
    <th
      className={[className, "table-sortable-header", active ? "is-active" : "", align === "right" ? "align-right" : ""].filter(Boolean).join(" ")}
      onClick={() => onSort(sortKey, defaultDirection)}
    >
      <span className={`table-sort-content${align === "right" ? " align-right" : ""}`}>
        <span>{label}</span>
        <span className={`table-sort-arrow${active ? " active" : ""}`}>{active ? (sortState.direction === "asc" ? "▲" : "▼") : "⇅"}</span>
      </span>
    </th>
  );
}

const MFI_SIGNAL_LENGTH = 10;
const MFI_OVERBOUGHT_LEVEL = 80;
const MFI_OVERSOLD_LEVEL = 20;
const MARKET_TIME_ZONE = "Asia/Kolkata";
const MARKET_TIME_ZONE_LABEL = "IST";
const IST_OFFSET_SECONDS = ((5 * 60) + 30) * 60;
const EMPTY_CHART_REFERENCE_LEVELS = {
  prevClose: null,
  todayHigh: null,
  todayLow: null,
};

function toIstChartTime(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  const epochSeconds = numeric > 1e10 ? Math.floor(numeric / 1000) : numeric;
  return epochSeconds + IST_OFFSET_SECONDS;
}

function getChartReferenceLineColors(isDarkTheme) {
  return isDarkTheme
    ? {
        prevClose: "rgba(125, 227, 255, 0.82)",
        todayHigh: "rgba(250, 137, 107, 0.82)",
        todayLow: "rgba(19, 222, 185, 0.82)",
      }
    : {
        prevClose: "rgba(74, 111, 216, 0.82)",
        todayHigh: "rgba(214, 69, 69, 0.82)",
        todayLow: "rgba(11, 168, 136, 0.82)",
      };
}

function buildChartReferenceItems(levels, colors) {
  return [
    {
      key: "todayHigh",
      price: levels.todayHigh,
      color: colors.todayHigh,
      title: "Day High",
      lineStyle: LineStyle.Dotted,
    },
    {
      key: "prevClose",
      price: levels.prevClose,
      color: colors.prevClose,
      title: "Prev Close",
      lineStyle: LineStyle.Dotted,
    },
    {
      key: "todayLow",
      price: levels.todayLow,
      color: colors.todayLow,
      title: "Day Low",
      lineStyle: LineStyle.Dotted,
    },
  ];
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatMarketClock(value) {
  if (!value) {
    return "--:--:--";
  }
  return value.toLocaleTimeString("en-IN", {
    hour12: false,
    timeZone: MARKET_TIME_ZONE,
  });
}

function mergeQuoteIntoMap(currentQuotes, quote) {
  const symbol = quote?.symbol || quote?.n || quote?.v?.symbol;
  if (!symbol) {
    return currentQuotes;
  }

  const normalizedQuote = {
    ...quote,
    symbol,
    lp: quote?.lp ?? quote?.ltp,
    ltp: quote?.ltp ?? quote?.lp,
    volume: quote?.volume ?? quote?.vol_traded_today,
  };

  return {
    ...currentQuotes,
    [symbol]: {
      ...(currentQuotes[symbol] || {}),
      ...normalizedQuote,
      symbol,
    },
  };
}

function buildChartReferenceLevels(quote = {}) {
  return {
    prevClose: toFiniteNumber(quote.prev_close_price ?? quote.prev_close ?? quote.c),
    todayHigh: toFiniteNumber(quote.high_price ?? quote.h),
    todayLow: toFiniteNumber(quote.low_price ?? quote.l),
  };
}

function hasSameChartReferenceLevels(currentLevels, nextLevels) {
  return currentLevels.prevClose === nextLevels.prevClose
    && currentLevels.todayHigh === nextLevels.todayHigh
    && currentLevels.todayLow === nextLevels.todayLow;
}

function calculateMfiSeries(candles, length = MFI_SIGNAL_LENGTH) {
  const mfiSeries = new Array(candles.length).fill(null);
  const positiveFlow = new Array(candles.length).fill(0);
  const negativeFlow = new Array(candles.length).fill(0);

  for (let index = 1; index < candles.length; index += 1) {
    const source = toFiniteNumber(candles[index]?.close);
    const previousSource = toFiniteNumber(candles[index - 1]?.close);
    const volume = toFiniteNumber(candles[index]?.volume) ?? 0;
    if (source === null || previousSource === null) {
      continue;
    }

    const rawMoneyFlow = source * volume;
    if (source > previousSource) {
      positiveFlow[index] = rawMoneyFlow;
    } else if (source < previousSource) {
      negativeFlow[index] = rawMoneyFlow;
    }
  }

  let positiveWindow = 0;
  let negativeWindow = 0;

  for (let index = 0; index < candles.length; index += 1) {
    positiveWindow += positiveFlow[index];
    negativeWindow += negativeFlow[index];

    if (index >= length) {
      positiveWindow -= positiveFlow[index - length];
      negativeWindow -= negativeFlow[index - length];
    }

    if (index < length) {
      continue;
    }

    if (positiveWindow === 0 && negativeWindow === 0) {
      mfiSeries[index] = 50;
      continue;
    }

    if (negativeWindow === 0) {
      mfiSeries[index] = 100;
      continue;
    }

    const moneyRatio = positiveWindow / negativeWindow;
    mfiSeries[index] = 100 - (100 / (1 + moneyRatio));
  }

  return mfiSeries;
}

function buildMfiArtifacts(candles, length = MFI_SIGNAL_LENGTH) {
  if (!Array.isArray(candles) || candles.length <= length) {
    return { series: [], markers: [], lastValue: null };
  }

  const mfiSeries = calculateMfiSeries(candles, length);
  const series = [];
  const markers = [];
  let lastValue = null;

  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];
    const currentMfi = mfiSeries[index];
    if (currentMfi !== null && candle?.time !== undefined) {
      const roundedValue = Number(currentMfi.toFixed(2));
      series.push({ time: candle.time, value: roundedValue });
      lastValue = roundedValue;
    }

    if (index === 0) {
      continue;
    }

    const previousMfi = mfiSeries[index - 1];
    if (previousMfi === null || currentMfi === null || candle?.time === undefined) {
      continue;
    }

    if (previousMfi > MFI_OVERBOUGHT_LEVEL && currentMfi < MFI_OVERBOUGHT_LEVEL) {
      markers.push({
        time: candle.time,
        position: "aboveBar",
        color: "#fa896b",
        shape: "arrowDown",
        text: "MFI Sell",
      });
      continue;
    }

    if (previousMfi < MFI_OVERSOLD_LEVEL && currentMfi > MFI_OVERSOLD_LEVEL) {
      markers.push({
        time: candle.time,
        position: "belowBar",
        color: "#13deb9",
        shape: "arrowUp",
        text: "MFI Buy",
      });
    }
  }

  return { series, markers, lastValue };
}

function mergeTickIntoCandles(candles, tickCandle, volume) {
  const nextCandles = Array.isArray(candles) ? [...candles] : [];
  if (!tickCandle || tickCandle.time === undefined) {
    return nextCandles;
  }

  const mergedCandle = {
    ...tickCandle,
    volume: volume ?? 0,
  };

  if (!nextCandles.length) {
    return [mergedCandle];
  }

  const lastCandle = nextCandles[nextCandles.length - 1];
  if (lastCandle.time === tickCandle.time) {
    nextCandles[nextCandles.length - 1] = {
      ...lastCandle,
      ...tickCandle,
      volume: volume ?? lastCandle.volume ?? 0,
    };
    return nextCandles;
  }

  if (lastCandle.time < tickCandle.time) {
    nextCandles.push(mergedCandle);
  }

  return nextCandles;
}

function normalizeHistoryCandles(rawCandles) {
  const deduped = new Map();

  for (const candle of Array.isArray(rawCandles) ? rawCandles : []) {
    if (!Array.isArray(candle) || candle.length < 5) {
      continue;
    }

    const time = toIstChartTime(candle[0]);
    const open = Number(candle[1]);
    const high = Number(candle[2]);
    const low = Number(candle[3]);
    const close = Number(candle[4]);
    const volume = Number(candle[5] ?? 0);

    if (![time, open, high, low, close].every(Number.isFinite)) {
      continue;
    }

    deduped.set(time, {
      time,
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) ? volume : 0,
    });
  }

  return Array.from(deduped.values()).sort((left, right) => left.time - right.time);
}


/* ─── All time intervals, grouped like FYERS ──────────────────────────────── */
const ALL_INTERVALS = [
  {
    category: "SECONDS",
    items: [
      { value: "S5", label: "5 seconds" },
      { value: "S10", label: "10 seconds" },
      { value: "S15", label: "15 seconds" },
      { value: "S30", label: "30 seconds" },
      { value: "S45", label: "45 seconds" },
    ],
  },
  {
    category: "MINUTES",
    items: [
      { value: "1", label: "1 minute" },
      { value: "2", label: "2 minutes" },
      { value: "3", label: "3 minutes" },
      { value: "5", label: "5 minutes" },
      { value: "10", label: "10 minutes" },
      { value: "15", label: "15 minutes" },
      { value: "20", label: "20 minutes" },
      { value: "30", label: "30 minutes" },
      { value: "45", label: "45 minutes" },
      { value: "75", label: "75 minutes" },
    ],
  },
  {
    category: "HOURS",
    items: [
      { value: "60", label: "1 hour" },
      { value: "120", label: "2 hours" },
      { value: "180", label: "3 hours" },
      { value: "240", label: "4 hours" },
    ],
  },
  {
    category: "DAYS",
    items: [
      { value: "D", label: "1 day" },
    ],
  },
];

/** Flat ordered list of all interval values for sorting bookmarks ascending */
const INTERVAL_ORDER = ALL_INTERVALS.flatMap((g) => g.items.map((i) => i.value));

function sortBookmarks(bookmarks) {
  return [...bookmarks].sort((a, b) => INTERVAL_ORDER.indexOf(a) - INTERVAL_ORDER.indexOf(b));
}

const DEFAULT_BOOKMARKS = ["1", "5", "10", "30", "60", "D"];
const BOOKMARK_KEY = "tradebuddy_interval_bookmarks";

function loadBookmarks() {
  try {
    const saved = localStorage.getItem(BOOKMARK_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return DEFAULT_BOOKMARKS;
}

function saveBookmarks(bookmarks) {
  localStorage.setItem(BOOKMARK_KEY, JSON.stringify(bookmarks));
}

/** Short label for the top bar buttons */
function shortLabel(value) {
  if (value === "D") return "D";
  if (value.startsWith("S")) return `${value.slice(1)}s`;
  const n = parseInt(value, 10);
  if (n >= 60) return `${n / 60}h`;
  return `${n}m`;
}

const DAYS_OPTIONS = [
  { days: 1, label: "1d" },
  { days: 5, label: "5d" },
  { days: 30, label: "1m" },
  { days: 90, label: "3m" },
  { days: 180, label: "6m" },
  { days: 365, label: "1y" },
  { days: 1825, label: "5y" },
  { days: 3650, label: "10y" },
  { days: 7300, label: "All" },
];

const CHART_TICK_POLL_MS = 5000;

const FALLBACK_PREDEFINED_WATCHLISTS = [
  { id: "nifty50", name: "NIFTY 50", symbols: ["NSE:NIFTY50-INDEX", "NSE:RELIANCE-EQ", "NSE:HDFCBANK-EQ", "NSE:ICICIBANK-EQ", "NSE:INFY-EQ"] },
  { id: "banking", name: "Banking Leaders", symbols: ["NSE:NIFTYBANK-INDEX", "NSE:SBIN-EQ", "NSE:AXISBANK-EQ", "NSE:KOTAKBANK-EQ", "NSE:INDUSINDBK-EQ"] },
  { id: "it", name: "IT Leaders", symbols: ["NSE:NIFTYIT-INDEX", "NSE:TCS-EQ", "NSE:INFY-EQ", "NSE:HCLTECH-EQ", "NSE:WIPRO-EQ"] },
];

const FALLBACK_SMART_WATCHLISTS = [
  { id: "momentum", name: "Momentum Radar", symbols: ["NSE:ADANIENT-EQ", "NSE:TATAMOTORS-EQ", "NSE:LT-EQ", "NSE:BHARTIARTL-EQ", "NSE:BAJFINANCE-EQ"] },
  { id: "defensive", name: "Defensive Picks", symbols: ["NSE:HINDUNILVR-EQ", "NSE:NESTLEIND-EQ", "NSE:ITC-EQ", "NSE:ASIANPAINT-EQ", "NSE:DMART-EQ"] },
  { id: "swing", name: "Swing Candidates", symbols: ["NSE:MARUTI-EQ", "NSE:ULTRACEMCO-EQ", "NSE:TITAN-EQ", "NSE:POWERGRID-EQ", "NSE:ONGC-EQ"] },
];

/* ─── Main component ──────────────────────────────────────────────────────── */
export default function MarketsPage({ defaultChartSymbol, marketHoursActive, refreshSignal, reconnectSeconds = 3 }) {
  const WATCH_TABS = {
    MY: "my",
    PREDEFINED: "predefined",
    SMART: "smart",
  };

  // Watchlists state
  const [watchlists, setWatchlists] = useState({});
  const [activeList, setActiveList] = useState(null);
  const [newListName, setNewListName] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [watchTab, setWatchTab] = useState(WATCH_TABS.MY);
  const [predefinedLists, setPredefinedLists] = useState(FALLBACK_PREDEFINED_WATCHLISTS);
  const [smartLists, setSmartLists] = useState(FALLBACK_SMART_WATCHLISTS);
  const [activePredefined, setActivePredefined] = useState(FALLBACK_PREDEFINED_WATCHLISTS[0].id);
  const [activeSmart, setActiveSmart] = useState(FALLBACK_SMART_WATCHLISTS[0].id);
  const [smartMode, setSmartMode] = useState("screeners");
  const [smartListQuery, setSmartListQuery] = useState("");
  const [smartSymbolQuery, setSmartSymbolQuery] = useState("");
  const [showSmartListMenu, setShowSmartListMenu] = useState(false);
  const [showSmartSortPanel, setShowSmartSortPanel] = useState(false);
  const [showSmartActionsMenu, setShowSmartActionsMenu] = useState(false);
  const [smartSortBy, setSmartSortBy] = useState("chgp");
  const [smartExchanges, setSmartExchanges] = useState(["NSE", "BSE", "MCX"]);
  const [smartSortDraft, setSmartSortDraft] = useState("chgp");
  const [smartExchangesDraft, setSmartExchangesDraft] = useState(["NSE", "BSE", "MCX"]);
  const smartListMenuRef = useRef(null);
  const smartSortPanelRef = useRef(null);
  const smartActionsMenuRef = useRef(null);

  // Symbol search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [addToList, setAddToList] = useState(null); // which list a search result should be added to

  // Quotes for active watchlist
  const [quotes, setQuotes] = useState({});
  const [quotesUpdatedAt, setQuotesUpdatedAt] = useState(null);
  const [watchlistSortState, setWatchlistSortState] = useState({ key: "symbol", direction: "asc" });

  // selected row for chart
  const [selectedSymbol, setSelectedSymbol] = useState(null);

  // Chart state
  const [chartSymbol, setChartSymbol] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [mfiInfo, setMfiInfo] = useState(null);
  const [resolution, setResolution] = useState("5");
  const [days, setDays] = useState(5);
  const [isDarkTheme, setIsDarkTheme] = useState(() => document.documentElement.getAttribute("data-theme") === "dark");
  const [logScale, setLogScale] = useState(false);
  const [percentScale, setPercentScale] = useState(false);
  const [autoScale, setAutoScale] = useState(true);

  // Interval bookmarks & dropdown
  const [bookmarkedIntervals, setBookmarkedIntervals] = useState(() => sortBookmarks(loadBookmarks()));
  const [showIntervalDropdown, setShowIntervalDropdown] = useState(false);
  const intervalDropdownRef = useRef(null);

  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const activePredefinedList = predefinedLists.find((item) => item.id === activePredefined) || predefinedLists[0];
  const smartPortfolioLists = smartLists.filter((item) => /holding|position|trade|portfolio/i.test(`${item.id} ${item.name}`));
  const smartScreenerLists = smartLists.filter((item) => !/holding|position|trade|portfolio/i.test(`${item.id} ${item.name}`));
  const smartVisibleLists = smartMode === "portfolio"
    ? (smartPortfolioLists.length ? smartPortfolioLists : smartLists)
    : (smartScreenerLists.length ? smartScreenerLists : smartLists);
  const activeSmartList = smartVisibleLists.find((item) => item.id === activeSmart) || smartVisibleLists[0];
  const listNames = Object.keys(watchlists);

  const activeSymbols =
    watchTab === WATCH_TABS.MY
      ? (activeList ? (watchlists[activeList] || []) : [])
      : watchTab === WATCH_TABS.PREDEFINED
        ? (activePredefinedList?.symbols || [])
        : (activeSmartList?.symbols || []);

  const smartFilteredLists = smartVisibleLists.filter((item) => item.name.toLowerCase().includes(smartListQuery.trim().toLowerCase()));

  const normalizeExchange = (symbol) => {
    const value = String(symbol || "");
    const prefix = value.split(":")[0] || "NSE";
    return prefix.toUpperCase();
  };

  const smartDisplaySymbols = (() => {
    if (watchTab !== WATCH_TABS.SMART) return activeSymbols;
    const query = smartSymbolQuery.trim().toLowerCase();
    const filtered = activeSymbols.filter((symbol) => {
      const exchange = normalizeExchange(symbol);
      if (!smartExchanges.includes(exchange)) return false;
      if (!query) return true;
      return symbol.toLowerCase().includes(query);
    });

    const sorted = [...filtered];
    if (smartSortBy === "alpha") {
      sorted.sort((a, b) => a.localeCompare(b));
    } else if (smartSortBy === "ltp") {
      sorted.sort((a, b) => Number(quotes[b]?.lp || 0) - Number(quotes[a]?.lp || 0));
    } else if (smartSortBy === "chg") {
      sorted.sort((a, b) => Number(quotes[b]?.ch || 0) - Number(quotes[a]?.ch || 0));
    } else if (smartSortBy === "chgp") {
      sorted.sort((a, b) => Number(quotes[b]?.chp || 0) - Number(quotes[a]?.chp || 0));
    }
    return sorted;
  })();
      const streamSymbols = useMemo(
        () => [...new Set([...activeSymbols, chartSymbol].filter(Boolean))],
        [activeSymbols, chartSymbol],
      );
      const streamSymbolsKey = useMemo(() => streamSymbols.join(","), [streamSymbols]);

  const activeCollectionName =
    watchTab === WATCH_TABS.MY
      ? (activeList || "")
      : watchTab === WATCH_TABS.PREDEFINED
        ? activePredefinedList?.name
        : activeSmartList?.name;

  const selectedWatchlistSymbols = watchTab === WATCH_TABS.SMART ? smartDisplaySymbols : activeSymbols;
  const selectedWatchlistRows = selectedWatchlistSymbols.map((symbol) => {
    const q = quotes[symbol] || {};
    return {
      symbol,
      ltp: q.lp,
      chg: q.ch,
      chgPct: q.chp,
      open: q.open_price ?? q.o,
      high: q.high_price ?? q.h,
      low: q.low_price ?? q.l,
      prevClose: q.prev_close_price ?? q.prev_close ?? q.c,
      volume: q.volume ?? q.v,
    };
  });

  const sortedWatchlistRows = useMemo(() => sortRowsByAccessor(selectedWatchlistRows, watchlistSortState, {
    symbol: (row) => row.symbol.replace(/^NSE:/, ""),
    ltp: (row) => row.ltp,
    chg: (row) => row.chg,
    chgPct: (row) => row.chgPct,
    open: (row) => row.open,
    high: (row) => row.high,
    low: (row) => row.low,
    prevClose: (row) => row.prevClose,
    volume: (row) => row.volume,
  }), [selectedWatchlistRows, watchlistSortState]);

  function handleWatchlistSort(key, defaultDirection) {
    setWatchlistSortState((current) => getNextSortState(current, key, defaultDirection));
  }

  /* ── Load watchlists on mount ── */
  useEffect(() => {
    loadWatchlists();
  }, []);

  useEffect(() => {
    if (!smartVisibleLists.length) return;
    if (!smartVisibleLists.some((item) => item.id === activeSmart)) {
      setActiveSmart(smartVisibleLists[0].id);
    }
  }, [smartMode, smartLists]);

  /* ── Close interval dropdown on outside click ── */
  useEffect(() => {
    function handleClickOutside(e) {
      if (intervalDropdownRef.current && !intervalDropdownRef.current.contains(e.target)) {
        setShowIntervalDropdown(false);
      }
      if (smartListMenuRef.current && !smartListMenuRef.current.contains(e.target)) {
        setShowSmartListMenu(false);
      }
      if (smartSortPanelRef.current && !smartSortPanelRef.current.contains(e.target)) {
        setShowSmartSortPanel(false);
      }
      if (smartActionsMenuRef.current && !smartActionsMenuRef.current.contains(e.target)) {
        setShowSmartActionsMenu(false);
      }
    }
    if (showIntervalDropdown || showSmartListMenu || showSmartSortPanel || showSmartActionsMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showIntervalDropdown, showSmartListMenu, showSmartSortPanel, showSmartActionsMenu]);

  function toggleBookmark(value) {
    setBookmarkedIntervals((prev) => {
      const next = prev.includes(value)
        ? prev.filter((v) => v !== value)
        : [...prev, value];
      const sorted = sortBookmarks(next);
      saveBookmarks(sorted);
      return sorted;
    });
  }

  async function loadWatchlists() {
    try {
      const data = await fetchWatchlistCatalog();
      const myWatchlists = data?.tabs?.my?.watchlists || {};
      const incomingPredefined = data?.tabs?.predefined?.lists || [];
      const incomingSmart = data?.tabs?.smart?.lists || [];
      const effectivePredefined = incomingPredefined.length ? incomingPredefined : FALLBACK_PREDEFINED_WATCHLISTS;
      const effectiveSmart = incomingSmart.length ? incomingSmart : FALLBACK_SMART_WATCHLISTS;

      setWatchlists(myWatchlists);
      setPredefinedLists(effectivePredefined);
      setSmartLists(effectiveSmart);

      // Auto-select first list if nothing selected
      const keys = Object.keys(myWatchlists);
      if (keys.length && !activeList) {
        setActiveList(keys[0]);
      }

      const nextPredefined = effectivePredefined[0];
      const nextSmart = effectiveSmart[0];

      if (nextPredefined && !effectivePredefined.some((item) => item.id === activePredefined)) {
        setActivePredefined(nextPredefined.id);
      }
      if (nextSmart && !effectiveSmart.some((item) => item.id === activeSmart)) {
        setActiveSmart(nextSmart.id);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  /* ── Live quotes streaming for active watchlist + chart symbol ── */
  useEffect(() => {
    if (!streamSymbols.length) {
      setQuotes({});
      return undefined;
    }

    let cancelled = false;
    let socket;
    let reconnectTimer;

    const hydrateQuotes = async () => {
      try {
        const data = await fetchQuotes(streamSymbols);
        if (cancelled) {
          return;
        }

        const map = {};
        (data.d || []).forEach((item) => {
          const sym = item.n || item.v?.symbol;
          if (sym) map[sym] = item.v || {};
        });
        setQuotes(map);
        setQuotesUpdatedAt(new Date());
      } catch {
        // Keep the current snapshot visible if hydration fails.
      }
    };

    const connect = () => {
      if (cancelled) {
        return;
      }

      const wsBase = API_BASE
        ? API_BASE.replace("http://", "ws://").replace("https://", "wss://")
        : `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`;
      socket = new WebSocket(`${wsBase}/api/live?mode=quotes&symbols=${encodeURIComponent(streamSymbolsKey)}`);

      socket.onmessage = (event) => {
        if (cancelled) {
          return;
        }

        try {
          const payload = JSON.parse(event.data);
          if (payload.type !== "quote" || !payload.quote) {
            return;
          }

          setQuotes((current) => mergeQuoteIntoMap(current, payload.quote));
          setQuotesUpdatedAt(new Date());
        } catch {
          // Ignore malformed frames; reconnect or manual refresh will recover the view.
        }
      };

      socket.onerror = () => {
        if (!cancelled && socket?.readyState === WebSocket.OPEN) {
          socket.close();
        }
      };

      socket.onclose = () => {
        if (!cancelled) {
          reconnectTimer = window.setTimeout(connect, Number(reconnectSeconds) * 1000);
        }
      };
    };

    void hydrateQuotes();
    if (!marketHoursActive) {
      return undefined;
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      if (socket) {
        socket.close();
      }
    };
  }, [marketHoursActive, reconnectSeconds, streamSymbols, streamSymbolsKey]);

  /* ── Debounced symbol search ── */
  const doSearch = useCallback(
    debounce(async (q) => {
      if (!q || q.length < 2) {
        setSearchResults([]);
        return;
      }
      setSearchLoading(true);
      try {
        const data = await searchSymbols(q);
        setSearchResults(data.results || []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300),
    []
  );

  useEffect(() => {
    doSearch(searchQuery);
  }, [searchQuery, doSearch]);

  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => setIsDarkTheme(root.getAttribute("data-theme") === "dark");
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  /* ── Chart loading ── */
  const [ohlcInfo, setOhlcInfo] = useState(null); // crosshair hover info
  const [chartReferenceLevels, setChartReferenceLevels] = useState(EMPTY_CHART_REFERENCE_LEVELS);
  const [chartReferenceLabels, setChartReferenceLabels] = useState([]);
  const [chartClock, setChartClock] = useState(() => new Date());
  const chartContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const mfiChartContainerRef = useRef(null);
  const mfiChartInstanceRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const chartReferenceLinesRef = useRef([]);
  const markerSeriesRef = useRef(null);
  const mfiLineSeriesRef = useRef(null);
  const chartDataRef = useRef([]);
  const syncingLogicalRangeRef = useRef(false);
  const defaultChartSeedRef = useRef("");

  useEffect(() => {
    chartDataRef.current = chartData;
  }, [chartData]);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setChartClock(new Date());
    }, 1000);

    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    const nextDefaultChartSymbol = normalizeMarketIndexSymbol(defaultChartSymbol);
    if (defaultChartSeedRef.current === nextDefaultChartSymbol) {
      return;
    }

    defaultChartSeedRef.current = nextDefaultChartSymbol;
    setChartSymbol(nextDefaultChartSymbol);
    setOhlcInfo(null);
  }, [defaultChartSymbol]);

  useEffect(() => {
    if (!chartSymbol) {
      setChartReferenceLevels(EMPTY_CHART_REFERENCE_LEVELS);
      return undefined;
    }

    let cancelled = false;

    fetchQuotes([chartSymbol])
      .then((data) => {
        if (cancelled) {
          return;
        }
        const quote = data?.d?.[0]?.v || data?.d?.[0] || {};
        const nextLevels = buildChartReferenceLevels(quote);
        setChartReferenceLevels((current) => (hasSameChartReferenceLevels(current, nextLevels) ? current : nextLevels));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [chartSymbol]);

  useEffect(() => {
    if (!chartSymbol) return;
    let cancelled = false;
    setError("");
    setChartLoading(true);
    fetchHistory(chartSymbol, resolution, days)
      .then((data) => {
        if (cancelled) return;
        const candles = normalizeHistoryCandles(data.candles);
        setChartData(candles);
        setOhlcInfo(candles[candles.length - 1] || null);
        setError("");
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setChartLoading(false);
      });
    return () => { cancelled = true; };
  }, [chartSymbol, resolution, days]);

  /* ── Render lightweight-charts candlestick ── */
  useEffect(() => {
    if (!chartContainerRef.current || chartData.length === 0) return;

    // Clean up previous chart
    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
    }

    const container = chartContainerRef.current;
    const chartColors = isDarkTheme
      ? {
          bg: "#0a1830",
          text: "#c5d7f4",
          grid: "rgba(129, 170, 233, 0.14)",
          border: "rgba(129, 170, 233, 0.22)",
        }
      : {
          bg: "#ffffff",
          text: "#2a3547",
          grid: "#f0f0f0",
          border: "#e0e0e0",
        };
    const priceScaleMode = percentScale ? 1 : logScale ? 2 : 0;

    try {
      const chart = createChart(container, {
        width: container.clientWidth,
        height: container.clientHeight || 480,
        layout: {
          background: { type: ColorType.Solid, color: chartColors.bg },
          textColor: chartColors.text,
          fontSize: 11,
        },
        grid: {
          vertLines: { color: chartColors.grid },
          horzLines: { color: chartColors.grid },
        },
        crosshair: { mode: CrosshairMode.Normal },
        handleScroll: { mouseWheel: true, pressedMouseMove: true, vertTouchDrag: true },
        handleScale: { axisPressedMouseMove: { price: true, time: true }, mouseWheel: true, pinch: true },
        leftPriceScale: {
          visible: false,
          borderColor: chartColors.border,
        },
        rightPriceScale: {
          visible: true,
          borderColor: chartColors.border,
          autoScale,
          mode: priceScaleMode,
        },
        timeScale: {
          borderColor: chartColors.border,
          timeVisible: true,
          secondsVisible: false,
        },
      });
      chartInstanceRef.current = chart;

      const candleSeries = chart.addSeries(CandlestickSeries, {
        priceScaleId: "right",
        upColor: "#13deb9",
        downColor: "#fa896b",
        borderUpColor: "#13deb9",
        borderDownColor: "#fa896b",
        wickUpColor: "#13deb9",
        wickDownColor: "#fa896b",
        lastValueVisible: true,
        priceLineVisible: true,
        priceLineColor: isDarkTheme ? "#ff8b6a" : "#d95f40",
        priceLineStyle: LineStyle.Solid,
      });
      candleSeriesRef.current = candleSeries;
      candleSeries.setData(chartData.map((c) => ({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })));

      const mfiArtifacts = buildMfiArtifacts(chartData);
      const markerSeries = createSeriesMarkers(candleSeries);
      markerSeries.setMarkers(mfiArtifacts.markers);
      markerSeriesRef.current = markerSeries;

      const lastCandle = chartData[chartData.length - 1];
      const mfiSeriesLookup = new Map(mfiArtifacts.series.map((point) => [point.time, point.value]));
      setOhlcInfo(lastCandle);
      setMfiInfo(mfiArtifacts.lastValue);

      chart.subscribeCrosshairMove((param) => {
        if (!param.time) {
          setOhlcInfo(lastCandle);
          setMfiInfo(mfiArtifacts.lastValue);
          return;
        }
        const d = param.seriesData.get(candleSeries);
        if (d) setOhlcInfo(d);
        const hoveredMfiValue = mfiSeriesLookup.get(param.time);
        setMfiInfo(typeof hoveredMfiValue === "number" ? hoveredMfiValue : mfiArtifacts.lastValue);
      });

      const ro = new ResizeObserver(() => {
        chart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
      });
      ro.observe(container);

      chart.timeScale().fitContent();

      return () => {
        ro.disconnect();
        chart.remove();
        chartInstanceRef.current = null;
        candleSeriesRef.current = null;
        chartReferenceLinesRef.current = [];
        markerSeriesRef.current = null;
      };
    } catch (err) {
      chartInstanceRef.current = null;
      candleSeriesRef.current = null;
      chartReferenceLinesRef.current = [];
      markerSeriesRef.current = null;
      setError(err?.message || "Unable to render chart.");
      return undefined;
    }
  }, [autoScale, chartData, isDarkTheme, logScale, percentScale]);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) {
      return undefined;
    }

    chartReferenceLinesRef.current.forEach((line) => {
      try {
        candleSeries.removePriceLine(line);
      } catch {
        // Ignore stale line refs during chart rebuilds.
      }
    });

    chartReferenceLinesRef.current = [];

    const referenceItems = buildChartReferenceItems(chartReferenceLevels, getChartReferenceLineColors(isDarkTheme));

    referenceItems.forEach((line) => {
      if (!Number.isFinite(line.price)) {
        return;
      }

      chartReferenceLinesRef.current.push(candleSeries.createPriceLine({
        price: line.price,
        color: line.color,
        lineWidth: 1,
        lineStyle: line.lineStyle,
        lineVisible: true,
        axisLabelVisible: false,
      }));
    });

    return () => {
      chartReferenceLinesRef.current.forEach((line) => {
        try {
          candleSeries.removePriceLine(line);
        } catch {
          // Ignore stale line refs during effect cleanup.
        }
      });
      chartReferenceLinesRef.current = [];
    };
  }, [autoScale, chartData, chartReferenceLevels, isDarkTheme, logScale, percentScale]);

  useEffect(() => {
    const chart = chartInstanceRef.current;
    const candleSeries = candleSeriesRef.current;
    const container = chartContainerRef.current;

    if (!chart || !candleSeries || !container) {
      setChartReferenceLabels([]);
      return undefined;
    }

    const referenceItems = buildChartReferenceItems(chartReferenceLevels, getChartReferenceLineColors(isDarkTheme));

    const syncReferenceLabels = () => {
      const containerHeight = container.clientHeight || 0;
      const nextLabels = referenceItems
        .map((item) => {
          if (!Number.isFinite(item.price)) {
            return null;
          }

          const coordinate = candleSeries.priceToCoordinate(item.price);
          if (!Number.isFinite(coordinate)) {
            return null;
          }

          const clampedTop = containerHeight
            ? Math.min(Math.max(coordinate, 12), Math.max(containerHeight - 12, 12))
            : coordinate;

          return {
            key: item.key,
            title: item.title,
            color: item.color,
            top: clampedTop,
          };
        })
        .filter(Boolean);

      setChartReferenceLabels(nextLabels);
    };

    const frameId = window.requestAnimationFrame(syncReferenceLabels);
    const resizeObserver = new ResizeObserver(syncReferenceLabels);
    resizeObserver.observe(container);
    chart.timeScale().subscribeVisibleLogicalRangeChange(syncReferenceLabels);

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(syncReferenceLabels);
    };
  }, [autoScale, chartData, chartReferenceLevels, isDarkTheme, logScale, percentScale]);

  useEffect(() => {
    if (!mfiChartContainerRef.current || !chartSymbol || chartData.length === 0) {
      if (mfiChartInstanceRef.current) {
        mfiChartInstanceRef.current.remove();
        mfiChartInstanceRef.current = null;
        mfiLineSeriesRef.current = null;
      }
      return;
    }

    if (mfiChartInstanceRef.current) {
      mfiChartInstanceRef.current.remove();
      mfiChartInstanceRef.current = null;
    }

    const container = mfiChartContainerRef.current;
    const chartColors = isDarkTheme
      ? {
          bg: "#0a1830",
          text: "#c5d7f4",
          grid: "rgba(129, 170, 233, 0.14)",
          border: "rgba(129, 170, 233, 0.22)",
        }
      : {
          bg: "#ffffff",
          text: "#2a3547",
          grid: "#f0f0f0",
          border: "#e0e0e0",
        };

    const mfiChart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight || 220,
      layout: {
        background: { type: ColorType.Solid, color: chartColors.bg },
        textColor: chartColors.text,
        fontSize: 11,
      },
      grid: {
        vertLines: { color: chartColors.grid },
        horzLines: { color: chartColors.grid },
      },
      crosshair: { mode: CrosshairMode.Normal },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, vertTouchDrag: true },
      handleScale: { axisPressedMouseMove: { price: true, time: true }, mouseWheel: true, pinch: true },
      rightPriceScale: {
        borderColor: chartColors.border,
        autoScale: true,
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      timeScale: {
        borderColor: chartColors.border,
        timeVisible: true,
        secondsVisible: false,
      },
    });
    mfiChartInstanceRef.current = mfiChart;

    const mfiArtifacts = buildMfiArtifacts(chartData);
    const mfiLineSeries = mfiChart.addSeries(LineSeries, {
      color: "#5d87ff",
      lineWidth: 2,
      crosshairMarkerVisible: true,
      lastValueVisible: true,
      priceLineVisible: false,
      autoscaleInfoProvider: () => ({
        priceRange: {
          minValue: 0,
          maxValue: 100,
        },
      }),
    });
    mfiLineSeries.setData(mfiArtifacts.series);
    mfiLineSeriesRef.current = mfiLineSeries;

    mfiLineSeries.createPriceLine({
      price: MFI_OVERBOUGHT_LEVEL,
      color: "rgba(250,137,107,0.72)",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: "80",
    });
    mfiLineSeries.createPriceLine({
      price: MFI_OVERSOLD_LEVEL,
      color: "rgba(19,222,185,0.72)",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: "20",
    });
    mfiLineSeries.createPriceLine({
      price: 50,
      color: "rgba(129,170,233,0.4)",
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: false,
    });

    mfiChart.subscribeCrosshairMove((param) => {
      if (!param.time) {
        setMfiInfo(mfiArtifacts.lastValue);
        return;
      }
      const point = param.seriesData.get(mfiLineSeries);
      setMfiInfo(point && typeof point.value === "number" ? point.value : mfiArtifacts.lastValue);
    });

    const priceChart = chartInstanceRef.current;
    const syncFromPriceChart = (range) => {
      if (!range || !mfiChartInstanceRef.current || syncingLogicalRangeRef.current) {
        return;
      }
      syncingLogicalRangeRef.current = true;
      mfiChartInstanceRef.current.timeScale().setVisibleLogicalRange(range);
      syncingLogicalRangeRef.current = false;
    };
    const syncToPriceChart = (range) => {
      if (!range || !chartInstanceRef.current || syncingLogicalRangeRef.current) {
        return;
      }
      syncingLogicalRangeRef.current = true;
      chartInstanceRef.current.timeScale().setVisibleLogicalRange(range);
      syncingLogicalRangeRef.current = false;
    };

    if (priceChart) {
      const visibleRange = priceChart.timeScale().getVisibleLogicalRange();
      if (visibleRange) {
        mfiChart.timeScale().setVisibleLogicalRange(visibleRange);
      } else {
        mfiChart.timeScale().fitContent();
      }
      priceChart.timeScale().subscribeVisibleLogicalRangeChange(syncFromPriceChart);
      mfiChart.timeScale().subscribeVisibleLogicalRangeChange(syncToPriceChart);
    } else {
      mfiChart.timeScale().fitContent();
    }

    const ro = new ResizeObserver(() => {
      mfiChart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      if (priceChart) {
        priceChart.timeScale().unsubscribeVisibleLogicalRangeChange(syncFromPriceChart);
        mfiChart.timeScale().unsubscribeVisibleLogicalRangeChange(syncToPriceChart);
      }
      mfiChart.remove();
      mfiChartInstanceRef.current = null;
      mfiLineSeriesRef.current = null;
    };
  }, [chartData, chartSymbol, isDarkTheme]);

  const liveChartQuote = chartSymbol ? (quotes[chartSymbol] || null) : null;

  /* ── Live chart updates during the active market session ── */
  useEffect(() => {
    if (!chartSymbol || !candleSeriesRef.current || !marketHoursActive || !liveChartQuote) return;

    const resSeconds = resolution === "D" ? 86400
      : resolution.startsWith("S") ? parseInt(resolution.slice(1), 10)
      : parseInt(resolution, 10) * 60;
    const ltp = liveChartQuote.lp;
    if (ltp == null) return;

    const nowSec = Math.floor(Date.now() / 1000) + IST_OFFSET_SECONDS;
    const candleTime = Math.floor(nowSec / resSeconds) * resSeconds;
    const tickCandle = {
      time: candleTime,
      open: liveChartQuote.open_price || ltp,
      high: liveChartQuote.high_price || ltp,
      low: liveChartQuote.low_price || ltp,
      close: ltp,
    };
    const lastCandleTime = chartDataRef.current[chartDataRef.current.length - 1]?.time;
    if (Number.isFinite(lastCandleTime) && tickCandle.time < lastCandleTime) {
      return;
    }
    candleSeriesRef.current.update(tickCandle);

    chartDataRef.current = mergeTickIntoCandles(chartDataRef.current, tickCandle, liveChartQuote.volume || 0);
    const mfiArtifacts = buildMfiArtifacts(chartDataRef.current);
    markerSeriesRef.current?.setMarkers(mfiArtifacts.markers);
    mfiLineSeriesRef.current?.setData(mfiArtifacts.series);
    setMfiInfo(mfiArtifacts.lastValue);
    const nextLevels = buildChartReferenceLevels(liveChartQuote);
    setChartReferenceLevels((current) => (hasSameChartReferenceLevels(current, nextLevels) ? current : nextLevels));

    setOhlcInfo((prev) => ({
      ...prev,
      open: liveChartQuote.open_price || prev?.open,
      high: liveChartQuote.high_price || prev?.high,
      low: liveChartQuote.low_price || prev?.low,
      close: ltp,
    }));
  }, [chartSymbol, resolution, marketHoursActive, liveChartQuote]);

  /* ── Handlers ── */
  async function handleCreateList() {
    const name = newListName.trim();
    if (!name) return;
    try {
      const data = await createWatchlist(name);
      setWatchlists(data.watchlists || {});
      setActiveList(name);
      setNewListName("");
      setShowCreateModal(false);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteList(name) {
    if (!window.confirm(`Delete watchlist "${name}"? This cannot be undone.`)) return;
    try {
      const data = await deleteWatchlist(name);
      setWatchlists(data.watchlists || {});
      if (activeList === name) {
        const keys = Object.keys(data.watchlists || {});
        setActiveList(keys[0] || null);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAddSymbol(symbol) {
    const target = addToList || activeList;
    if (!target) return;
    try {
      await addSymbolToWatchlist(target, symbol);
      await loadWatchlists();
      setSearchQuery("");
      setSearchResults([]);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRemoveSymbol(listName, symbol) {
    try {
      await removeSymbolFromWatchlist(listName, symbol);
      await loadWatchlists();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSmartAddToMyWatchlist() {
    if (!activeList) {
      setError("Create or select a list in My Watchlist first.");
      return;
    }
    const symbol = selectedSymbol || smartDisplaySymbols[0];
    if (!symbol) return;
    try {
      await addSymbolToWatchlist(activeList, symbol);
      await loadWatchlists();
      setShowSmartActionsMenu(false);
    } catch (err) {
      setError(err.message);
    }
  }

  function handleSmartApplySortFilter() {
    setSmartSortBy(smartSortDraft);
    setSmartExchanges(smartExchangesDraft);
    setShowSmartSortPanel(false);
  }

  function handleSmartResetSortFilter() {
    const defaults = ["NSE", "BSE", "MCX"];
    setSmartSortDraft("chgp");
    setSmartExchangesDraft(defaults);
    setSmartSortBy("chgp");
    setSmartExchanges(defaults);
    setShowSmartSortPanel(false);
  }

  async function refreshCurrentQuotes() {
    try {
      const symbols = streamSymbols.length ? streamSymbols : (watchTab === WATCH_TABS.SMART ? smartDisplaySymbols : activeSymbols);
      if (!symbols.length) return;
      const data = await fetchQuotes(symbols);
      const map = {};
      (data.d || []).forEach((item) => {
        const sym = item.n || item.v?.symbol;
        if (sym) map[sym] = item.v || {};
      });
      setQuotes(map);
      setQuotesUpdatedAt(new Date());
    } catch {
      /* ignore manual refresh errors */
    }
  }

  useEffect(() => {
    if (!refreshSignal) {
      return;
    }
    void refreshCurrentQuotes()
  }, [refreshSignal])

  function handleRowClick(symbol) {
    setError("");
    setNotice("");
    setSelectedSymbol(symbol);
    setChartSymbol(symbol);
  }

  const chartSymbolParts = useMemo(() => splitMarketSymbol(chartSymbol), [chartSymbol]);
  const quoteSnapshotText = useMemo(() => {
    if (marketHoursActive) {
      return `Last updated ${formatMarketClock(quotesUpdatedAt)} ${MARKET_TIME_ZONE_LABEL}`;
    }
    return `Showing last recorded LTP ${formatMarketClock(quotesUpdatedAt)} ${MARKET_TIME_ZONE_LABEL}`;
  }, [marketHoursActive, quotesUpdatedAt]);

  return (
    <div className="markets-page">
      {notice && <p className="info-bar">{notice}</p>}
      {error && <p className="error-bar">{error}</p>}

      <div className="markets-layout">
        {/* ─── Create Watchlist Modal ─── */}
        {showCreateModal && (
          <div className="fwl-modal-overlay" onClick={() => { setShowCreateModal(false); setNewListName(""); }}>
            <div className="fwl-modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="fwl-modal-title">New Watchlist</h3>
              <input
                className="fwl-modal-input"
                placeholder="Enter watchlist name…"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateList()}
                autoFocus
              />
              <div className="fwl-modal-actions">
                <button className="btn-secondary btn-sm" onClick={() => { setShowCreateModal(false); setNewListName(""); }}>Cancel</button>
                <button className="btn-primary btn-sm" onClick={handleCreateList} disabled={!newListName.trim()}>Create</button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Left: FYERS-style compact watchlist ─── */}
        <div className="fwl-panel">
          <div className="fwl-tabs">
            <button
              className={`fwl-tab${watchTab === WATCH_TABS.MY ? " active" : ""}`}
              onClick={() => setWatchTab(WATCH_TABS.MY)}
            >
              My Watchlist
            </button>
            <button
              className={`fwl-tab${watchTab === WATCH_TABS.PREDEFINED ? " active" : ""}`}
              onClick={() => setWatchTab(WATCH_TABS.PREDEFINED)}
            >
              Predefined
            </button>
            <button
              className={`fwl-tab${watchTab === WATCH_TABS.SMART ? " active" : ""}`}
              onClick={() => setWatchTab(WATCH_TABS.SMART)}
            >
              Smart Watchlist
            </button>
          </div>

          {watchTab === WATCH_TABS.SMART && (
            <div className="fwl-smart-subtabs">
              <button
                className={`fwl-smart-subtab${smartMode === "screeners" ? " active" : ""}`}
                onClick={() => setSmartMode("screeners")}
              >
                My Screeners
              </button>
              <button
                className={`fwl-smart-subtab${smartMode === "portfolio" ? " active" : ""}`}
                onClick={() => setSmartMode("portfolio")}
              >
                Portfolio
              </button>
            </div>
          )}

          {/* Header: watchlist selector + add/delete */}
          <div className="fwl-header">
            <div className="fwl-select-row">
              {watchTab === WATCH_TABS.MY ? (
                <>
                  <select
                    className="fwl-select"
                    value={activeList || ""}
                    onChange={(e) => setActiveList(e.target.value)}
                  >
                    {listNames.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  {activeList && (
                    <button className="fwl-del-btn" title="Delete this watchlist" onClick={() => handleDeleteList(activeList)}>×</button>
                  )}
                  <button className="fwl-add-btn" title="Create new watchlist" onClick={() => setShowCreateModal(true)}>+</button>
                </>
              ) : watchTab === WATCH_TABS.PREDEFINED ? (
                <select
                  className="fwl-select"
                  value={activePredefined}
                  onChange={(e) => {
                    setActivePredefined(e.target.value);
                  }}
                >
                  {predefinedLists.map((n) => (
                    <option key={n.id} value={n.id}>{n.name}</option>
                  ))}
                </select>
              ) : (
                <>
                  <div className="fwl-smart-picker" ref={smartListMenuRef}>
                    <button
                      className="fwl-smart-picker-btn"
                      onClick={() => setShowSmartListMenu((v) => !v)}
                    >
                      <span>{activeCollectionName || "Select screener"}</span>
                      <span className={`fwl-caret${showSmartListMenu ? " open" : ""}`}>⌄</span>
                    </button>
                    {showSmartListMenu && (
                      <div className="fwl-smart-picker-menu">
                        <input
                          className="fwl-search-input"
                          placeholder="Search screeners"
                          value={smartListQuery}
                          onChange={(e) => setSmartListQuery(e.target.value)}
                        />
                        <div className="fwl-smart-picker-items">
                          {smartFilteredLists.map((item) => (
                            <button
                              key={item.id}
                              className={`fwl-smart-picker-item${activeSmart === item.id ? " active" : ""}`}
                              onClick={() => { setActiveSmart(item.id); setShowSmartListMenu(false); }}
                            >
                              {item.name}
                            </button>
                          ))}
                          {smartFilteredLists.length === 0 && (
                            <p className="fwl-hint">No screener match.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="fwl-smart-tools">
                    <div className="fwl-smart-tool-wrap" ref={smartSortPanelRef}>
                      <button
                        className="fwl-smart-tool-btn"
                        title="Sort and filter"
                        onClick={() => setShowSmartSortPanel((v) => !v)}
                      >
                        ⊣
                      </button>
                      {showSmartSortPanel && (
                        <div className="fwl-smart-popover fwl-smart-sort-panel">
                          <p className="fwl-smart-pop-title">Sort by</p>
                          <label><input type="radio" name="smart-sort" checked={smartSortDraft === "chgp"} onChange={() => setSmartSortDraft("chgp")} /> % Change</label>
                          <label><input type="radio" name="smart-sort" checked={smartSortDraft === "chg"} onChange={() => setSmartSortDraft("chg")} /> Change</label>
                          <label><input type="radio" name="smart-sort" checked={smartSortDraft === "ltp"} onChange={() => setSmartSortDraft("ltp")} /> LTP</label>
                          <label><input type="radio" name="smart-sort" checked={smartSortDraft === "alpha"} onChange={() => setSmartSortDraft("alpha")} /> Alphabetical</label>
                          <p className="fwl-smart-pop-title">Exchanges</p>
                          {["NSE", "BSE", "MCX"].map((exchange) => (
                            <label key={exchange}>
                              <input
                                type="checkbox"
                                checked={smartExchangesDraft.includes(exchange)}
                                onChange={() => {
                                  if (smartExchangesDraft.includes(exchange)) {
                                    setSmartExchangesDraft((prev) => prev.filter((item) => item !== exchange));
                                  } else {
                                    setSmartExchangesDraft((prev) => [...prev, exchange]);
                                  }
                                }}
                              /> {exchange}
                            </label>
                          ))}
                          <div className="fwl-smart-pop-actions">
                            <button className="btn-primary btn-sm" onClick={handleSmartApplySortFilter}>Apply</button>
                            <button className="btn-secondary btn-sm" onClick={handleSmartResetSortFilter}>Reset</button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="fwl-smart-tool-wrap" ref={smartActionsMenuRef}>
                      <button
                        className="fwl-smart-tool-btn"
                        title="Actions"
                        onClick={() => setShowSmartActionsMenu((v) => !v)}
                      >
                        ⋮
                      </button>
                      {showSmartActionsMenu && (
                        <div className="fwl-smart-popover fwl-smart-actions-menu">
                          <button onClick={handleSmartAddToMyWatchlist}>Add to my watchlist</button>
                          <button onClick={() => { setError(""); setNotice("Related news integration can be added next."); setShowSmartActionsMenu(false); }}>Related news</button>
                          <button onClick={() => { setSmartSymbolQuery((selectedSymbol || "").replace("NSE:", "")); setShowSmartActionsMenu(false); }}>Search</button>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Search — at top below header */}
          {watchTab === WATCH_TABS.MY ? (
            <div className="fwl-search fwl-search-top">
              <input
                className="fwl-search-input"
                placeholder="Search NSE symbol or company…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchLoading && <p className="fwl-hint">Searching…</p>}
              {searchResults.length > 0 && (
                <div className="fwl-search-results">
                  {searchResults.map((item) => (
                    <div key={item.symbol} className="fwl-sr-row" onClick={() => handleAddSymbol(item.symbol)}>
                      <div className="fwl-sr-info">
                        <span className="fwl-sr-sym">{item.symbol.replace("NSE:", "")}</span>
                        <span className="fwl-sr-name">{item.name}</span>
                      </div>
                      <span className="fwl-sr-plus">+</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : watchTab === WATCH_TABS.PREDEFINED ? (
            <div className="fwl-search fwl-search-top fwl-search-readonly">
              <p className="fwl-hint">{activeCollectionName} symbols are managed by this tab.</p>
            </div>
          ) : (
            <div className="fwl-search fwl-search-top fwl-smart-search-row">
              <div className="fwl-smart-meta-row">
                <span className="fwl-hint">{quoteSnapshotText}</span>
                <button className="fwl-smart-refresh" onClick={refreshCurrentQuotes} title="Refresh">↻</button>
              </div>
              <input
                className="fwl-search-input"
                placeholder="Search symbols"
                value={smartSymbolQuery}
                onChange={(e) => setSmartSymbolQuery(e.target.value)}
              />
            </div>
          )}

          {/* Column headers */}
          <div className="fwl-col-head">
            <span className="fwl-col-sym">Symbol</span>
            <span className="fwl-col-num">Last</span>
            <span className="fwl-col-num">Chg</span>
            <span className="fwl-col-num">Chg%</span>
          </div>

          {/* Rows */}
          <div className="fwl-rows">
            {(watchTab === WATCH_TABS.SMART ? smartDisplaySymbols : activeSymbols).map((symbol) => {
              const q = quotes[symbol] || {};
              const chg = Number(q.ch || 0);
              const chgClass = chg > 0 ? "fwl-green" : chg < 0 ? "fwl-red" : "";
              const isSelected = selectedSymbol === symbol;
              return (
                <div
                  key={symbol}
                  className={`fwl-row${isSelected ? " fwl-row-selected" : ""}`}
                  onClick={() => handleRowClick(symbol)}
                >
                  <span className="fwl-row-sym">
                    {symbol.replace("NSE:", "")}
                    <span className="fwl-dot">●</span>
                  </span>
                  <span className="fwl-row-num">{formatNum(q.lp)}</span>
                  <span className={`fwl-row-num ${chgClass}`}>{formatNum(q.ch)}</span>
                  <span className={`fwl-row-num ${chgClass}`}>{formatNum(q.chp)}%</span>
                  <button
                    className="fwl-row-del"
                    title="Remove from watchlist"
                    onClick={(e) => { e.stopPropagation(); handleRemoveSymbol(activeList, symbol); }}
                    disabled={watchTab !== WATCH_TABS.MY}
                  >×</button>
                </div>
              );
            })}
            {(watchTab === WATCH_TABS.SMART ? smartDisplaySymbols.length : activeSymbols.length) === 0 && (
              <p className="fwl-empty-msg">
                {watchTab === WATCH_TABS.MY ? "No symbols. Search above to add." : "No symbols available for this collection."}
              </p>
            )}
          </div>
        </div>

        {/* ─── Right: Chart ─── */}
        <div className="wl-main">
          <div className={`wl-chart-stack${chartSymbol ? " wl-chart-stack-split" : ""}`}>
            <div className="panel chart-panel-full wl-chart-panel">
            {chartSymbol ? (
              <>
              {/* Top bar: bookmarked resolution buttons + dropdown like FYERS */}
              <div className="chart-top-bar">
                <span className="chart-symbol-label">{chartSymbolParts.ticker}</span>
                <div className="chart-res-btns">
                  {bookmarkedIntervals.map((r) => (
                    <button
                      key={r}
                      className={`chart-period-btn${resolution === r ? " active" : ""}`}
                      onClick={() => setResolution(r)}
                    >
                      {shortLabel(r)}
                    </button>
                  ))}
                  {/* Dropdown toggle */}
                  <div className="interval-dropdown-wrap" ref={intervalDropdownRef}>
                    <button
                      className={`chart-period-btn interval-dropdown-toggle${showIntervalDropdown ? " active" : ""}`}
                      onClick={() => setShowIntervalDropdown((v) => !v)}
                      title="All intervals"
                    >
                      &#9662;
                    </button>
                    {showIntervalDropdown && (
                      <div className="interval-dropdown">
                        {ALL_INTERVALS.map((group) => (
                          <div key={group.category} className="interval-group">
                            <div className="interval-group-header">{group.category}</div>
                            {group.items.map((item) => {
                              const isBookmarked = bookmarkedIntervals.includes(item.value);
                              const isActive = resolution === item.value;
                              return (
                                <div
                                  key={item.value}
                                  className={`interval-item${isActive ? " interval-item-active" : ""}`}
                                  onClick={() => { setResolution(item.value); setShowIntervalDropdown(false); }}
                                >
                                  <span className="interval-item-label">{item.label}</span>
                                  <span
                                    className={`interval-star${isBookmarked ? " interval-star-active" : ""}`}
                                    onClick={(e) => { e.stopPropagation(); toggleBookmark(item.value); }}
                                    title={isBookmarked ? "Remove from top bar" : "Add to top bar"}
                                  >
                                    {isBookmarked ? "\u2605" : "\u2606"}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <button className="btn-secondary btn-sm chart-close-btn" onClick={() => { setChartSymbol(null); setSelectedSymbol(null); setOhlcInfo(null); }}>×</button>
              </div>

              {/* OHLC header like FYERS */}
              <div className="chart-ohlc-header">
                <div className="chart-title-row">
                  <span className="chart-symbol-name">{chartSymbolParts.ticker} · {resolution === "D" ? "D" : resolution} · {chartSymbolParts.exchange}</span>
                  {ohlcInfo && (
                    <span className="chart-ohlc-vals">
                      O<b>{formatNum(ohlcInfo.open)}</b>{" "}
                      H<b>{formatNum(ohlcInfo.high)}</b>{" "}
                      L<b>{formatNum(ohlcInfo.low)}</b>{" "}
                      C<b>{formatNum(ohlcInfo.close)}</b>
                      {ohlcInfo.close != null && ohlcInfo.open != null && (
                        <span className={ohlcInfo.close >= ohlcInfo.open ? "fwl-green" : "fwl-red"}>
                          {" "}{(ohlcInfo.close - ohlcInfo.open) >= 0 ? "+" : ""}{formatNum(ohlcInfo.close - ohlcInfo.open)}{" "}
                          ({formatNum(((ohlcInfo.close - ohlcInfo.open) / ohlcInfo.open) * 100)}%)
                        </span>
                      )}
                    </span>
                  )}
                  {mfiInfo !== null ? (
                    <span className={`chart-ohlc-vals ${mfiInfo >= MFI_OVERBOUGHT_LEVEL ? "fwl-red" : mfiInfo <= MFI_OVERSOLD_LEVEL ? "fwl-green" : ""}`}>
                      MFI({MFI_SIGNAL_LENGTH}) <b>{formatNum(mfiInfo)}</b>
                    </span>
                  ) : null}
                </div>
                <span className="chart-time-display chart-time-display-header">
                  {chartClock.toLocaleTimeString("en-IN", { hour12: false, timeZone: "Asia/Kolkata" })} UTC+5:30
                </span>

              </div>

              {/* Chart container */}
              <div className="chart-box">
                {chartLoading ? (
                  <p className="fwl-hint" style={{ padding: 40 }}>Loading chart…</p>
                ) : chartData.length === 0 ? (
                  <p className="fwl-hint" style={{ padding: 40 }}>No data for this range.</p>
                ) : (
                  <>
                    <div ref={chartContainerRef} className="lw-chart-container" />
                    {chartReferenceLabels.length ? (
                      <div className="chart-reference-labels" aria-hidden="true">
                        {chartReferenceLabels.map((item) => (
                          <span
                            key={item.key}
                            className="chart-reference-label"
                            style={{
                              top: `${item.top}px`,
                              backgroundColor: item.color,
                              borderColor: item.color,
                            }}
                          >
                            {item.title}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </>
                )}
              </div>

              {/* Bottom bar: period + scale controls like FYERS */}
              <div className="chart-bottom-bar">
                <div className="chart-period-btns">
                  {DAYS_OPTIONS.map((opt) => (
                    <button
                      key={opt.label}
                      className={`chart-period-btn${days === opt.days ? " active" : ""}`}
                      onClick={() => {
                        // Auto-switch to daily for long ranges (FYERS intraday limit ~100 days)
                        if (opt.days > 100 && resolution !== "D") {
                          setResolution("D");
                        }
                        setDays(opt.days);
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="chart-scale-btns">
                  <button
                    className={`chart-period-btn${percentScale ? " active" : ""}`}
                    title="Percentage scale"
                    onClick={() => {
                      setPercentScale(!percentScale);
                      if (chartInstanceRef.current) {
                        chartInstanceRef.current.priceScale("right").applyOptions({ mode: !percentScale ? 1 : 0 });
                      }
                    }}
                  >%</button>
                  <button
                    className={`chart-period-btn${logScale ? " active" : ""}`}
                    title="Logarithmic scale"
                    onClick={() => {
                      setLogScale(!logScale);
                      if (chartInstanceRef.current) {
                        chartInstanceRef.current.priceScale("right").applyOptions({ mode: !logScale ? 2 : 0 });
                      }
                    }}
                  >log</button>
                  <button
                    className={`chart-period-btn${autoScale ? " active" : ""}`}
                    title="Auto-fit price scale"
                    onClick={() => {
                      setAutoScale(!autoScale);
                      if (chartInstanceRef.current) {
                        chartInstanceRef.current.priceScale("right").applyOptions({ autoScale: !autoScale });
                      }
                    }}
                  >auto</button>
                </div>
              </div>
              </>
            ) : (
              <div className="chart-box wl-chart-empty-box">
                <div className="chart-empty-state wl-chart-empty-state">
                  <strong>Select a symbol to view the chart</strong>
                  <span>The chart panel now stays on top and takes most of the workspace for visual analysis.</span>
                </div>
              </div>
            )}
            </div>

            {chartSymbol ? (
              <div className="panel chart-panel-full wl-mfi-panel">
                <div className="panel-head wl-mfi-panel-head">
                  <div>
                    <h3>MFI Oscillator</h3>
                    <p>{chartSymbolParts.ticker} · Money Flow Index ({MFI_SIGNAL_LENGTH})</p>
                  </div>
                  {mfiInfo !== null ? (
                    <span className={`wl-mfi-value-chip ${mfiInfo >= MFI_OVERBOUGHT_LEVEL ? "wl-mfi-value-chip-sell" : mfiInfo <= MFI_OVERSOLD_LEVEL ? "wl-mfi-value-chip-buy" : ""}`}>
                      {formatNum(mfiInfo)}
                    </span>
                  ) : null}
                </div>
                <div className="chart-box wl-mfi-chart-box">
                  {chartLoading ? (
                    <p className="fwl-hint" style={{ padding: 32 }}>Loading MFI…</p>
                  ) : chartData.length === 0 ? (
                    <p className="fwl-hint" style={{ padding: 32 }}>No MFI data for this range.</p>
                  ) : (
                    <div ref={mfiChartContainerRef} className="lw-chart-container" />
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div className="panel wl-data-panel">
            <div className="panel-head wl-data-panel-head">
              <div>
                <h3>Current Watchlist Data</h3>
                <p>
                  {activeCollectionName || "Selected watchlist"} · {selectedWatchlistRows.length} symbols
                </p>
              </div>
            </div>
            <div className="table-wrap wl-data-table-wrap">
              <table>
                <thead>
                  <tr>
                    <SortableTableHeader label="Symbol" sortKey="symbol" sortState={watchlistSortState} onSort={handleWatchlistSort} />
                    <SortableTableHeader label="LTP" sortKey="ltp" sortState={watchlistSortState} onSort={handleWatchlistSort} className="numeric" align="right" defaultDirection="desc" />
                    <SortableTableHeader label="Chg" sortKey="chg" sortState={watchlistSortState} onSort={handleWatchlistSort} className="numeric" align="right" defaultDirection="desc" />
                    <SortableTableHeader label="Chg%" sortKey="chgPct" sortState={watchlistSortState} onSort={handleWatchlistSort} className="numeric" align="right" defaultDirection="desc" />
                    <SortableTableHeader label="Open" sortKey="open" sortState={watchlistSortState} onSort={handleWatchlistSort} className="numeric" align="right" defaultDirection="desc" />
                    <SortableTableHeader label="High" sortKey="high" sortState={watchlistSortState} onSort={handleWatchlistSort} className="numeric" align="right" defaultDirection="desc" />
                    <SortableTableHeader label="Low" sortKey="low" sortState={watchlistSortState} onSort={handleWatchlistSort} className="numeric" align="right" defaultDirection="desc" />
                    <SortableTableHeader label="Prev Close" sortKey="prevClose" sortState={watchlistSortState} onSort={handleWatchlistSort} className="numeric" align="right" defaultDirection="desc" />
                    <SortableTableHeader label="Volume" sortKey="volume" sortState={watchlistSortState} onSort={handleWatchlistSort} className="numeric" align="right" defaultDirection="desc" />
                  </tr>
                </thead>
                <tbody>
                  {sortedWatchlistRows.map((row) => {
                    const chg = Number(row.chg || 0);
                    const toneClass = chg > 0 ? "cell-positive" : chg < 0 ? "cell-negative" : "";
                    return (
                      <tr key={row.symbol}>
                        <td><strong>{row.symbol.replace("NSE:", "")}</strong></td>
                        <td className="numeric">{formatNum(row.ltp)}</td>
                        <td className={`numeric ${toneClass}`}>{formatNum(row.chg)}</td>
                        <td className={`numeric ${toneClass}`}>{formatNum(row.chgPct)}%</td>
                        <td className="numeric">{formatNum(row.open)}</td>
                        <td className="numeric">{formatNum(row.high)}</td>
                        <td className="numeric">{formatNum(row.low)}</td>
                        <td className="numeric">{formatNum(row.prevClose)}</td>
                        <td className="numeric">{formatNum(row.volume)}</td>
                      </tr>
                    );
                  })}
                  {sortedWatchlistRows.length === 0 && (
                    <tr>
                      <td colSpan="9" style={{ textAlign: "center", color: "var(--text-muted)", padding: 20 }}>
                        No symbols available in the currently selected watchlist.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
