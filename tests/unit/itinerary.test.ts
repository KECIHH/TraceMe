import { describe, expect, it } from "vitest";

import {
  analyzeItineraryDay,
  dateKey,
  generateDateRange,
  getTodayDateMatch,
  isValidTimeOrder,
} from "@/lib/itinerary";

function at(hour: number, minute = 0) {
  return new Date(2026, 4, 28, hour, minute);
}

describe("itinerary helpers", () => {
  it("generates an inclusive date range", () => {
    const dates = generateDateRange(
      new Date(2026, 9, 1),
      new Date(2026, 9, 3),
    );

    expect(dates.map(dateKey)).toEqual([
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
    ]);
  });

  it("detects time conflicts", () => {
    const alerts = analyzeItineraryDay([
      { id: "a", title: "博物馆", startTime: at(9), endTime: at(10, 30) },
      { id: "b", title: "午餐", startTime: at(10), endTime: at(11) },
    ]);

    expect(alerts).toContainEqual({
      type: "time-conflict",
      message: "博物馆 与 午餐 时间重叠",
      itemIds: ["a", "b"],
    });
  });

  it("detects dense days", () => {
    const alerts = analyzeItineraryDay(
      Array.from({ length: 7 }, (_, index) => ({
        id: String(index),
        title: `行程 ${index}`,
        startTime: at(8 + index),
        endTime: at(8 + index, 30),
      })),
    );

    expect(alerts.some((alert) => alert.type === "too-dense")).toBe(true);
  });

  it("detects tight transfers", () => {
    const alerts = analyzeItineraryDay([
      { id: "a", title: "景点", startTime: at(9), endTime: at(10) },
      { id: "b", title: "车站", startTime: at(10, 10), endTime: at(11) },
    ]);

    expect(alerts).toContainEqual({
      type: "tight-transfer",
      message: "景点 到 车站 间隔少于 15 分钟",
      itemIds: ["a", "b"],
    });
  });

  it("matches today by local date", () => {
    const match = getTodayDateMatch(new Date(2026, 4, 28, 15), [
      { id: "before", date: new Date(2026, 4, 27, 23) },
      { id: "today", date: new Date(2026, 4, 28, 0) },
    ]);

    expect(match?.id).toBe("today");
  });

  it("marks missing item time", () => {
    const alerts = analyzeItineraryDay([
      { id: "a", title: "自由活动", startTime: null, endTime: null },
    ]);

    expect(alerts).toEqual([
      {
        type: "missing-time",
        message: "自由活动 未设置时间",
        itemIds: ["a"],
      },
    ]);
  });

  it("validates item start and end time order", () => {
    expect(isValidTimeOrder(at(9), at(10))).toBe(true);
    expect(isValidTimeOrder(at(10), at(10))).toBe(false);
    expect(isValidTimeOrder(at(11), at(10))).toBe(false);
    expect(isValidTimeOrder(null, at(10))).toBe(true);
    expect(isValidTimeOrder(at(10), null)).toBe(true);
  });
});
