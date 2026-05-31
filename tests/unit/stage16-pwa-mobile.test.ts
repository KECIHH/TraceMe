import { describe, expect, it } from "vitest";

import {
  attachOfflineCacheMetadata,
  buildOfflineCacheVersion,
  formatOfflineLocalTime,
  OFFLINE_CACHE_SCHEMA_VERSION,
  isValidChineseResidentId,
  isSensitiveDocumentType,
  redactSensitiveOfflineText,
  sanitizeOfflineText,
  stripSensitiveFields,
  type OfflineTripSummary,
} from "@/lib/offline";
import {
  calculateContainedImageSize,
  getCompressedImageMimeType,
  isCompressibleImageMimeType,
} from "@/lib/images";
import {
  nextThemeMode,
  resolveThemeMode,
  themeModeLabel,
} from "@/lib/theme";

describe("stage 16 offline data hygiene", () => {
  it("strips sensitive keys before offline storage", () => {
    const sanitized = stripSensitiveFields({
      apiKey: "secret",
      nested: {
        sessionToken: "token",
        title: "杭州旅行",
      },
      title: "TraceMe",
    });

    expect(sanitized).toEqual({
      nested: { title: "杭州旅行" },
      title: "TraceMe",
    });
  });

  it("redacts sensitive text snippets in offline notes", () => {
    expect(redactSensitiveOfflineText("护照: E12345678")).toContain("[已隐藏]");
    expect(redactSensitiveOfflineText("身份证 110101199001011234")).toContain(
      "[已隐藏]",
    );
    expect(sanitizeOfflineText("清单 身份证:110101199001011234")).toContain(
      "[已隐藏]",
    );
    expect(redactSensitiveOfflineText("普通编号 123456789012345678")).toContain(
      "123456789012345678",
    );
    expect(isValidChineseResidentId("11010519491231002X")).toBe(true);
  });

  it("classifies sensitive document types outside offline cache", () => {
    expect(isSensitiveDocumentType("PASSPORT")).toBe(true);
    expect(isSensitiveDocumentType("ID_CARD")).toBe(true);
    expect(isSensitiveDocumentType("ITINERARY")).toBe(false);
  });

  it("generates stable cache versions from sanitized summaries", () => {
    const summary = minimalOfflineSummary();
    const first = buildOfflineCacheVersion(summary);
    const second = buildOfflineCacheVersion({
      ...summary,
      places: [...summary.places],
    });

    expect(first).toMatch(/^[a-f0-9]{16}$/);
    expect(second).toBe(first);
    expect(attachOfflineCacheMetadata(summary, new Date("2026-05-30")).cacheVersion).toBe(
      first,
    );
  });

  it("formats offline itinerary time in local time instead of UTC", () => {
    expect(formatOfflineLocalTime(new Date(2026, 5, 1, 9, 30))).toBe("09:30");
  });
});

describe("stage 16 theme logic", () => {
  it("resolves system and manual theme preferences", () => {
    expect(resolveThemeMode("system", "dark")).toBe("dark");
    expect(resolveThemeMode("light", "dark")).toBe("light");
    expect(resolveThemeMode("dark", "light")).toBe("dark");
  });

  it("cycles through theme modes and labels them", () => {
    expect(nextThemeMode("system")).toBe("light");
    expect(nextThemeMode("light")).toBe("dark");
    expect(nextThemeMode("dark")).toBe("system");
    expect(themeModeLabel("system")).toBe("跟随系统");
  });
});

describe("stage 16 image upload helpers", () => {
  it("detects supported image formats without affecting documents", () => {
    expect(isCompressibleImageMimeType("image/jpeg")).toBe(true);
    expect(isCompressibleImageMimeType("image/png")).toBe(true);
    expect(isCompressibleImageMimeType("image/avif")).toBe(true);
    expect(isCompressibleImageMimeType("application/pdf")).toBe(false);
  });

  it("calculates bounded image dimensions", () => {
    expect(
      calculateContainedImageSize({
        maxHeight: 1800,
        maxWidth: 1800,
        sourceHeight: 3000,
        sourceWidth: 4000,
      }),
    ).toEqual({ height: 1350, width: 1800 });
    expect(
      calculateContainedImageSize({
        maxHeight: 1800,
        maxWidth: 1800,
        sourceHeight: 600,
        sourceWidth: 800,
      }),
    ).toEqual({ height: 600, width: 800 });
  });

  it("chooses output image formats", () => {
    expect(getCompressedImageMimeType("image/png")).toBe("image/png");
    expect(getCompressedImageMimeType("image/webp")).toBe("image/jpeg");
  });
});

function minimalOfflineSummary(): Omit<
  OfflineTripSummary,
  "cacheVersion" | "generatedAt"
> {
  return {
    budget: {
      baseCurrency: "CNY",
      spentToday: [],
      totalBudget: null,
    },
    checklist: [],
    dateRange: { endDate: "2026-06-02", startDate: "2026-06-01" },
    emergencyNotes: [],
    lodging: [],
    places: [],
    schemaVersion: OFFLINE_CACHE_SCHEMA_VERSION,
    title: "杭州旅行",
    today: {
      city: "杭州",
      date: "2026-06-01",
      items: [],
      nextStep: null,
      theme: null,
      weatherSummary: null,
    },
    transports: [],
    tripId: "trip_1",
  };
}
