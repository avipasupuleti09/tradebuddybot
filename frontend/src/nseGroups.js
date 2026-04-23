export const NSE_STOCK_GROUP_OPTIONS = [
  { id: "all", name: "All Groups", count: null },
  { id: "gold-silver", name: "Gold & Silver", count: 37 },
  { id: "nifty-50", name: "Nifty 50", count: 51 },
  { id: "nifty-bank", name: "Nifty Bank", count: 15 },
  { id: "niftynxt50", name: "NiftyNXT50", count: 51 },
  { id: "nifty-pharma", name: "Nifty Pharma", count: 21 },
  { id: "nifty-it", name: "Nifty IT", count: 11 },
  { id: "nifty-private-bank", name: "Nifty Private Bank", count: 11 },
  { id: "nifty-psu-bank", name: "Nifty PSU Bank", count: 13 },
  { id: "fin-nifty", name: "Fin Nifty", count: 21 },
  { id: "nifty-auto", name: "Nifty Auto", count: 16 },
  { id: "nifty-fmcg", name: "Nifty FMCG", count: 16 },
  { id: "nifty-media", name: "Nifty Media", count: 11 },
  { id: "nifty-realty", name: "Nifty Realty", count: 11 },
  { id: "nifty-metals", name: "Nifty Metals", count: 16 },
  { id: "nifty-commodities", name: "Nifty Commodities", count: 31 },
  { id: "nifty-infra", name: "Nifty Infra", count: 101 },
  { id: "nifty-energy", name: "Nifty Energy", count: 41 },
  { id: "nifty-midcap-50", name: "Nifty Midcap 50", count: 51 },
  { id: "nifty-oil-and-gas", name: "Nifty Oil and Gas", count: 16 },
  { id: "nifty-healthcare", name: "Nifty Healthcare", count: 21 },
  { id: "nifty-indices", name: "Nifty Indices", count: 47 },
  { id: "nifty-ipo", name: "Nifty IPO", count: 106 },
  { id: "nifty-midcap-select", name: "Nifty Midcap Select", count: 26 },
  { id: "bse-sensex", name: "BSE Sensex", count: 31 },
];

function buildText(item) {
  return `${item?.symbol || ""} ${item?.short || ""} ${item?.name || ""}`.toUpperCase();
}

function exact(list) {
  return new Set(list);
}

function shorts(list) {
  return new Set(list.map((value) => String(value).toUpperCase()));
}

function includesAny(text, tokens = []) {
  return tokens.some((token) => text.includes(token));
}

function matchesExplicitGroupMember(item, rule) {
  const short = String(item?.short || "").toUpperCase();
  if (rule.symbols?.has(item?.symbol)) {
    return true;
  }
  if (rule.shorts?.has(short)) {
    return true;
  }
  return false;
}

function isIndexInstrument(symbol) {
  return String(symbol || "").toUpperCase().endsWith("-INDEX");
}

const GROUP_RULES = {
  "gold-silver": {
    symbols: exact([
      "NSE:GOLDBEES-EQ",
      "NSE:GOLD1-EQ",
      "NSE:GOLDCASE-EQ",
      "NSE:GOLDETF-EQ",
      "NSE:GOLDETFADD-EQ",
      "NSE:GOLDIETF-EQ",
      "NSE:SILVERBEES-EQ",
      "NSE:SILVERADD-EQ",
      "NSE:SILVERETF-EQ",
      "NSE:SILVERIETF-EQ",
      "NSE:HDFCGOLD-EQ",
      "NSE:HDFCSILV-EQ",
      "NSE:AXISGOLD-EQ",
      "NSE:AXISILVER-EQ",
      "NSE:KOTAKGOLD-EQ",
      "NSE:KOTAKSILV-EQ",
      "NSE:TITAN-EQ",
      "NSE:KALYANKJIL-EQ",
      "NSE:SENCO-EQ",
      "NSE:THANGAMAYL-EQ",
      "NSE:GOLDIAM-EQ",
      "NSE:RAJESHEXPO-EQ",
      "NSE:VAIBHAVGBL-EQ",
      "NSE:PCJEWELLER-EQ",
    ]),
    tokens: [" GOLD", "SILVER", "JEWEL", "JEWELL", "BULLION"],
  },
  "nifty-50": {
    symbols: exact([
      "NSE:NIFTY50-INDEX",
      "NSE:ADANIENT-EQ",
      "NSE:ADANIPORTS-EQ",
      "NSE:APOLLOHOSP-EQ",
      "NSE:ASIANPAINT-EQ",
      "NSE:AXISBANK-EQ",
      "NSE:BAJAJ-AUTO-EQ",
      "NSE:BAJAJFINSV-EQ",
      "NSE:BAJFINANCE-EQ",
      "NSE:BEL-EQ",
      "NSE:BHARTIARTL-EQ",
      "NSE:BPCL-EQ",
      "NSE:BRITANNIA-EQ",
      "NSE:CIPLA-EQ",
      "NSE:COALINDIA-EQ",
      "NSE:DRREDDY-EQ",
      "NSE:EICHERMOT-EQ",
      "NSE:ETERNAL-EQ",
      "NSE:GRASIM-EQ",
      "NSE:HCLTECH-EQ",
      "NSE:HDFCBANK-EQ",
      "NSE:HDFCLIFE-EQ",
      "NSE:HEROMOTOCO-EQ",
      "NSE:HINDALCO-EQ",
      "NSE:HINDUNILVR-EQ",
      "NSE:ICICIBANK-EQ",
      "NSE:INDUSINDBK-EQ",
      "NSE:INFY-EQ",
      "NSE:ITC-EQ",
      "NSE:JIOFIN-EQ",
      "NSE:JSWSTEEL-EQ",
      "NSE:KOTAKBANK-EQ",
      "NSE:LT-EQ",
      "NSE:M&M-EQ",
      "NSE:MARUTI-EQ",
      "NSE:NESTLEIND-EQ",
      "NSE:NTPC-EQ",
      "NSE:ONGC-EQ",
      "NSE:POWERGRID-EQ",
      "NSE:RELIANCE-EQ",
      "NSE:SBILIFE-EQ",
      "NSE:SBIN-EQ",
      "NSE:SHRIRAMFIN-EQ",
      "NSE:SUNPHARMA-EQ",
      "NSE:TATACONSUM-EQ",
      "NSE:TATAMOTORS-EQ",
      "NSE:TATASTEEL-EQ",
      "NSE:TCS-EQ",
      "NSE:TECHM-EQ",
      "NSE:TITAN-EQ",
      "NSE:TRENT-EQ",
      "NSE:ULTRACEMCO-EQ",
      "NSE:WIPRO-EQ",
    ]),
  },
  "nifty-bank": {
    symbols: exact([
      "NSE:NIFTYBANK-INDEX",
      "NSE:BANKEX-INDEX",
      "NSE:HDFCBANK-EQ",
      "NSE:ICICIBANK-EQ",
      "NSE:AXISBANK-EQ",
      "NSE:KOTAKBANK-EQ",
      "NSE:SBIN-EQ",
      "NSE:INDUSINDBK-EQ",
      "NSE:FEDERALBNK-EQ",
      "NSE:IDFCFIRSTB-EQ",
      "NSE:AUBANK-EQ",
      "NSE:PNB-EQ",
      "NSE:BANKBARODA-EQ",
      "NSE:CANBK-EQ",
      "NSE:UNIONBANK-EQ",
    ]),
  },
  "niftynxt50": {
    symbols: exact([
      "NSE:NIFTYNXT50-INDEX",
      "NSE:NIFTYNEXT50-INDEX",
      "NSE:ABB-EQ",
      "NSE:ADANIGREEN-EQ",
      "NSE:ADANIPOWER-EQ",
      "NSE:AMBUJACEM-EQ",
      "NSE:BAJAJHLDNG-EQ",
      "NSE:BHEL-EQ",
      "NSE:BOSCHLTD-EQ",
      "NSE:CGPOWER-EQ",
      "NSE:CHOLAFIN-EQ",
      "NSE:DABUR-EQ",
      "NSE:DIVISLAB-EQ",
      "NSE:DMART-EQ",
      "NSE:DLF-EQ",
      "NSE:HAL-EQ",
      "NSE:HAVELLS-EQ",
      "NSE:ICICIGI-EQ",
      "NSE:ICICIPRULI-EQ",
      "NSE:INDIGO-EQ",
      "NSE:IOC-EQ",
      "NSE:IRCTC-EQ",
      "NSE:LICI-EQ",
      "NSE:MARICO-EQ",
      "NSE:MOTHERSON-EQ",
      "NSE:NAUKRI-EQ",
      "NSE:PIDILITIND-EQ",
      "NSE:PFC-EQ",
      "NSE:REC-EQ",
      "NSE:SIEMENS-EQ",
      "NSE:SRF-EQ",
      "NSE:TATAPOWER-EQ",
      "NSE:TORNTPHARM-EQ",
      "NSE:TVSMOTOR-EQ",
      "NSE:VBL-EQ",
      "NSE:ZYDUSLIFE-EQ",
    ]),
  },
  "nifty-pharma": {
    symbols: exact([
      "NSE:NIFTYPHARMA-INDEX",
      "NSE:AJANTPHARM-EQ",
      "NSE:ALKEM-EQ",
      "NSE:AUROPHARMA-EQ",
      "NSE:BIOCON-EQ",
      "NSE:CIPLA-EQ",
      "NSE:DIVISLAB-EQ",
      "NSE:DRREDDY-EQ",
      "NSE:GLAND-EQ",
      "NSE:GLAXO-EQ",
      "NSE:GLENMARK-EQ",
      "NSE:GRANULES-EQ",
      "NSE:IPCALAB-EQ",
      "NSE:JBCHEPHARM-EQ",
      "NSE:LAURUSLABS-EQ",
      "NSE:LUPIN-EQ",
      "NSE:MANKIND-EQ",
      "NSE:NATCOPHARM-EQ",
      "NSE:SUNPHARMA-EQ",
      "NSE:TORNTPHARM-EQ",
      "NSE:ZYDUSLIFE-EQ",
    ]),
    tokens: ["PHARMA", "PHARMACE", "HEALTHCARE", "LIFE SCI", "LABS"],
  },
  "nifty-it": {
    symbols: exact([
      "NSE:NIFTYIT-INDEX",
      "NSE:COFORGE-EQ",
      "NSE:HCLTECH-EQ",
      "NSE:INFY-EQ",
      "NSE:LTIM-EQ",
      "NSE:MPHASIS-EQ",
      "NSE:OFSS-EQ",
      "NSE:PERSISTENT-EQ",
      "NSE:TCS-EQ",
      "NSE:TECHM-EQ",
      "NSE:WIPRO-EQ",
    ]),
    tokens: ["INFOTECH", "SOFTWARE", "TECH", "DIGITAL"],
  },
  "nifty-private-bank": {
    symbols: exact([
      "NSE:NIFTYPVTBANK-INDEX",
      "NSE:AXISBANK-EQ",
      "NSE:BANDHANBNK-EQ",
      "NSE:FEDERALBNK-EQ",
      "NSE:HDFCBANK-EQ",
      "NSE:ICICIBANK-EQ",
      "NSE:IDFCFIRSTB-EQ",
      "NSE:INDUSINDBK-EQ",
      "NSE:KOTAKBANK-EQ",
      "NSE:RBLBANK-EQ",
      "NSE:YESBANK-EQ",
    ]),
  },
  "nifty-psu-bank": {
    symbols: exact([
      "NSE:NIFTYPSUBANK-INDEX",
      "NSE:BANKBARODA-EQ",
      "NSE:BANKINDIA-EQ",
      "NSE:CANBK-EQ",
      "NSE:CENTRALBK-EQ",
      "NSE:INDIANB-EQ",
      "NSE:IOB-EQ",
      "NSE:MAHABANK-EQ",
      "NSE:PNB-EQ",
      "NSE:PSB-EQ",
      "NSE:SBIN-EQ",
      "NSE:UCOBANK-EQ",
      "NSE:UNIONBANK-EQ",
    ]),
  },
  "fin-nifty": {
    symbols: exact([
      "NSE:FINNIFTY-INDEX",
      "NSE:AXISBANK-EQ",
      "NSE:BAJAJFINSV-EQ",
      "NSE:BAJFINANCE-EQ",
      "NSE:CHOLAFIN-EQ",
      "NSE:HDFCBANK-EQ",
      "NSE:HDFCLIFE-EQ",
      "NSE:HDFCAMC-EQ",
      "NSE:ICICIBANK-EQ",
      "NSE:ICICIGI-EQ",
      "NSE:ICICIPRULI-EQ",
      "NSE:JIOFIN-EQ",
      "NSE:KOTAKBANK-EQ",
      "NSE:MUTHOOTFIN-EQ",
      "NSE:PEL-EQ",
      "NSE:PFC-EQ",
      "NSE:REC-EQ",
      "NSE:SBILIFE-EQ",
      "NSE:SBIN-EQ",
      "NSE:SHRIRAMFIN-EQ",
    ]),
    tokens: ["FINANCE", "FINSERV", "BANK", "INSURANCE"],
  },
  "nifty-auto": {
    symbols: exact([
      "NSE:NIFTYAUTO-INDEX",
      "NSE:ASHOKLEY-EQ",
      "NSE:BAJAJ-AUTO-EQ",
      "NSE:BALKRISIND-EQ",
      "NSE:BHARATFORG-EQ",
      "NSE:BOSCHLTD-EQ",
      "NSE:EICHERMOT-EQ",
      "NSE:EXIDEIND-EQ",
      "NSE:HEROMOTOCO-EQ",
      "NSE:M&M-EQ",
      "NSE:MARUTI-EQ",
      "NSE:MOTHERSON-EQ",
      "NSE:MRF-EQ",
      "NSE:TATAMOTORS-EQ",
      "NSE:TVSMOTOR-EQ",
    ]),
    tokens: [" AUTO", "MOTOR", "TYRE", "TRACTOR", "BATTERY", "FORGING"],
  },
  "nifty-fmcg": {
    symbols: exact([
      "NSE:NIFTYFMCG-INDEX",
      "NSE:BRITANNIA-EQ",
      "NSE:COLPAL-EQ",
      "NSE:DABUR-EQ",
      "NSE:EMAMILTD-EQ",
      "NSE:GODREJCP-EQ",
      "NSE:HINDUNILVR-EQ",
      "NSE:ITC-EQ",
      "NSE:MARICO-EQ",
      "NSE:NESTLEIND-EQ",
      "NSE:PGHH-EQ",
      "NSE:RADICO-EQ",
      "NSE:TATACONSUM-EQ",
      "NSE:UBL-EQ",
      "NSE:UNITDSPR-EQ",
      "NSE:VBL-EQ",
    ]),
    tokens: ["FMCG", "FOOD", "BEVERAGE", "CONSUM", "SOAP", "PERSONAL CARE"],
  },
  "nifty-media": {
    symbols: exact([
      "NSE:NIFTYMEDIA-INDEX",
      "NSE:DBCORP-EQ",
      "NSE:DISH TV-EQ",
      "NSE:NAZARA-EQ",
      "NSE:NETWORK18-EQ",
      "NSE:PVRINOX-EQ",
      "NSE:SAREGAMA-EQ",
      "NSE:SUNTV-EQ",
      "NSE:TIPSMUSIC-EQ",
      "NSE:TV18BRDCST-EQ",
      "NSE:ZEEL-EQ",
    ]),
    tokens: ["MEDIA", "BROADCAST", "TV", "ENTERTAIN", "MUSIC", "PVR"],
  },
  "nifty-realty": {
    symbols: exact([
      "NSE:NIFTYREALTY-INDEX",
      "NSE:BRIGADE-EQ",
      "NSE:DLF-EQ",
      "NSE:GODREJPROP-EQ",
      "NSE:LODHA-EQ",
      "NSE:MAHLIFE-EQ",
      "NSE:OBEROIRLTY-EQ",
      "NSE:PHOENIXLTD-EQ",
      "NSE:PRESTIGE-EQ",
      "NSE:SOBHA-EQ",
      "NSE:SUNTECK-EQ",
    ]),
    tokens: ["REALTY", "PROP", "PROPERTY", "ESTATE", "HOUSING"],
  },
  "nifty-metals": {
    symbols: exact([
      "NSE:NIFTYMETAL-INDEX",
      "NSE:APLAPOLLO-EQ",
      "NSE:COALINDIA-EQ",
      "NSE:HINDALCO-EQ",
      "NSE:HINDZINC-EQ",
      "NSE:JINDALSTEL-EQ",
      "NSE:JSWSTEEL-EQ",
      "NSE:NALCO-EQ",
      "NSE:NMDC-EQ",
      "NSE:RATNAMANI-EQ",
      "NSE:SAIL-EQ",
      "NSE:TATASTEEL-EQ",
      "NSE:VEDL-EQ",
      "NSE:WELCORP-EQ",
    ]),
    tokens: ["STEEL", "METAL", "ALUMIN", "ZINC", "COPPER", "MINING", "IRON"],
  },
  "nifty-commodities": {
    symbols: exact([
      "NSE:NIFTYCOMMODITIES-INDEX",
      "NSE:ACC-EQ",
      "NSE:AMBUJACEM-EQ",
      "NSE:BPCL-EQ",
      "NSE:COALINDIA-EQ",
      "NSE:GRASIM-EQ",
      "NSE:HINDALCO-EQ",
      "NSE:IOC-EQ",
      "NSE:JSWSTEEL-EQ",
      "NSE:NESTLEIND-EQ",
      "NSE:ONGC-EQ",
      "NSE:RELIANCE-EQ",
      "NSE:TATASTEEL-EQ",
      "NSE:ULTRACEMCO-EQ",
      "NSE:VEDL-EQ",
    ]),
    tokens: ["METAL", "CEMENT", "OIL", "GAS", "POWER", "CHEM", "AGRO", "MINING", "STEEL"],
  },
  "nifty-infra": {
    symbols: exact([
      "NSE:NIFTYINFRA-INDEX",
      "NSE:ADANIPORTS-EQ",
      "NSE:AMBUJACEM-EQ",
      "NSE:ASHOKLEY-EQ",
      "NSE:BEL-EQ",
      "NSE:BHEL-EQ",
      "NSE:DLF-EQ",
      "NSE:GMRINFRA-EQ",
      "NSE:IRB-EQ",
      "NSE:IRCON-EQ",
      "NSE:KEC-EQ",
      "NSE:KNRCON-EQ",
      "NSE:LT-EQ",
      "NSE:NCC-EQ",
      "NSE:NBCC-EQ",
      "NSE:NTPC-EQ",
      "NSE:PNCINFRA-EQ",
      "NSE:POWERGRID-EQ",
      "NSE:RVNL-EQ",
      "NSE:TATAPOWER-EQ",
      "NSE:ULTRACEMCO-EQ",
    ]),
    tokens: ["INFRA", "ENGINEER", "CONSTR", "PROJECT", "PORT", "ROAD", "RAIL", "POWER", "CEMENT", "GRID"],
  },
  "nifty-energy": {
    symbols: exact([
      "NSE:NIFTYENERGY-INDEX",
      "NSE:ADANIGREEN-EQ",
      "NSE:ADANIPOWER-EQ",
      "NSE:BPCL-EQ",
      "NSE:COALINDIA-EQ",
      "NSE:GAIL-EQ",
      "NSE:GSPL-EQ",
      "NSE:IGL-EQ",
      "NSE:IOC-EQ",
      "NSE:MGL-EQ",
      "NSE:NTPC-EQ",
      "NSE:ONGC-EQ",
      "NSE:PETRONET-EQ",
      "NSE:POWERGRID-EQ",
      "NSE:RELIANCE-EQ",
      "NSE:TATAPOWER-EQ",
      "NSE:TORNTPOWER-EQ",
    ]),
    tokens: ["ENERGY", "POWER", "GAS", "OIL", "PETRO", "RENEW", "GREEN"],
  },
  "nifty-midcap-50": {
    symbols: exact([
      "NSE:NIFTYMIDCAP50-INDEX",
      "NSE:ABB-EQ",
      "NSE:APLAPOLLO-EQ",
      "NSE:BALKRISIND-EQ",
      "NSE:BHEL-EQ",
      "NSE:CGPOWER-EQ",
      "NSE:CHOLAFIN-EQ",
      "NSE:COFORGE-EQ",
      "NSE:CONCOR-EQ",
      "NSE:CROMPTON-EQ",
      "NSE:CUMMINSIND-EQ",
      "NSE:ESCORTS-EQ",
      "NSE:HAVELLS-EQ",
      "NSE:INDUSTOWER-EQ",
      "NSE:MRF-EQ",
      "NSE:OBEROIRLTY-EQ",
      "NSE:POLYCAB-EQ",
      "NSE:PRESTIGE-EQ",
      "NSE:SRF-EQ",
      "NSE:SUPREMEIND-EQ",
      "NSE:TORNTPHARM-EQ",
      "NSE:TVSMOTOR-EQ",
    ]),
    tokens: ["MIDCAP 50", "MIDCAP", "MID CAP"],
  },
  "nifty-oil-and-gas": {
    symbols: exact([
      "NSE:NIFTYOILANDGAS-INDEX",
      "NSE:ATGL-EQ",
      "NSE:BPCL-EQ",
      "NSE:GAIL-EQ",
      "NSE:GSPL-EQ",
      "NSE:GUJGASLTD-EQ",
      "NSE:HPCL-EQ",
      "NSE:IGL-EQ",
      "NSE:IOC-EQ",
      "NSE:MGL-EQ",
      "NSE:OIL-EQ",
      "NSE:ONGC-EQ",
      "NSE:PETRONET-EQ",
      "NSE:RELIANCE-EQ",
    ]),
    tokens: ["OIL", "GAS", "PETRO", "LNG"],
  },
  "nifty-healthcare": {
    symbols: exact([
      "NSE:NIFTYHEALTHCARE-INDEX",
      "NSE:APOLLOHOSP-EQ",
      "NSE:AUROPHARMA-EQ",
      "NSE:CIPLA-EQ",
      "NSE:DIVISLAB-EQ",
      "NSE:DRREDDY-EQ",
      "NSE:FORTIS-EQ",
      "NSE:GLAND-EQ",
      "NSE:LALPATHLAB-EQ",
      "NSE:LUPIN-EQ",
      "NSE:MAXHEALTH-EQ",
      "NSE:METROPOLIS-EQ",
      "NSE:NATCOPHARM-EQ",
      "NSE:SUNPHARMA-EQ",
      "NSE:SYNGENE-EQ",
      "NSE:TORNTPHARM-EQ",
      "NSE:ZYDUSLIFE-EQ",
    ]),
    tokens: ["HEALTH", "PHARMA", "HOSP", "MEDI", "CARE", "DIAGNOSTIC", "LAB"],
  },
  "nifty-indices": {
    custom: (item, text) => item?.symbol?.endsWith("-INDEX") || /\bNIFTY\b|\bSENSEX\b|\bBANKEX\b|INDEX/.test(text),
  },
  "nifty-ipo": {
    symbols: exact([
      "NSE:TATATECH-EQ",
      "NSE:SWIGGY-EQ",
      "NSE:HYUNDAI-EQ",
      "NSE:WAAREEENER-EQ",
      "NSE:IXIGO-EQ",
      "NSE:OLALEC-EQ",
      "NSE:PAYTM-EQ",
      "NSE:ZOMATO-EQ",
      "NSE:NYKAA-EQ",
      "NSE:POLICYBZR-EQ",
    ]),
    tokens: ["IPO", "LISTING", "NEWLY LISTED"],
  },
  "nifty-midcap-select": {
    symbols: exact([
      "NSE:MIDCPNIFTY-INDEX",
      "NSE:NIFTYMIDSELECT-INDEX",
      "NSE:ABB-EQ",
      "NSE:BHEL-EQ",
      "NSE:COFORGE-EQ",
      "NSE:HAVELLS-EQ",
      "NSE:INDUSTOWER-EQ",
      "NSE:MAXHEALTH-EQ",
      "NSE:OBEROIRLTY-EQ",
      "NSE:POLYCAB-EQ",
      "NSE:PRESTIGE-EQ",
      "NSE:TORNTPHARM-EQ",
      "NSE:TVSMOTOR-EQ",
    ]),
    tokens: ["MID SELECT", "MIDCAP SELECT", "MIDSELECT"],
  },
  "bse-sensex": {
    symbols: exact([
      "BSE:SENSEX-INDEX",
      "NSE:ASIANPAINT-EQ",
      "NSE:AXISBANK-EQ",
      "NSE:BAJAJFINSV-EQ",
      "NSE:BAJFINANCE-EQ",
      "NSE:BHARTIARTL-EQ",
      "NSE:HCLTECH-EQ",
      "NSE:HDFCBANK-EQ",
      "NSE:ICICIBANK-EQ",
      "NSE:INDUSINDBK-EQ",
      "NSE:INFY-EQ",
      "NSE:ITC-EQ",
      "NSE:KOTAKBANK-EQ",
      "NSE:LT-EQ",
      "NSE:M&M-EQ",
      "NSE:MARUTI-EQ",
      "NSE:NESTLEIND-EQ",
      "NSE:NTPC-EQ",
      "NSE:POWERGRID-EQ",
      "NSE:RELIANCE-EQ",
      "NSE:SBIN-EQ",
      "NSE:SUNPHARMA-EQ",
      "NSE:TATAMOTORS-EQ",
      "NSE:TATASTEEL-EQ",
      "NSE:TCS-EQ",
      "NSE:TECHM-EQ",
      "NSE:TITAN-EQ",
      "NSE:ULTRACEMCO-EQ",
      "NSE:AXSENSEX-EQ",
      "NSE:HDFCSENSEX-EQ",
      "NSE:SENSEXETF-EQ",
      "NSE:SENSEXIETF-EQ",
    ]),
    tokens: ["SENSEX"],
  },
};

export function getNseGroupOption(groupId) {
  return NSE_STOCK_GROUP_OPTIONS.find((item) => item.id === groupId) || NSE_STOCK_GROUP_OPTIONS[0];
}

export function filterTableSymbolsByNseGroup(symbols, groupId) {
  const source = Array.isArray(symbols) ? symbols : [];

  if (!groupId || groupId === "all") {
    return source.filter((item) => !isIndexInstrument(item?.symbol));
  }

  const rule = GROUP_RULES[groupId];
  if (!rule) {
    return source.filter((item) => !isIndexInstrument(item?.symbol));
  }

  const hasExplicitMembers = Boolean(rule.symbols?.size || rule.shorts?.size);

  return source.filter((item) => {
    if (isIndexInstrument(item?.symbol)) {
      return false;
    }

    if (matchesExplicitGroupMember(item, rule)) {
      return true;
    }

    if (hasExplicitMembers) {
      return false;
    }

    const text = buildText(item);
    if (rule.tokens && includesAny(text, rule.tokens)) {
      return true;
    }
    if (rule.custom && rule.custom(item, text)) {
      return true;
    }
    return false;
  });
}

export function filterSymbolsByNseGroup(symbols, groupId) {
  if (!groupId || groupId === "all") {
    return symbols;
  }

  const rule = GROUP_RULES[groupId];
  if (!rule) {
    return symbols;
  }

  return symbols.filter((item) => {
    if (matchesExplicitGroupMember(item, rule)) {
      return true;
    }

    const text = buildText(item);
    if (rule.tokens && includesAny(text, rule.tokens)) {
      return true;
    }
    if (rule.custom && rule.custom(item, text)) {
      return true;
    }
    return false;
  });
}