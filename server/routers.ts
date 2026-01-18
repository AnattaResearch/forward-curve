import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { fetchForwardCurve, fetchHistoricalPrices, type ForwardCurveData, type HistoricalData } from "./fetchNGData";
import { apiCache, cacheKeys } from "./cache";
import { 
  optimizeStorage, 
  prepareForwardPrices, 
  DEFAULT_FACILITY_PARAMS,
  type FacilityParams,
  type OptimizationResult 
} from "./storageOptimization";

// Cache TTL in milliseconds (5 minutes)
const CACHE_TTL = 5 * 60 * 1000;

// Zod schema for facility parameters
const facilityParamsSchema = z.object({
  capacity: z.number().min(1000).max(100000000).default(DEFAULT_FACILITY_PARAMS.capacity),
  maxInjectionRate: z.number().min(100).max(1000000).default(DEFAULT_FACILITY_PARAMS.maxInjectionRate),
  maxWithdrawalRate: z.number().min(100).max(1000000).default(DEFAULT_FACILITY_PARAMS.maxWithdrawalRate),
  injectionCost: z.number().min(0).max(1).default(DEFAULT_FACILITY_PARAMS.injectionCost),
  withdrawalCost: z.number().min(0).max(1).default(DEFAULT_FACILITY_PARAMS.withdrawalCost),
  initialInventory: z.number().min(0).default(DEFAULT_FACILITY_PARAMS.initialInventory),
  discountRate: z.number().min(0).max(0.5).default(DEFAULT_FACILITY_PARAMS.discountRate),
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

  // Storage Optimization API
  storage: router({
    // Get default facility parameters
    defaultParams: publicProcedure.query(() => {
      return DEFAULT_FACILITY_PARAMS;
    }),

    // Calculate optimal injection/withdrawal schedule
    optimize: publicProcedure
      .input(z.object({
        numMonths: z.number().min(2).max(60).default(12),
        facilityParams: facilityParamsSchema.optional(),
      }))
      .query(async ({ input }): Promise<{ result: OptimizationResult; forwardCurve: ForwardCurveData[] }> => {
        const params: FacilityParams = input.facilityParams 
          ? { ...DEFAULT_FACILITY_PARAMS, ...input.facilityParams }
          : DEFAULT_FACILITY_PARAMS;

        // Ensure initial inventory doesn't exceed capacity
        if (params.initialInventory > params.capacity) {
          params.initialInventory = params.capacity;
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

        // Prepare forward prices for optimization
        // Convert month number to month string format (e.g., "Feb 2026")
        const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const forwardPrices = prepareForwardPrices(
          forwardCurveData.map(d => ({
            contract: d.contract,
            month: `${MONTH_NAMES[d.month]} ${d.year}`,
            price: d.price,
            expiryDate: d.expiryDate || undefined,
          }))
        );

        // Run optimization
        console.log(`[Storage Optimize] Running optimization with ${forwardPrices.length} months`);
        const result = optimizeStorage(forwardPrices, params);

        return {
          result,
          forwardCurve: forwardCurveData,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
