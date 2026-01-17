import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { fetchForwardCurve, fetchHistoricalPrices, type ForwardCurveData, type HistoricalData } from "./fetchNGData";
import { apiCache, cacheKeys } from "./cache";

// Cache TTL in milliseconds (5 minutes)
const CACHE_TTL = 5 * 60 * 1000;

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
});

export type AppRouter = typeof appRouter;
