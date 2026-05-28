import { describe, expect, it } from "vitest";

import {
  calculateBudgetUsagePercent,
  calculateCategoryTotals,
  calculateConvertedSpent,
  calculateRemainingBudget,
  calculateUnconvertedTotals,
  convertExpenseToBase,
  isValidNonNegativeAmount,
  normalizeExpenseCategory,
} from "@/lib/budget";

describe("budget helpers", () => {
  it("validates non-negative amounts", () => {
    expect(isValidNonNegativeAmount("0")).toBe(true);
    expect(isValidNonNegativeAmount("88.5")).toBe(true);
    expect(isValidNonNegativeAmount("-1")).toBe(false);
    expect(isValidNonNegativeAmount("")).toBe(false);
  });

  it("defaults blank or unknown categories to other", () => {
    expect(normalizeExpenseCategory("餐饮")).toBe("餐饮");
    expect(normalizeExpenseCategory("")).toBe("其他");
    expect(normalizeExpenseCategory("玩具")).toBe("其他");
  });

  it("calculates category totals", () => {
    const totals = calculateCategoryTotals(
      [
        { amount: 100, category: "餐饮", currency: "CNY" },
        { amount: 80, category: "", currency: "CNY" },
        { amount: 1000, category: "住宿", currency: "JPY", exchangeRate: 0.05 },
      ],
      [
        { amount: 500, category: "餐饮" },
        { amount: 300, category: "住宿" },
      ],
      "CNY",
    );

    expect(totals.find((total) => total.name === "餐饮")?.convertedSpent).toBe(100);
    expect(totals.find((total) => total.name === "住宿")?.convertedSpent).toBe(50);
    expect(totals.find((total) => total.name === "其他")?.convertedSpent).toBe(80);
  });

  it("calculates remaining budget", () => {
    expect(calculateRemainingBudget(1000, 320)).toBe(680);
    expect(calculateRemainingBudget(null, 320)).toBeNull();
  });

  it("converts multi-currency expenses only when exchange rate exists", () => {
    expect(
      convertExpenseToBase(
        { amount: 1000, category: "餐饮", currency: "JPY", exchangeRate: 0.05 },
        "CNY",
      ),
    ).toBe(50);
    expect(
      convertExpenseToBase(
        { amount: 1000, category: "餐饮", currency: "JPY" },
        "CNY",
      ),
    ).toBeNull();
    expect(calculateConvertedSpent([
      { amount: 20, category: "餐饮", currency: "CNY" },
      { amount: 10, category: "餐饮", currency: "USD", exchangeRate: 7.2 },
    ], "CNY")).toBe(92);
  });

  it("keeps unconverted foreign-currency totals separate", () => {
    expect(calculateUnconvertedTotals([
      { amount: 1000, category: "餐饮", currency: "JPY" },
      { amount: 2000, category: "交通", currency: "JPY" },
      { amount: 20, category: "餐饮", currency: "CNY" },
      { amount: 10, category: "购物", currency: "USD", exchangeRate: 7.2 },
    ], "CNY")).toEqual([{ amount: 3000, currency: "JPY" }]);
  });

  it("calculates budget usage percentage", () => {
    expect(calculateBudgetUsagePercent(1000, 250)).toBe(25);
    expect(calculateBudgetUsagePercent(1000, 1250)).toBe(125);
    expect(calculateBudgetUsagePercent(0, 100)).toBe(0);
  });
});
