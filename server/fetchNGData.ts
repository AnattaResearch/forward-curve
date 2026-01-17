import YahooFinance from 'yahoo-finance2';

// Initialize yahoo-finance2 v3 with suppressed notices
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

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
 * Fetch live forward curve data for Natural Gas futures
 */
export async function fetchForwardCurve(numMonths: number = 24): Promise<ForwardCurveData[]> {
  const contracts = generateContractSymbols(numMonths);
  const results: ForwardCurveData[] = [];
  
  // Fetch data for each contract
  for (const contract of contracts) {
    try {
      const quote = await yahooFinance.quote(contract.symbol) as YahooQuote;
      
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
 * Fetch historical price data for the continuous Natural Gas contract
 */
export async function fetchHistoricalPrices(days: number = 365): Promise<HistoricalData[]> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  try {
    const result = await yahooFinance.historical('NG=F', {
      period1: startDate,
      period2: endDate,
      interval: '1d'
    }) as YahooHistoricalRow[];
    
    if (!result || !Array.isArray(result)) {
      return [];
    }
    
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
  } catch (error) {
    console.error('Failed to fetch historical data:', error instanceof Error ? error.message : 'Unknown error');
    throw new Error('Failed to fetch historical price data');
  }
}
