import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { fetchForwardCurve, fetchHistoricalPrices, type ForwardCurveData, type HistoricalData } from "./fetchNGData";
import { apiCache, cacheKeys } from "./cache";
import { 
  runGasStorageOptimization,
  DEFAULT_FACILITY_PARAMS,
  DEFAULT_OPTIMIZATION_PARAMS,
  type GasStorageFacilityParams,
  type GasStorageOptimizationParams,
  type GasStorageResult,
  type ForwardCurveEntry,
} from "./gasStorageClient";

// Cache TTL in milliseconds (5 minutes)
const CACHE_TTL = 5 * 60 * 1000;

// Zod schema for facility parameters (matching gas_storage package)
const facilityParamsSchema = z.object({
  capacity: z.number().min(0.1).default(DEFAULT_FACILITY_PARAMS.capacity),
  max_inject_rate: z.number().min(0.01).default(DEFAULT_FACILITY_PARAMS.max_inject_rate),
  max_withdraw_rate: z.number().min(0.01).default(DEFAULT_FACILITY_PARAMS.max_withdraw_rate),
  inject_cost: z.number().min(0).default(DEFAULT_FACILITY_PARAMS.inject_cost),
  withdraw_cost: z.number().min(0).default(DEFAULT_FACILITY_PARAMS.withdraw_cost),
  initial_inventory: z.number().min(0).default(DEFAULT_FACILITY_PARAMS.initial_inventory),
});

// Zod schema for optimization parameters
const optimizationParamsSchema = z.object({
  risk_free_rate: z.number().min(0).max(1).default(DEFAULT_OPTIMIZATION_PARAMS.risk_free_rate),
  trading_days_per_year: z.number().min(1).max(365).default(DEFAULT_OPTIMIZATION_PARAMS.trading_days_per_year),
  asof_date: z.string().optional(),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Natural Gas Futures API
  futures: router({
    // Get live forward curve with caching
    forwardCurve: publicProcedure
      .input(z.object({
        numMonths: z.number().min(1).max(60).default(24),
      }))
      .query(async ({ input }): Promise<{ data: ForwardCurveData[]; cached: boolean; cacheAge?: number }> => {
        const cacheKey = cacheKeys.forwardCurve(input.numMonths);
        
        // Check cache first
        const cachedData = apiCache.get<{ data: ForwardCurveData[]; timestamp: number }>(cacheKey);
        if (cachedData) {
          const cacheAge = Date.now() - cachedData.timestamp;
          console.log(`[Cache HIT] Forward curve (${input.numMonths} months), age: ${Math.round(cacheAge / 1000)}s`);
          return {
            data: cachedData.data,
            cached: true,
            cacheAge: Math.round(cacheAge / 1000),
          };
        }

        // Fetch fresh data
        console.log(`[Cache MISS] Fetching forward curve (${input.numMonths} months)`);
        try {
          const data = await fetchForwardCurve(input.numMonths);
          
          // Store in cache
          apiCache.set(cacheKey, { data, timestamp: Date.now() }, CACHE_TTL);
          
          return {
            data,
            cached: false,
          };
        } catch (error) {
          console.error("Failed to fetch forward curve:", error);
          throw new Error("Failed to fetch forward curve data");
        }
      }),

    // Get historical prices with caching
    historical: publicProcedure
      .input(z.object({
        days: z.number().min(1).max(3650).default(365),
      }))
      .query(async ({ input }): Promise<{ data: HistoricalData[]; cached: boolean; cacheAge?: number }> => {
        const cacheKey = cacheKeys.historical(input.days);
        
        // Check cache first
        const cachedData = apiCache.get<{ data: HistoricalData[]; timestamp: number }>(cacheKey);
        if (cachedData) {
          const cacheAge = Date.now() - cachedData.timestamp;
          console.log(`[Cache HIT] Historical (${input.days} days), age: ${Math.round(cacheAge / 1000)}s`);
          return {
            data: cachedData.data,
            cached: true,
            cacheAge: Math.round(cacheAge / 1000),
          };
        }

        // Fetch fresh data
        console.log(`[Cache MISS] Fetching historical (${input.days} days)`);
        try {
          const data = await fetchHistoricalPrices(input.days);
          
          // Store in cache
          apiCache.set(cacheKey, { data, timestamp: Date.now() }, CACHE_TTL);
          
          return {
            data,
            cached: false,
          };
        } catch (error) {
          console.error("Failed to fetch historical data:", error);
          throw new Error("Failed to fetch historical price data");
        }
      }),

    // Get cache status
    cacheStatus: publicProcedure.query(() => {
      const stats = apiCache.getStats();
      return {
        ...stats,
        ttlMinutes: CACHE_TTL / 60000,
      };
    }),
  }),

  // Storage Optimization API (using gas_storage Python package)
  storage: router({
    // Get default facility parameters
    defaultFacilityParams: publicProcedure.query(() => {
      return DEFAULT_FACILITY_PARAMS;
    }),

    // Get default optimization parameters
    defaultOptimizationParams: publicProcedure.query(() => {
      return DEFAULT_OPTIMIZATION_PARAMS;
    }),

    // Calculate optimal injection/withdrawal schedule using gas_storage
    optimize: publicProcedure
      .input(z.object({
        numMonths: z.number().min(2).max(60).default(12),
        facilityParams: facilityParamsSchema.optional(),
        optimizationParams: optimizationParamsSchema.optional(),
      }))
      .query(async ({ input }): Promise<{ result: GasStorageResult; forwardCurve: ForwardCurveData[] }> => {
        const facilityParams: GasStorageFacilityParams = input.facilityParams 
          ? { ...DEFAULT_FACILITY_PARAMS, ...input.facilityParams }
          : DEFAULT_FACILITY_PARAMS;

        const optimizationParams: GasStorageOptimizationParams = input.optimizationParams
          ? { ...DEFAULT_OPTIMIZATION_PARAMS, ...input.optimizationParams }
          : DEFAULT_OPTIMIZATION_PARAMS;

        // Ensure initial inventory doesn't exceed capacity
        if (facilityParams.initial_inventory > facilityParams.capacity) {
          facilityParams.initial_inventory = facilityParams.capacity;
        }

        // Fetch forward curve data
        const cacheKey = cacheKeys.forwardCurve(input.numMonths);
        let forwardCurveData: ForwardCurveData[];
        
        const cachedData = apiCache.get<{ data: ForwardCurveData[]; timestamp: number }>(cacheKey);
        if (cachedData) {
          forwardCurveData = cachedData.data;
          console.log(`[Storage Optimize] Using cached forward curve (${input.numMonths} months)`);
        } else {
          console.log(`[Storage Optimize] Fetching forward curve (${input.numMonths} months)`);
          forwardCurveData = await fetchForwardCurve(input.numMonths);
          apiCache.set(cacheKey, { data: forwardCurveData, timestamp: Date.now() }, CACHE_TTL);
        }

        // Convert forward curve data to gas_storage format
        const forwardCurveEntries: ForwardCurveEntry[] = forwardCurveData.map(d => ({
          expiry_date: d.expiryDate || `${d.year}-${String(d.month).padStart(2, '0')}-01`,
          price: d.price,
          contract: d.contract,
        }));

        // Run optimization using gas_storage Python package
        console.log(`[Storage Optimize] Running gas_storage optimization with ${forwardCurveEntries.length} months`);
        const result = await runGasStorageOptimization(
          forwardCurveEntries,
          facilityParams,
          optimizationParams
        );

        if (!result.success) {
          console.error(`[Storage Optimize] Optimization failed: ${result.error}`);
        } else {
          console.log(`[Storage Optimize] Success: ${result.num_trades} trades, PnL: ${result.total_pnl.toFixed(4)}`);
        }

        return {
          result,
          forwardCurve: forwardCurveData,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
