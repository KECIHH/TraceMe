import { getWeatherProviderHealth } from "./providers";

export type WeatherQuery = {
  date: Date;
  latitude: number;
  locationName: string;
  longitude: number;
  tripId: string;
};

export type WeatherForecast = {
  condition: string | null;
  fetchedAt: Date;
  precipitationProbability: number | null;
  rawJson?: unknown;
  source: string;
  temperatureMax: number | null;
  temperatureMin: number | null;
  wind: string | null;
};

export type WeatherProviderResult =
  | { data: WeatherForecast; ok: true }
  | { error: string; ok: false };

export interface WeatherProvider {
  fetchForecast(query: WeatherQuery): Promise<WeatherProviderResult>;
  name: string;
}

export const WEATHER_CACHE_TTL_MS = 1000 * 60 * 60 * 6;

export function isWeatherCacheFresh(
  fetchedAt: Date | null | undefined,
  now = new Date(),
  ttlMs = WEATHER_CACHE_TTL_MS,
): boolean {
  if (!fetchedAt) {
    return false;
  }

  return now.getTime() - fetchedAt.getTime() <= ttlMs;
}

export function formatWeatherSnapshot(snapshot: {
  condition: string | null;
  manualNote?: string | null;
  precipitationProbability: number | null;
  temperatureMax: number | null;
  temperatureMin: number | null;
  wind: string | null;
}): string {
  const temperature =
    snapshot.temperatureMin === null && snapshot.temperatureMax === null
      ? null
      : `${formatNullableNumber(snapshot.temperatureMin)}-${formatNullableNumber(snapshot.temperatureMax)} C`;
  const parts = [
    snapshot.condition,
    temperature,
    snapshot.precipitationProbability === null
      ? null
      : `降水 ${snapshot.precipitationProbability}%`,
    snapshot.wind,
    snapshot.manualNote,
  ].filter(Boolean);

  return parts.join(" / ") || "暂无天气数据";
}

export function createWeatherProvider(
  env: Record<string, string | undefined> = process.env,
): WeatherProvider {
  const health = getWeatherProviderHealth(env);

  if (health.kind === "mock") {
    return new MockWeatherProvider();
  }

  if (health.kind === "open-meteo") {
    return new OpenMeteoWeatherProvider();
  }

  return new UnconfiguredWeatherProvider();
}

export class MockWeatherProvider implements WeatherProvider {
  name = "mock-weather";

  async fetchForecast(query: WeatherQuery): Promise<WeatherProviderResult> {
    return {
      data: {
        condition: "晴间多云",
        fetchedAt: new Date(),
        precipitationProbability: Math.abs(Math.round(query.latitude + query.longitude)) % 60,
        rawJson: { mock: true },
        source: this.name,
        temperatureMax: 24,
        temperatureMin: 18,
        wind: "微风",
      },
      ok: true,
    };
  }
}

export class UnconfiguredWeatherProvider implements WeatherProvider {
  name = "none";

  async fetchForecast(): Promise<WeatherProviderResult> {
    return { error: "天气 provider 未配置。", ok: false };
  }
}

class OpenMeteoWeatherProvider implements WeatherProvider {
  name = "open-meteo";

  async fetchForecast(query: WeatherQuery): Promise<WeatherProviderResult> {
    try {
      const date = toDateKey(query.date);
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.searchParams.set("latitude", String(query.latitude));
      url.searchParams.set("longitude", String(query.longitude));
      url.searchParams.set("daily", "temperature_2m_min,temperature_2m_max,precipitation_probability_max,weather_code,wind_speed_10m_max");
      url.searchParams.set("start_date", date);
      url.searchParams.set("end_date", date);
      url.searchParams.set("timezone", "auto");

      const response = await fetch(url, { cache: "no-store" });

      if (!response.ok) {
        return { error: `天气服务返回 ${response.status}` , ok: false };
      }

      const body = await response.json() as {
        daily?: {
          precipitation_probability_max?: Array<number | null>;
          temperature_2m_max?: Array<number | null>;
          temperature_2m_min?: Array<number | null>;
          weather_code?: Array<number | null>;
          wind_speed_10m_max?: Array<number | null>;
        };
      };
      const daily = body.daily;

      if (!daily) {
        return { error: "天气服务没有返回 daily 数据。", ok: false };
      }

      return {
        data: {
          condition: describeWeatherCode(daily.weather_code?.[0] ?? null),
          fetchedAt: new Date(),
          precipitationProbability: daily.precipitation_probability_max?.[0] ?? null,
          rawJson: body,
          source: this.name,
          temperatureMax: daily.temperature_2m_max?.[0] ?? null,
          temperatureMin: daily.temperature_2m_min?.[0] ?? null,
          wind: daily.wind_speed_10m_max?.[0] === null || daily.wind_speed_10m_max?.[0] === undefined
            ? null
            : `${daily.wind_speed_10m_max[0]} km/h`,
        },
        ok: true,
      };
    } catch {
      return { error: "天气服务请求失败，已尝试使用缓存。", ok: false };
    }
  }
}

export function toDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function describeWeatherCode(code: number | null): string | null {
  if (code === null) {
    return null;
  }

  if (code === 0) return "晴";
  if ([1, 2, 3].includes(code)) return "多云";
  if ([45, 48].includes(code)) return "雾";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "雨";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "雪";
  if ([95, 96, 99].includes(code)) return "雷雨";
  return `天气代码 ${code}`;
}

function formatNullableNumber(value: number | null): string {
  return value === null ? "?" : String(Math.round(value));
}
