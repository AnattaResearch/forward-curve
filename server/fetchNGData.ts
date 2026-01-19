import YahooFinance from 'yahoo-finance2';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Data directory path (relative to project root in production, or ../data in dev)
const getDataDir = () => {
  // In production (dist/index.js), data is at ../data
  // In development, data is at ../data from server/
  const prodPath = path.join(__dirname, '..', 'data');
  const devPath = path.join(__dirname, '..', '..', 'data');

  if (fs.existsSync(prodPath)) return prodPath;
  if (fs.existsSync(devPath)) return devPath;
  return devPath; // Default to dev path
};

// Initialize yahoo-finance2 with suppressed notices
const yahooFinance = new YahooFinance({
  suppressNotices: ['yahooSurvey', 'ripHistorical'],
});

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// Helper function to delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to retry an async operation with exponential backoff
async function withRetry<T>(
  operation: () => Promise<T>,
  retries: number = MAX_RETRIES,
  delayMs: number = RETRY_DELAY_MS
): Promise<T> {
  let lastError: Error | unknown;
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      console.warn(`Attempt ${i + 1}/${retries} failed:`, error instanceof Error ? error.message : 'Unknown error');
      if (i < retries - 1) {
        await delay(delayMs * (i + 1)); // Exponential backoff
      }
    }
  }
  throw lastError;
}

// CME month codes for Natural Gas futures
const MONTH_CODES: Record<number, string> = {
  1: 'F', 2: 'G', 3: 'H', 4: 'J', 5: 'K', 6: 'M',
  7: 'N', 8: 'Q', 9: 'U', 10: 'V', 11: 'X', 12: 'Z'
};

const MONTH_NAMES = [
  '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

export interface ForwardCurveData {
  contract: string;
  symbol: string;
  month: number;
  year: number;
  cmeCode: string;
  price: number;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  lastUpdate: string | null;
  expiryDate: string | null;
}

export interface HistoricalData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Cached data file structure
interface CachedData<T> {
  lastUpdated: string;
  data: T;
}

// Yahoo Finance quote response type
interface YahooQuote {
  regularMarketPrice?: number;
  regularMarketOpen?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  regularMarketTime?: Date | number;
  expireDate?: Date | string;
  expireIsoDate?: string;
}

// Yahoo Finance historical response type
interface YahooHistoricalRow {
  date: Date;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  adjClose?: number;
}

/**
 * Read cached data from JSON file
 */
function readCachedData<T>(filename: string): CachedData<T> | null {
  try {
    const dataDir = getDataDir();
    const filepath = path.join(dataDir, filename);

    if (!fs.existsSync(filepath)) {
      console.log(`[Cache] File not found: ${filepath}`);
      return null;
    }

    const content = fs.readFileSync(filepath, 'utf-8');
    const data = JSON.parse(content) as CachedData<T>;

    console.log(`[Cache] Loaded ${filename}, last updated: ${data.lastUpdated}`);
    return data;
  } catch (error) {
    console.error(`[Cache] Failed to read ${filename}:`, error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

/**
 * Generate futures contract symbols for the next N months
 */
function generateContractSymbols(numMonths: number): Array<{symbol: string; month: number; year: number; cmeCode: string}> {
  const contracts: Array<{symbol: string; month: number; year: number; cmeCode: string}> = [];
  const now = new Date();
  let currentMonth = now.getMonth() + 1; // 1-12
  let currentYear = now.getFullYear();

  for (let i = 0; i < numMonths; i++) {
    const monthCode = MONTH_CODES[currentMonth];
    const yearCode = currentYear.toString().slice(-2);
    const symbol = `NG${monthCode}${yearCode}.NYM`;
    const cmeCode = `NG${monthCode}${yearCode}`;

    contracts.push({
      symbol,
      month: currentMonth,
      year: currentYear,
      cmeCode
    });

    // Move to next month
    currentMonth++;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear++;
    }
  }

  return contracts;
}

/**
 * Parse timestamp from Yahoo Finance response
 */
function parseTimestamp(time: Date | number | undefined): string | null {
  if (!time) return null;

  if (time instanceof Date) {
    return time.toISOString();
  }

  // If it's a Unix timestamp (seconds), convert to milliseconds
  if (typeof time === 'number') {
    // Check if it's in seconds (reasonable range for timestamps)
    if (time < 10000000000) {
      return new Date(time * 1000).toISOString();
    }
    return new Date(time).toISOString();
  }

  return null;
}

/**
 * Parse expiry date from Yahoo Finance response
 */
function parseExpiryDate(expireDate: Date | string | undefined): string | null {
  if (!expireDate) return null;

  if (expireDate instanceof Date) {
    return expireDate.toISOString().split('T')[0]; // Return YYYY-MM-DD format
  }

  if (typeof expireDate === 'string') {
    // If it's already an ISO string, extract the date part
    return expireDate.split('T')[0];
  }

  return null;
}

/**
 * Fetch forward curve data from Yahoo Finance API
 */
async function fetchForwardCurveFromAPI(numMonths: number): Promise<ForwardCurveData[]> {
  const contracts = generateContractSymbols(numMonths);
  const results: ForwardCurveData[] = [];

  // Fetch data for each contract with retry logic
  for (const contract of contracts) {
    try {
      const quote = await withRetry(
        () => yahooFinance.quote(contract.symbol) as Promise<YahooQuote>,
        2, // Fewer retries for individual quotes
        500 // Shorter delay
      );

      if (quote && quote.regularMarketPrice) {
        results.push({
          contract: `${MONTH_NAMES[contract.month]} ${contract.year}`,
          symbol: contract.symbol,
          month: contract.month,
          year: contract.year,
          cmeCode: contract.cmeCode,
          price: quote.regularMarketPrice,
          open: quote.regularMarketOpen ?? null,
          high: quote.regularMarketDayHigh ?? null,
          low: quote.regularMarketDayLow ?? null,
          volume: quote.regularMarketVolume ?? null,
          lastUpdate: parseTimestamp(quote.regularMarketTime),
          expiryDate: parseExpiryDate(quote.expireDate || quote.expireIsoDate)
        });
      }
    } catch (error) {
      // Skip contracts that fail to fetch (may be delisted or not yet available)
      console.warn(`Failed to fetch ${contract.symbol}:`, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  return results;
}

/**
 * Fetch live forward curve data for Natural Gas futures
 * First tries to read from cached JSON file, then falls back to Yahoo Finance API
 */
export async function fetchForwardCurve(numMonths: number = 24): Promise<ForwardCurveData[]> {
  // Try to read from cached file first
  const cached = readCachedData<ForwardCurveData[]>('forward-curve.json');

  if (cached && cached.data && cached.data.length > 0) {
    console.log(`[ForwardCurve] Using cached data with ${cached.data.length} contracts`);
    // Filter to requested number of months
    return cached.data.slice(0, numMonths);
  }

  // Fall back to API
  console.log(`[ForwardCurve] No cached data, fetching from Yahoo Finance API...`);
  const apiData = await fetchForwardCurveFromAPI(numMonths);

  if (apiData.length === 0) {
    throw new Error('Failed to fetch forward curve data. No cached data available and API is unavailable.');
  }

  return apiData;
}

/**
 * Fetch historical price data from Yahoo Finance API
 */
async function fetchHistoricalFromAPI(days: number): Promise<HistoricalData[]> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const result = await withRetry(async () => {
    const data = await yahooFinance.historical('NG=F', {
      period1: startDate,
      period2: endDate,
      interval: '1d'
    }) as YahooHistoricalRow[];

    if (!data || !Array.isArray(data)) {
      throw new Error('Invalid response from Yahoo Finance');
    }

    return data;
  });

  return result
    .filter((q) => q.close !== null && q.close !== undefined)
    .map((q) => ({
      date: new Date(q.date).toISOString().split('T')[0],
      open: q.open ?? 0,
      high: q.high ?? 0,
      low: q.low ?? 0,
      close: q.close ?? 0,
      volume: q.volume ?? 0
    }));
}

/**
 * Fetch historical price data for the continuous Natural Gas contract
 * First tries to read from cached JSON file, then falls back to Yahoo Finance API
 */
export async function fetchHistoricalPrices(days: number = 365): Promise<HistoricalData[]> {
  // Try to read from cached file first
  const cached = readCachedData<HistoricalData[]>('historical.json');

  if (cached && cached.data && cached.data.length > 0) {
    console.log(`[Historical] Using cached data with ${cached.data.length} records`);

    // Filter to requested number of days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    const filteredData = cached.data.filter(d => d.date >= cutoffStr);
    return filteredData;
  }

  // Fall back to API
  console.log(`[Historical] No cached data, fetching from Yahoo Finance API...`);

  try {
    return await fetchHistoricalFromAPI(days);
  } catch (error) {
    console.error('Failed to fetch historical data after retries:', error instanceof Error ? error.message : 'Unknown error');
    throw new Error('Failed to fetch historical price data. No cached data available and API is unavailable.');
  }
}
