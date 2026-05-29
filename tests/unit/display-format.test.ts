import { describe, expect, it } from "vitest";

import {
  formatDisplayDate,
  formatDisplayFileSize,
  formatDisplayMoney,
  formatDisplayTime,
  formatEmptyValue,
  formatTripStatusLabel,
} from "@/lib/display-format";

describe("display format helpers", () => {
  it("formats dates consistently in Chinese locale", () => {
    expect(formatDisplayDate(new Date(2026, 9, 1))).toBe("2026/10/01");
    expect(formatDisplayDate(null)).toBe("未填写");
  });

  it("formats time values consistently", () => {
    expect(formatDisplayTime(new Date(2026, 9, 1, 9, 5))).toBe("09:05");
    expect(formatDisplayTime(undefined)).toBe("未填写");
  });

  it("formats money with currency and grouping", () => {
    expect(formatDisplayMoney(12000, "CNY")).toBe("CNY 12,000");
    expect(formatDisplayMoney("1288.5", "JPY")).toBe("JPY 1,288.50");
    expect(formatDisplayMoney(null, "CNY")).toBe("未填写");
  });

  it("formats file sizes", () => {
    expect(formatDisplayFileSize(0)).toBe("0 B");
    expect(formatDisplayFileSize(512)).toBe("512 B");
    expect(formatDisplayFileSize(1024)).toBe("1.0 KB");
    expect(formatDisplayFileSize(1024 * 1024)).toBe("1.0 MB");
  });

  it("maps statuses to Chinese labels", () => {
    expect(formatTripStatusLabel("PLANNING")).toBe("规划中");
    expect(formatTripStatusLabel("TRAVELING")).toBe("旅行中");
  });

  it("formats empty values with a stable fallback", () => {
    expect(formatEmptyValue("")).toBe("未填写");
    expect(formatEmptyValue("  ")).toBe("未填写");
    expect(formatEmptyValue(null)).toBe("未填写");
    expect(formatEmptyValue("上海")).toBe("上海");
  });
});
