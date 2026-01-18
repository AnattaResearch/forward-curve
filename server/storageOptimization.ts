/**
 * Gas Storage Static Intrinsic Valuation
 * 
 * This module implements the static intrinsic valuation algorithm for natural gas storage facilities.
 * The algorithm optimizes injection and withdrawal schedules to maximize the value from seasonal
 * price spreads in the forward curve.
 */

export interface FacilityParams {
  capacity: number;           // Total storage capacity (MMBtu)
  maxInjectionRate: number;   // Maximum daily injection rate (MMBtu/day)
  maxWithdrawalRate: number;  // Maximum daily withdrawal rate (MMBtu/day)
  injectionCost: number;      // Cost per unit injected ($/MMBtu)
  withdrawalCost: number;     // Cost per unit withdrawn ($/MMBtu)
  initialInventory: number;   // Starting inventory level (MMBtu)
  discountRate: number;       // Annual discount rate (decimal, e.g., 0.05 for 5%)
}

export interface ForwardPrice {
  contract: string;           // Contract identifier (e.g., "NGH26")
  month: string;              // Month label (e.g., "Feb 2026")
  price: number;              // Forward price ($/MMBtu)
  expiryDate: string;         // Contract expiry date
  daysInMonth: number;        // Number of days in the contract month
}

export interface MonthlySchedule {
  month: string;
  injection: number;          // Volume injected this month (MMBtu)
  withdrawal: number;         // Volume withdrawn this month (MMBtu)
  netFlow: number;            // Net flow (injection - withdrawal)
  endingInventory: number;    // Inventory at end of month
  price: number;              // Forward price for this month
}

export interface OptimizationResult {
  schedule: MonthlySchedule[];
  totalValue: number;         // Total intrinsic value ($)
  totalInjection: number;     // Total gas injected (MMBtu)
  totalWithdrawal: number;    // Total gas withdrawn (MMBtu)
  peakInventory: number;      // Maximum inventory level reached
  facilityParams: FacilityParams;
}

// Default facility parameters for a typical US natural gas storage facility
export const DEFAULT_FACILITY_PARAMS: FacilityParams = {
  capacity: 1000000,          // 1 Bcf = 1,000,000 MMBtu
  maxInjectionRate: 10000,    // 10,000 MMBtu/day (~100 days to fill)
  maxWithdrawalRate: 20000,   // 20,000 MMBtu/day (~50 days to empty)
  injectionCost: 0.02,        // $0.02/MMBtu
  withdrawalCost: 0.01,       // $0.01/MMBtu
  initialInventory: 0,        // Start empty
  discountRate: 0.05,         // 5% annual
};

/**
 * Calculate the discount factor for a given number of months from now
 */
function getDiscountFactor(monthsFromNow: number, annualRate: number): number {
  return Math.pow(1 + annualRate, -monthsFromNow / 12);
}

/**
 * Calculate the maximum monthly injection volume based on rate and days in month
 */
function getMaxMonthlyInjection(params: FacilityParams, daysInMonth: number): number {
  return params.maxInjectionRate * daysInMonth;
}

/**
 * Calculate the maximum monthly withdrawal volume based on rate and days in month
 */
function getMaxMonthlyWithdrawal(params: FacilityParams, daysInMonth: number): number {
  return params.maxWithdrawalRate * daysInMonth;
}

/**
 * Build the spread matrix for all injection/withdrawal month pairs
 * spread[i][j] = discounted profit from injecting in month i and withdrawing in month j
 */
function buildSpreadMatrix(
  prices: ForwardPrice[],
  params: FacilityParams
): number[][] {
  const n = prices.length;
  const spreads: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // Injection in month i, withdrawal in month j
      const dfI = getDiscountFactor(i, params.discountRate);
      const dfJ = getDiscountFactor(j, params.discountRate);
      
      // Spread = discounted withdrawal revenue - discounted injection cost
      const injectionCostTotal = (prices[i].price + params.injectionCost) * dfI;
      const withdrawalRevenueTotal = (prices[j].price - params.withdrawalCost) * dfJ;
      
      spreads[i][j] = withdrawalRevenueTotal - injectionCostTotal;
    }
  }

  return spreads;
}

/**
 * Greedy algorithm to find optimal injection/withdrawal schedule
 * This is a simplified approach that works well for typical forward curves
 */
export function optimizeStorage(
  forwardPrices: ForwardPrice[],
  params: FacilityParams = DEFAULT_FACILITY_PARAMS
): OptimizationResult {
  const n = forwardPrices.length;
  
  if (n < 2) {
    return {
      schedule: forwardPrices.map(p => ({
        month: p.month,
        injection: 0,
        withdrawal: 0,
        netFlow: 0,
        endingInventory: params.initialInventory,
        price: p.price,
      })),
      totalValue: 0,
      totalInjection: 0,
      totalWithdrawal: 0,
      peakInventory: params.initialInventory,
      facilityParams: params,
    };
  }

  // Build spread matrix
  const spreads = buildSpreadMatrix(forwardPrices, params);

  // Find all positive spreads and sort by value (descending)
  interface SpreadEntry {
    i: number;  // injection month
    j: number;  // withdrawal month
    spread: number;
  }
  
  const positiveSpread: SpreadEntry[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (spreads[i][j] > 0) {
        positiveSpread.push({ i, j, spread: spreads[i][j] });
      }
    }
  }
  
  // Sort by spread value (highest first)
  positiveSpread.sort((a, b) => b.spread - a.spread);

  // Initialize schedule arrays
  const injections = new Array(n).fill(0);
  const withdrawals = new Array(n).fill(0);
  const inventory = new Array(n).fill(0);
  
  // Track remaining capacity for each month
  const maxInjections = forwardPrices.map(p => getMaxMonthlyInjection(params, p.daysInMonth));
  const maxWithdrawals = forwardPrices.map(p => getMaxMonthlyWithdrawal(params, p.daysInMonth));
  const remainingInjectionCapacity = [...maxInjections];
  const remainingWithdrawalCapacity = [...maxWithdrawals];

  // Greedy allocation
  let totalValue = 0;
  
  for (const entry of positiveSpread) {
    const { i, j, spread } = entry;
    
    // Calculate how much volume we can allocate to this spread
    // Limited by: injection capacity at month i, withdrawal capacity at month j,
    // and storage capacity constraints
    
    // First, calculate current inventory trajectory
    let currentInventory = params.initialInventory;
    for (let k = 0; k < n; k++) {
      currentInventory += injections[k] - withdrawals[k];
      inventory[k] = currentInventory;
    }
    
    // Find minimum available capacity between injection and withdrawal months
    let minCapacityBetween = params.capacity;
    for (let k = i; k < j; k++) {
      const inventoryAfterInjection = inventory[k] + (k === i ? remainingInjectionCapacity[i] : 0);
      minCapacityBetween = Math.min(minCapacityBetween, params.capacity - inventory[k]);
    }
    
    // Volume limited by injection rate, withdrawal rate, and capacity
    const volumeByInjection = remainingInjectionCapacity[i];
    const volumeByWithdrawal = remainingWithdrawalCapacity[j];
    const volumeByCapacity = minCapacityBetween;
    
    // Also ensure we don't withdraw more than we have
    let availableForWithdrawal = params.initialInventory;
    for (let k = 0; k <= j; k++) {
      availableForWithdrawal += injections[k] - withdrawals[k];
    }
    availableForWithdrawal += volumeByInjection; // Add potential new injection
    
    const volume = Math.max(0, Math.min(
      volumeByInjection,
      volumeByWithdrawal,
      volumeByCapacity,
      availableForWithdrawal
    ));
    
    if (volume > 0) {
      injections[i] += volume;
      withdrawals[j] += volume;
      remainingInjectionCapacity[i] -= volume;
      remainingWithdrawalCapacity[j] -= volume;
      totalValue += volume * spread;
    }
  }

  // Build final schedule with inventory levels
  const schedule: MonthlySchedule[] = [];
  let runningInventory = params.initialInventory;
  let peakInventory = params.initialInventory;
  let totalInjection = 0;
  let totalWithdrawal = 0;

  for (let k = 0; k < n; k++) {
    runningInventory += injections[k] - withdrawals[k];
    peakInventory = Math.max(peakInventory, runningInventory);
    totalInjection += injections[k];
    totalWithdrawal += withdrawals[k];

    schedule.push({
      month: forwardPrices[k].month,
      injection: Math.round(injections[k]),
      withdrawal: Math.round(withdrawals[k]),
      netFlow: Math.round(injections[k] - withdrawals[k]),
      endingInventory: Math.round(runningInventory),
      price: forwardPrices[k].price,
    });
  }

  return {
    schedule,
    totalValue: Math.round(totalValue * 100) / 100,
    totalInjection: Math.round(totalInjection),
    totalWithdrawal: Math.round(totalWithdrawal),
    peakInventory: Math.round(peakInventory),
    facilityParams: params,
  };
}

/**
 * Convert forward curve data to the format needed for optimization
 */
export function prepareForwardPrices(
  forwardCurve: Array<{
    contract: string;
    month: string;
    price: number;
    expiryDate?: string;
  }>
): ForwardPrice[] {
  return forwardCurve.map((item, index) => {
    // Estimate days in month from the month string
    const monthMatch = item.month.match(/([A-Za-z]+)\s+(\d{4})/);
    let daysInMonth = 30; // default
    
    if (monthMatch) {
      const monthName = monthMatch[1];
      const year = parseInt(monthMatch[2]);
      const monthIndex = new Date(`${monthName} 1, ${year}`).getMonth();
      daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    }

    return {
      contract: item.contract,
      month: item.month,
      price: item.price,
      expiryDate: item.expiryDate || '',
      daysInMonth,
    };
  });
}
