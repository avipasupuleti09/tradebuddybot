import fs from 'node:fs/promises';
import path from 'node:path';

const SYMBOL_MASTER_URL = 'https://public.fyers.in/sym_details/NSE_CM.csv';
const CACHE_TTL_SECONDS = 24 * 60 * 60;

export class SymbolMaster {
  constructor(cacheDir = '.cache') {
    this.cachePath = path.resolve(cacheDir, 'nse_cm_symbols.csv');
    this.symbols = [];
    this.loadedAt = 0;
  }

  async ensureLoaded() {
    if (!this.#needsRefresh()) {
      return;
    }

    let raw = await this.#loadFromCache();
    if (!raw) {
      raw = await this.#download();
    }

    this.symbols = this.#parse(raw);
    this.loadedAt = Date.now();
  }

  async search(query, limit = 30) {
    await this.ensureLoaded();
    const normalizedQuery = String(query || '').trim().toUpperCase();
    if (!normalizedQuery) {
      return [];
    }

    const results = [];
    for (const symbol of this.symbols) {
      if (symbol.short.toUpperCase().startsWith(normalizedQuery) || symbol.symbol.toUpperCase().startsWith(`NSE:${normalizedQuery}`)) {
        results.push({ ...symbol });
        if (results.length >= limit) {
          return results;
        }
      }
    }

    for (const symbol of this.symbols) {
      if (symbol.name.toUpperCase().includes(normalizedQuery) && !results.some((item) => item.symbol === symbol.symbol)) {
        results.push({ ...symbol });
        if (results.length >= limit) {
          return results;
        }
      }
    }

    return results;
  }

  async allSymbols() {
    await this.ensureLoaded();
    return this.symbols.map((symbol) => ({ ...symbol }));
  }

  #needsRefresh() {
    if (!this.symbols.length) {
      return true;
    }
    return (Date.now() - this.loadedAt) / 1000 > CACHE_TTL_SECONDS;
  }

  async #download() {
    const response = await fetch(SYMBOL_MASTER_URL);
    if (!response.ok) {
      throw new Error(`Unable to download NSE symbol master (${response.status})`);
    }
    const text = await response.text();
    await fs.mkdir(path.dirname(this.cachePath), { recursive: true });
    await fs.writeFile(this.cachePath, text, 'utf8');
    return text;
  }

  async #loadFromCache() {
    try {
      const stats = await fs.stat(this.cachePath);
      if ((Date.now() - stats.mtimeMs) / 1000 > CACHE_TTL_SECONDS) {
        return null;
      }
      return await fs.readFile(this.cachePath, 'utf8');
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  #parse(raw) {
    const rows = String(raw || '').split(/\r?\n/);
    const symbols = [];

    for (const row of rows) {
      const columns = row.split(',');
      if (columns.length < 15) {
        continue;
      }

      const symbol = String(columns[9] || '').trim();
      const name = String(columns[1] || '').trim();
      const short = String(columns[13] || '').trim();
      const isin = String(columns[5] || '').trim();
      if (!symbol || !name) {
        continue;
      }

      symbols.push({ symbol, name, short, isin });
    }

    return symbols;
  }
}