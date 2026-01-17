import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("futures.forwardCurve", () => {
  it("returns forward curve data with valid structure", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    // Test with a small number of months to speed up the test
    const result = await caller.futures.forwardCurve({ numMonths: 3 });

    // Should return an array
    expect(Array.isArray(result)).toBe(true);
    
    // Should have at least one contract
    expect(result.length).toBeGreaterThan(0);
    
    // Each item should have the expected structure
    const firstContract = result[0];
    expect(firstContract).toHaveProperty("contract");
    expect(firstContract).toHaveProperty("symbol");
    expect(firstContract).toHaveProperty("month");
    expect(firstContract).toHaveProperty("year");
    expect(firstContract).toHaveProperty("price");
    
    // Price should be a positive number
    expect(typeof firstContract.price).toBe("number");
    expect(firstContract.price).toBeGreaterThan(0);
  }, 60000); // 60 second timeout for API call

  it("respects the numMonths parameter", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result3 = await caller.futures.forwardCurve({ numMonths: 3 });
    const result6 = await caller.futures.forwardCurve({ numMonths: 6 });

    // More months should generally return more contracts (unless some are unavailable)
    expect(result6.length).toBeGreaterThanOrEqual(result3.length);
  }, 120000); // 120 second timeout
});

describe("futures.historical", () => {
  it("returns historical price data with valid structure", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    // Test with 30 days of data
    const result = await caller.futures.historical({ days: 30 });

    // Should return an array
    expect(Array.isArray(result)).toBe(true);
    
    // Should have data points
    expect(result.length).toBeGreaterThan(0);
    
    // Each item should have OHLCV structure
    const firstDay = result[0];
    expect(firstDay).toHaveProperty("date");
    expect(firstDay).toHaveProperty("open");
    expect(firstDay).toHaveProperty("high");
    expect(firstDay).toHaveProperty("low");
    expect(firstDay).toHaveProperty("close");
    expect(firstDay).toHaveProperty("volume");
    
    // Prices should be positive numbers
    expect(typeof firstDay.close).toBe("number");
    expect(firstDay.close).toBeGreaterThan(0);
  }, 60000); // 60 second timeout
});
