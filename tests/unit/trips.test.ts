import { describe, expect, it } from "vitest";

import {
  getTripStatusLabel,
  parseDateInput,
  toDateInputValue,
  validateTripFormValues,
  type TripFormValues,
} from "@/lib/trips";

const validValues: TripFormValues = {
  title: "关西秋日旅行",
  description: "",
  status: "PLANNING",
  startDate: "2026-10-01",
  endDate: "2026-10-07",
  homeCity: "上海",
  mainDestination: "京都",
  baseCurrency: "CNY",
  budgetAmount: "12000",
  coverImage: "",
};

describe("trip validation", () => {
  it("rejects an end date earlier than the start date", () => {
    const result = validateTripFormValues({
      ...validValues,
      endDate: "2026-09-30",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.endDate).toBe("返回日期不能早于出发日期。");
    }
  });

  it("rejects a negative budget", () => {
    const result = validateTripFormValues({
      ...validValues,
      budgetAmount: "-1",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.budgetAmount).toBe("总预算不能小于 0。");
    }
  });

  it("rejects invalid date inputs", () => {
    const result = validateTripFormValues({
      ...validValues,
      startDate: "2026-02-31",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.startDate).toBe("请输入有效的出发日期。");
    }
  });

  it("keeps valid date input values stable", () => {
    const parsedDate = parseDateInput("2026-10-01");

    expect(parsedDate).toBeInstanceOf(Date);
    expect(toDateInputValue(parsedDate)).toBe("2026-10-01");
  });

  it("rejects invalid currency codes", () => {
    const result = validateTripFormValues({
      ...validValues,
      baseCurrency: "人民币",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.baseCurrency).toBe(
        "默认货币必须是 3 位字母代码，例如 CNY。",
      );
    }
  });

  it("rejects non-http cover image URLs", () => {
    const result = validateTripFormValues({
      ...validValues,
      coverImage: "javascript:alert(1)",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.coverImage).toBe(
        "封面图 URL 必须是有效的 http 或 https 地址。",
      );
    }
  });

  it("converts trip status values to Chinese labels", () => {
    expect(getTripStatusLabel("INSPIRATION")).toBe("灵感阶段");
    expect(getTripStatusLabel("PLANNING")).toBe("规划中");
    expect(getTripStatusLabel("BOOKED")).toBe("已预订");
    expect(getTripStatusLabel("DEPARTING_SOON")).toBe("即将出发");
    expect(getTripStatusLabel("TRAVELING")).toBe("旅行中");
    expect(getTripStatusLabel("COMPLETED")).toBe("已结束");
    expect(getTripStatusLabel("ARCHIVED")).toBe("已归档");
  });
});
