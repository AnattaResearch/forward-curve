import { describe, expect, it } from "vitest";
import {
  optimizeStorage,
  prepareForwardPrices,
  DEFAULT_FACILITY_PARAMS,
  type FacilityParams,
  type ForwardPrice,
} from "./storageOptimization";

describe("Storage Optimization", () => {
  // Sample forward curve with typical seasonal pattern (low summer, high winter)
  const sampleForwardCurve: ForwardPrice[] = [
    { contract: "NGH26", month: "Mar 2026", price: 2.50, expiryDate: "2026-02-25", daysInMonth: 31 },
    { contract: "NGJ26", month: "Apr 2026", price: 2.30, expiryDate: "2026-03-27", daysInMonth: 30 },
    { contract: "NGK26", month: "May 2026", price: 2.20, expiryDate: "2026-04-28", daysInMonth: 31 },
    { contract: "NGM26", month: "Jun 2026", price: 2.25, expiryDate: "2026-05-27", daysInMonth: 30 },
    { contract: "NGN26", month: "Jul 2026", price: 2.35, expiryDate: "2026-06-26", daysInMonth: 31 },
    { contract: "NGQ26", month: "Aug 2026", price: 2.45, expiryDate: "2026-07-29", daysInMonth: 31 },
    { contract: "NGU26", month: "Sep 2026", price: 2.55, expiryDate: "2026-08-27", daysInMonth: 30 },
    { contract: "NGV26", month: "Oct 2026", price: 2.80, expiryDate: "2026-09-28", daysInMonth: 31 },
    { contract: "NGX26", month: "Nov 2026", price: 3.20, expiryDate: "2026-10-28", daysInMonth: 30 },
    { contract: "NGZ26", month: "Dec 2026", price: 3.80, expiryDate: "2026-11-25", daysInMonth: 31 },
    { contract: "NGF27", month: "Jan 2027", price: 4.00, expiryDate: "2026-12-29", daysInMonth: 31 },
    { contract: "NGG27", month: "Feb 2027", price: 3.60, expiryDate: "2027-01-27", daysInMonth: 28 },
  ];

  describe("optimizeStorage", () => {
    it("should return a valid optimization result", () => {
      const result = optimizeStorage(sampleForwardCurve, DEFAULT_FACILITY_PARAMS);

      expect(result).toBeDefined();
      expect(result.schedule).toHaveLength(sampleForwardCurve.length);
      expect(result.totalValue).toBeGreaterThanOrEqual(0);
      expect(result.facilityParams).toEqual(DEFAULT_FACILITY_PARAMS);
    });

    it("should have matching injection and withdrawal totals", () => {
      const result = optimizeStorage(sampleForwardCurve, DEFAULT_FACILITY_PARAMS);

      // Total injection should equal total withdrawal (facility starts and ends empty)
      expect(result.totalInjection).toBe(result.totalWithdrawal);
    });

    it("should not exceed facility capacity", () => {
      const result = optimizeStorage(sampleForwardCurve, DEFAULT_FACILITY_PARAMS);

      expect(result.peakInventory).toBeLessThanOrEqual(DEFAULT_FACILITY_PARAMS.capacity);
      
      // Check all ending inventory values
      for (const schedule of result.schedule) {
        expect(schedule.endingInventory).toBeLessThanOrEqual(DEFAULT_FACILITY_PARAMS.capacity);
        expect(schedule.endingInventory).toBeGreaterThanOrEqual(0);
      }
    });

    it("should inject during low price months and withdraw during high price months", () => {
      const result = optimizeStorage(sampleForwardCurve, DEFAULT_FACILITY_PARAMS);

      // Find months with injection and withdrawal
      const injectionMonths = result.schedule.filter(s => s.injection > 0);
      const withdrawalMonths = result.schedule.filter(s => s.withdrawal > 0);

      if (injectionMonths.length > 0 && withdrawalMonths.length > 0) {
        // Average injection price should be lower than average withdrawal price
        const avgInjectionPrice = injectionMonths.reduce((sum, s) => sum + s.price, 0) / injectionMonths.length;
        const avgWithdrawalPrice = withdrawalMonths.reduce((sum, s) => sum + s.price, 0) / withdrawalMonths.length;

        expect(avgWithdrawalPrice).toBeGreaterThan(avgInjectionPrice);
      }
    });

    it("should respect monthly injection rate limits", () => {
      const params: FacilityParams = {
        ...DEFAULT_FACILITY_PARAMS,
        maxInjectionRate: 5000, // 5,000 MMBtu/day
      };

      const result = optimizeStorage(sampleForwardCurve, params);

      for (const schedule of result.schedule) {
        const forwardPrice = sampleForwardCurve.find(fp => fp.month === schedule.month);
        if (forwardPrice) {
          const maxMonthlyInjection = params.maxInjectionRate * forwardPrice.daysInMonth;
          expect(schedule.injection).toBeLessThanOrEqual(maxMonthlyInjection);
        }
      }
    });

    it("should respect monthly withdrawal rate limits", () => {
      const params: FacilityParams = {
        ...DEFAULT_FACILITY_PARAMS,
        maxWithdrawalRate: 10000, // 10,000 MMBtu/day
      };

      const result = optimizeStorage(sampleForwardCurve, params);

      for (const schedule of result.schedule) {
        const forwardPrice = sampleForwardCurve.find(fp => fp.month === schedule.month);
        if (forwardPrice) {
          const maxMonthlyWithdrawal = params.maxWithdrawalRate * forwardPrice.daysInMonth;
          expect(schedule.withdrawal).toBeLessThanOrEqual(maxMonthlyWithdrawal);
        }
      }
    });

    it("should handle initial inventory correctly", () => {
      const params: FacilityParams = {
        ...DEFAULT_FACILITY_PARAMS,
        initialInventory: 500000, // Start with 500k MMBtu
      };

      const result = optimizeStorage(sampleForwardCurve, params);

      // First month's ending inventory should account for initial inventory
      const firstSchedule = result.schedule[0];
      expect(firstSchedule.endingInventory).toBe(
        params.initialInventory + firstSchedule.injection - firstSchedule.withdrawal
      );
    });

    it("should generate positive intrinsic value for seasonal forward curve", () => {
      const result = optimizeStorage(sampleForwardCurve, DEFAULT_FACILITY_PARAMS);

      // With a seasonal curve (low summer, high winter), there should be positive value
      expect(result.totalValue).toBeGreaterThan(0);
    });

    it("should handle flat forward curve with zero or minimal value", () => {
      const flatCurve: ForwardPrice[] = sampleForwardCurve.map(fp => ({
        ...fp,
        price: 3.00, // Same price for all months
      }));

      const result = optimizeStorage(flatCurve, DEFAULT_FACILITY_PARAMS);

      // With flat curve and transaction costs, value should be zero or negative
      // (no profitable spreads after accounting for injection/withdrawal costs)
      expect(result.totalValue).toBeLessThanOrEqual(0);
    });

    it("should return empty schedule for single month", () => {
      const singleMonth: ForwardPrice[] = [sampleForwardCurve[0]];

      const result = optimizeStorage(singleMonth, DEFAULT_FACILITY_PARAMS);

      expect(result.schedule).toHaveLength(1);
      expect(result.totalInjection).toBe(0);
      expect(result.totalWithdrawal).toBe(0);
      expect(result.totalValue).toBe(0);
    });
  });

  describe("prepareForwardPrices", () => {
    it("should convert forward curve data to ForwardPrice format", () => {
      const input = [
        { contract: "NGH26", month: "Mar 2026", price: 2.50, expiryDate: "2026-02-25" },
        { contract: "NGJ26", month: "Apr 2026", price: 2.30, expiryDate: "2026-03-27" },
      ];

      const result = prepareForwardPrices(input);

      expect(result).toHaveLength(2);
      expect(result[0].contract).toBe("NGH26");
      expect(result[0].month).toBe("Mar 2026");
      expect(result[0].price).toBe(2.50);
      expect(result[0].expiryDate).toBe("2026-02-25");
      expect(result[0].daysInMonth).toBe(31); // March has 31 days
    });

    it("should calculate correct days in month", () => {
      const input = [
        { contract: "NGG26", month: "Feb 2026", price: 2.50 },
        { contract: "NGH26", month: "Mar 2026", price: 2.50 },
        { contract: "NGJ26", month: "Apr 2026", price: 2.50 },
      ];

      const result = prepareForwardPrices(input);

      expect(result[0].daysInMonth).toBe(28); // Feb 2026 (not leap year)
      expect(result[1].daysInMonth).toBe(31); // March
      expect(result[2].daysInMonth).toBe(30); // April
    });

    it("should handle missing expiry date", () => {
      const input = [
        { contract: "NGH26", month: "Mar 2026", price: 2.50 },
      ];

      const result = prepareForwardPrices(input);

      expect(result[0].expiryDate).toBe("");
    });
  });

  describe("DEFAULT_FACILITY_PARAMS", () => {
    it("should have reasonable default values", () => {
      expect(DEFAULT_FACILITY_PARAMS.capacity).toBe(1000000);
      expect(DEFAULT_FACILITY_PARAMS.maxInjectionRate).toBe(10000);
      expect(DEFAULT_FACILITY_PARAMS.maxWithdrawalRate).toBe(20000);
      expect(DEFAULT_FACILITY_PARAMS.injectionCost).toBe(0.02);
      expect(DEFAULT_FACILITY_PARAMS.withdrawalCost).toBe(0.01);
      expect(DEFAULT_FACILITY_PARAMS.initialInventory).toBe(0);
      expect(DEFAULT_FACILITY_PARAMS.discountRate).toBe(0.05);
    });
  });
});
