export const MARKET_INDEX_OPTIONS = [
  { value: "NSE:NIFTY50-INDEX", label: "NIFTY 50" },
  { value: "BSE:SENSEX-INDEX", label: "SENSEX" },
  { value: "NSE:NIFTYBANK-INDEX", label: "BANKNIFTY" },
  { value: "BSE:BANKEX-INDEX", label: "BANKEX" },
  { value: "NSE:FINNIFTY-INDEX", label: "FINNIFTY" },
  { value: "NSE:NIFTYNXT50-INDEX", label: "NIFTY NEXT 50" },
  { value: "NSE:MIDCPNIFTY-INDEX", label: "MIDCPNIFTY" },
  { value: "NSE:NIFTYMIDCAP100-INDEX", label: "NIFTY MIDCAP 100" },
  { value: "NSE:NIFTYSMLCAP100-INDEX", label: "NIFTY SMALLCAP 100" },
  { value: "NSE:NIFTY500-INDEX", label: "NIFTY 500" },
  { value: "NSE:INDIAVIX-INDEX", label: "INDIA VIX" },
];

export const MARKET_INDEX_SYMBOLS = MARKET_INDEX_OPTIONS.map((item) => item.value);

export const MARKET_INDEX_LABELS = Object.fromEntries(
  MARKET_INDEX_OPTIONS.map((item) => [item.value, item.label]),
);

export const DEFAULT_MARKET_INDEX_SYMBOL = MARKET_INDEX_SYMBOLS[0];

export function normalizeMarketIndexSymbol(symbol) {
  return MARKET_INDEX_SYMBOLS.includes(symbol)
    ? symbol
    : DEFAULT_MARKET_INDEX_SYMBOL;
}