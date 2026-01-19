#!/usr/bin/env node
/**
 * Fetch market data from Yahoo Finance and save to JSON files.
 * This script is run by GitHub Actions daily.
 */

import YahooFinance from 'yahoo-finance2';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '..', 'data');

// Initialize Yahoo Finance
const yahooFinance = new YahooFinance({
  suppressNotices: ['yahooSurvey', 'ripHistorical'],
});

// CME month codes for Natural Gas futures
const MONTH_CODES = {
  1: 'F', 2: 'G', 3: 'H', 4: 'J', 5: 'K', 6: 'M',
  7: 'N', 8: 'Q', 9: 'U', 10: 'V', 11: 'X', 12: 'Z'
};

const MONTH_NAMES = [
  '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

/**
 * Generate futures contract symbols for the next N months
 */
function generateContractSymbols(numMonths) {
  const contracts = [];
  const now = new Date();
  let currentMonth = now.getMonth() + 1;
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

    currentMonth++;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear++;
    }
  }

  return contracts;
}

/**
 * Fetch forward curve data
 */
async function fetchForwardCurve(numMonths = 36) {
  console.log(`Fetching forward curve for ${numMonths} months...`);
  const contracts = generateContractSymbols(numMonths);
  const results = [];

  for (const contract of contracts) {
    try {
      const quote = await yahooFinance.quote(contract.symbol);

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
          lastUpdate: quote.regularMarketTime ? new Date(quote.regularMarketTime).toISOString() : null,
          expiryDate: quote.expireDate ? new Date(quote.expireDate).toISOString().split('T')[0] : null
        });
        console.log(`  ✓ ${contract.symbol}: $${quote.regularMarketPrice}`);
      }
    } catch (error) {
      console.warn(`  ✗ ${contract.symbol}: ${error.message}`);
    }
  }

  return results;
}

/**
 * Fetch historical price data
 */
async function fetchHistoricalPrices(days = 365) {
  console.log(`Fetching historical prices for ${days} days...`);
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  try {
    const result = await yahooFinance.historical('NG=F', {
      period1: startDate,
      period2: endDate,
      interval: '1d'
    });

    if (!result || !Array.isArray(result)) {
      console.error('Invalid response from Yahoo Finance');
      return [];
    }

    const data = result
      .filter((q) => q.close !== null && q.close !== undefined)
      .map((q) => ({
        date: new Date(q.date).toISOString().split('T')[0],
        open: q.open ?? 0,
        high: q.high ?? 0,
        low: q.low ?? 0,
        close: q.close ?? 0,
        volume: q.volume ?? 0
      }));

    console.log(`  ✓ Fetched ${data.length} historical records`);
    return data;
  } catch (error) {
    console.error(`  ✗ Failed to fetch historical data: ${error.message}`);
    return [];
  }
}

/**
 * Save data to JSON file
 */
function saveData(filename, data) {
  const filepath = path.join(dataDir, filename);
  const output = {
    lastUpdated: new Date().toISOString(),
    data
  };
  fs.writeFileSync(filepath, JSON.stringify(output, null, 2));
  console.log(`Saved ${filename}`);
}

/**
 * Main function
 */
async function main() {
  console.log('=== Fetching Market Data ===');
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('');

  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Fetch and save forward curve
  const forwardCurve = await fetchForwardCurve(36);
  if (forwardCurve.length > 0) {
    saveData('forward-curve.json', forwardCurve);
  } else {
    console.error('No forward curve data fetched!');
    process.exit(1);
  }

  console.log('');

  // Fetch and save historical data
  const historical = await fetchHistoricalPrices(365);
  if (historical.length > 0) {
    saveData('historical.json', historical);
  } else {
    console.error('No historical data fetched!');
    process.exit(1);
  }

  console.log('');
  console.log('=== Done ===');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
