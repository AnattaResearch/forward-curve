import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { fetchForwardCurve, fetchHistoricalPrices, type ForwardCurveData, type HistoricalData } from "./fetchNGData";

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
    // Get live forward curve
    forwardCurve: publicProcedure
      .input(z.object({
        numMonths: z.number().min(1).max(60).default(24),
      }))
      .query(async ({ input }): Promise<ForwardCurveData[]> => {
        try {
          return await fetchForwardCurve(input.numMonths);
        } catch (error) {
          console.error("Failed to fetch forward curve:", error);
          throw new Error("Failed to fetch forward curve data");
        }
      }),

    // Get historical prices
    historical: publicProcedure
      .input(z.object({
        days: z.number().min(1).max(3650).default(365),
      }))
      .query(async ({ input }): Promise<HistoricalData[]> => {
        try {
          return await fetchHistoricalPrices(input.days);
        } catch (error) {
          console.error("Failed to fetch historical data:", error);
          throw new Error("Failed to fetch historical price data");
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
