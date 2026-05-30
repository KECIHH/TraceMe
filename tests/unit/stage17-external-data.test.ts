import { describe, expect, it } from "vitest";

import {
  convertCurrency,
  dedupeLatestRatesByPair,
  isExchangeRateExpired,
} from "@/lib/external/exchange";
import {
  createNavigationUrls,
  isValidLatitude,
  isValidLongitude,
  projectPlacesToMap,
} from "@/lib/external/map";
import { createMapProvider } from "@/lib/external/map-provider";
import {
  getExchangeRateProviderHealth,
  getMapProviderHealth,
  getWeatherProviderHealth,
} from "@/lib/external/providers";
import {
  isWeatherCacheFresh,
  MockWeatherProvider,
  UnconfiguredWeatherProvider,
} from "@/lib/external/weather";

describe("stage 17 external data helpers", () => {
  it("validates coordinates", () => {
    expect(isValidLatitude(31.23)).toBe(true);
    expect(isValidLatitude(-91)).toBe(false);
    expect(isValidLongitude(121.47)).toBe(true);
    expect(isValidLongitude(181)).toBe(false);
  });

  it("detects provider configuration without exposing secrets", () => {
    expect(getMapProviderHealth({ MAP_PROVIDER: "mock" }).configured).toBe(true);
    expect(getWeatherProviderHealth({ WEATHER_PROVIDER: "mock" }).configured).toBe(true);
    expect(
      getExchangeRateProviderHealth({
        EXCHANGE_RATE_PROVIDER: "open-exchange-rates",
      }).configured,
    ).toBe(false);
    expect(
      getExchangeRateProviderHealth({
        EXCHANGE_RATE_PROVIDER: "open-exchange-rates",
        OPEN_EXCHANGE_RATES_APP_ID: "secret-key",
      }).message,
    ).not.toContain("secret-key");
  });

  it("applies weather cache freshness", () => {
    const now = new Date("2026-05-30T12:00:00Z");
    expect(isWeatherCacheFresh(new Date("2026-05-30T08:00:00Z"), now)).toBe(true);
    expect(isWeatherCacheFresh(new Date("2026-05-29T23:00:00Z"), now)).toBe(false);
  });

  it("converts exchange rates and detects expiration", () => {
    expect(convertCurrency(12.345, 7.2)).toBe(88.88);
    expect(
      isExchangeRateExpired(
        new Date("2026-05-29T11:59:00Z"),
        new Date("2026-05-30T12:00:00Z"),
      ),
    ).toBe(true);
    expect(
      isExchangeRateExpired(
        new Date("2026-05-29T13:00:00Z"),
        new Date("2026-05-30T12:00:00Z"),
      ),
    ).toBe(false);
  });

  it("keeps the latest currency rate per pair", () => {
    const rates = dedupeLatestRatesByPair([
      {
        baseCurrency: "usd",
        fetchedAt: new Date("2026-05-30T08:00:00Z"),
        id: "old",
        targetCurrency: "cny",
        validDate: new Date("2026-05-30T00:00:00Z"),
      },
      {
        baseCurrency: "USD",
        fetchedAt: new Date("2026-05-30T12:00:00Z"),
        id: "new",
        targetCurrency: "CNY",
        validDate: new Date("2026-05-30T00:00:00Z"),
      },
      {
        baseCurrency: "EUR",
        fetchedAt: new Date("2026-05-30T09:00:00Z"),
        id: "eur",
        targetCurrency: "CNY",
        validDate: new Date("2026-05-30T00:00:00Z"),
      },
    ]);

    expect(rates.map((rate) => rate.id)).toEqual(["new", "eur"]);
  });

  it("generates external navigation URLs", () => {
    const urls = createNavigationUrls({
      latitude: 35.6586,
      longitude: 139.7454,
      name: "Tokyo Tower",
    });

    expect(urls.google).toContain("35.6586,139.7454");
    expect(urls.apple).toContain("maps.apple.com");
    expect(urls.gaode).toContain("position=139.7454,35.6586");
    expect(urls.baidu).toContain("api.map.baidu.com");
  });

  it("projects map markers into a stable viewport", () => {
    const projected = projectPlacesToMap([
      {
        id: "a",
        latitude: 30,
        longitude: 120,
        name: "A",
        type: "ATTRACTION",
      },
      {
        id: "b",
        latitude: 31,
        longitude: 121,
        name: "B",
        type: "RESTAURANT",
      },
    ]);

    expect(projected).toHaveLength(2);
    expect(projected[0].x).toBeGreaterThanOrEqual(4);
    expect(projected[0].y).toBeLessThanOrEqual(96);
  });

  it("supports mock and unconfigured providers with friendly fallback", async () => {
    const map = createMapProvider({ MAP_PROVIDER: "none" });
    expect(map.buildPlaceMap([]).ok).toBe(false);

    const mockWeather = await new MockWeatherProvider().fetchForecast({
      date: new Date("2026-05-30"),
      latitude: 31,
      locationName: "Shanghai",
      longitude: 121,
      tripId: "trip",
    });
    expect(mockWeather.ok).toBe(true);

    const noWeather = await new UnconfiguredWeatherProvider().fetchForecast();
    expect(noWeather.ok).toBe(false);
    if (noWeather.ok) {
      throw new Error("Expected unconfigured weather provider to fail");
    }
    expect(noWeather.error).toContain("未配置");
  });
});
