export function normalizeSymbol(raw) {
  const symbol = String(raw || '').trim().toUpperCase();
  if (!symbol) {
    return '';
  }
  if (symbol.includes(':')) {
    return symbol;
  }
  return `NSE:${symbol}`;
}

export function asNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function safeRound(value, digits = 2) {
  const number = asNumber(value);
  if (number === null) {
    return null;
  }
  return Number(number.toFixed(digits));
}

export function mean(values) {
  const valid = values.map(asNumber).filter((value) => value !== null);
  if (!valid.length) {
    return null;
  }
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

export function percentChange(current, previous) {
  const currentValue = asNumber(current);
  const previousValue = asNumber(previous);
  if (currentValue === null || previousValue === null || previousValue === 0) {
    return null;
  }
  return ((currentValue - previousValue) / previousValue) * 100;
}

export function simpleMovingAverage(values, period) {
  if (values.length < period) {
    return null;
  }
  return values.slice(-period).reduce((sum, value) => sum + value, 0) / period;
}

export function rollingMean(values, period) {
  if (values.length < period) {
    return null;
  }
  const sliceValues = values.slice(-period).map(asNumber);
  if (sliceValues.some((value) => value === null)) {
    return null;
  }
  return sliceValues.reduce((sum, value) => sum + value, 0) / period;
}

export function computeRsi(values, period = 14) {
  if (values.length <= period) {
    return null;
  }

  let gains = 0;
  let losses = 0;
  for (let index = values.length - period; index < values.length; index += 1) {
    const delta = values[index] - values[index - 1];
    if (delta >= 0) {
      gains += delta;
    } else {
      losses -= delta;
    }
  }

  if (gains === 0 && losses === 0) {
    return 50;
  }
  if (losses === 0) {
    return 100;
  }

  const rs = (gains / period) / (losses / period);
  return 100 - (100 / (1 + rs));
}

export function minMaxNormalize(value, minimum, maximum) {
  const number = asNumber(value);
  if (number === null) {
    return null;
  }
  if (maximum === minimum) {
    return 0.5;
  }
  const normalized = (number - minimum) / (maximum - minimum);
  if (normalized < 0) {
    return 0;
  }
  if (normalized > 1) {
    return 1;
  }
  return normalized;
}

export function linearSlope(values) {
  const numeric = values.map(asNumber).filter((value) => value !== null);
  if (numeric.length < 2) {
    return null;
  }

  const size = numeric.length;
  const xMean = (size - 1) / 2;
  const yMean = numeric.reduce((sum, value) => sum + value, 0) / size;
  const denominator = Array.from({ length: size }, (_, index) => (index - xMean) ** 2)
    .reduce((sum, value) => sum + value, 0);

  if (denominator === 0) {
    return null;
  }

  const numerator = numeric.reduce((sum, value, index) => sum + ((index - xMean) * (value - yMean)), 0);
  return numerator / denominator;
}

export function mapSide(raw) {
  return String(raw || 'BUY').trim().toUpperCase() === 'BUY' ? 1 : -1;
}

export function mapOrderType(raw) {
  const normalized = String(raw || 'MARKET').trim().toUpperCase();
  const mapping = {
    LIMIT: 1,
    MARKET: 2,
    'SL-M': 3,
    'SL-L': 4,
  };
  if (!mapping[normalized]) {
    throw new Error(`Unsupported order type: ${normalized}`);
  }
  return mapping[normalized];
}

export function checkTrigger(side, ltp, triggerLtp) {
  return String(side || 'BUY').trim().toUpperCase() === 'BUY'
    ? ltp >= triggerLtp
    : ltp <= triggerLtp;
}

export function uniqueSymbolsFromRows(rows, keys) {
  const seen = new Set();
  const output = [];

  for (const row of rows || []) {
    if (!row || typeof row !== 'object') {
      continue;
    }

    let symbol = '';
    for (const key of keys) {
      if (row[key]) {
        symbol = normalizeSymbol(row[key]);
        if (symbol) {
          break;
        }
      }
    }

    if (symbol && !seen.has(symbol)) {
      seen.add(symbol);
      output.push(symbol);
    }
  }

  return output;
}

export async function mapWithConcurrency(items, concurrency, worker) {
  const limit = Math.max(1, Math.min(concurrency, items.length || 1));
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) {
        return;
      }
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => runWorker()));
  return results;
}
