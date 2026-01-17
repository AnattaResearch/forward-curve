import { describe, expect, it, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { apiCache } from "./cache";

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
  beforeEach(() => {
    // Clear cache before each test
    apiCache.clear();
  });

  it("returns forward curve data with valid structure including expiryDate", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    // Test with a small number of months to speed up the test
    const result = await caller.futures.forwardCurve({ numMonths: 3 });

    // Should return response with data array
    expect(result).toHaveProperty("data");
    expect(result).toHaveProperty("cached");
    expect(Array.isArray(result.data)).toBe(true);
    
    // Should have at least one contract
    expect(result.data.length).toBeGreaterThan(0);
    
    // Each item should have the expected structure including expiryDate
    const firstContract = result.data[0];
    expect(firstContract).toHaveProperty("contract");
    expect(firstContract).toHaveProperty("symbol");
    expect(firstContract).toHaveProperty("month");
    expect(firstContract).toHaveProperty("year");
    expect(firstContract).toHaveProperty("price");
    expect(firstContract).toHaveProperty("expiryDate");
    
    // Price should be a positive number
    expect(typeof firstContract.price).toBe("number");
    expect(firstContract.price).toBeGreaterThan(0);

    // expiryDate should be a string in YYYY-MM-DD format or null
    if (firstContract.expiryDate !== null) {
      expect(typeof firstContract.expiryDate).toBe("string");
      expect(firstContract.expiryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }

    // First call should not be cached
    expect(result.cached).toBe(false);
  }, 60000); // 60 second timeout for API call

  it("returns cached data on subsequent calls", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    // First call - should not be cached
    const result1 = await caller.futures.forwardCurve({ numMonths: 3 });
    expect(result1.cached).toBe(false);

    // Second call - should be cached
    const result2 = await caller.futures.forwardCurve({ numMonths: 3 });
    expect(result2.cached).toBe(true);
    expect(result2.cacheAge).toBeDefined();
    expect(typeof result2.cacheAge).toBe("number");

    // Data should be the same
    expect(result1.data.length).toBe(result2.data.length);
  }, 120000); // 120 second timeout

  it("respects the numMonths parameter", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result3 = await caller.futures.forwardCurve({ numMonths: 3 });
    const result6 = await caller.futures.forwardCurve({ numMonths: 6 });

    // More months should generally return more contracts (unless some are unavailable)
    expect(result6.data.length).toBeGreaterThanOrEqual(result3.data.length);
  }, 120000); // 120 second timeout
});

describe("futures.historical", () => {
  beforeEach(() => {
    // Clear cache before each test
    apiCache.clear();
  });

  it("returns historical price data with valid structure", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    // Test with 30 days of data
    const result = await caller.futures.historical({ days: 30 });

    // Should return response with data array
    expect(result).toHaveProperty("data");
    expect(result).toHaveProperty("cached");
    expect(Array.isArray(result.data)).toBe(true);
    
    // Should have data points
    expect(result.data.length).toBeGreaterThan(0);
    
    // Each item should have OHLCV structure
    const firstDay = result.data[0];
    expect(firstDay).toHaveProperty("date");
    expect(firstDay).toHaveProperty("open");
    expect(firstDay).toHaveProperty("high");
    expect(firstDay).toHaveProperty("low");
    expect(firstDay).toHaveProperty("close");
    expect(firstDay).toHaveProperty("volume");
    
    // Prices should be positive numbers
    expect(typeof firstDay.close).toBe("number");
    expect(firstDay.close).toBeGreaterThan(0);

    // First call should not be cached
    expect(result.cached).toBe(false);
  }, 60000); // 60 second timeout

  it("returns cached historical data on subsequent calls", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    // First call - should not be cached
    const result1 = await caller.futures.historical({ days: 30 });
    expect(result1.cached).toBe(false);

    // Second call - should be cached
    const result2 = await caller.futures.historical({ days: 30 });
    expect(result2.cached).toBe(true);
    expect(result2.cacheAge).toBeDefined();
  }, 120000); // 120 second timeout
});

describe("futures.cacheStatus", () => {
  it("returns cache statistics", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const status = await caller.futures.cacheStatus();

    expect(status).toHaveProperty("size");
    expect(status).toHaveProperty("keys");
    expect(status).toHaveProperty("ttlMinutes");
    expect(typeof status.size).toBe("number");
    expect(Array.isArray(status.keys)).toBe(true);
    expect(status.ttlMinutes).toBe(5); // 5 minute TTL
  });
});
