import { getExchangeRateProviderHealth } from "./providers";
import { toDateKey } from "./weather";

export type ExchangeRateQuery = {
  baseCurrency: string;
  targetCurrency: string;
  tripId?: string | null;
};

export type ExchangeRateQuote = {
  fetchedAt: Date;
  rate: number;
  source: string;
  validDate: Date;
};

export type ExchangeRateProviderResult =
  | { data: ExchangeRateQuote; ok: true }
  | { error: string; ok: false };

export interface ExchangeRateProvider {
  fetchRate(query: ExchangeRateQuery): Promise<ExchangeRateProviderResult>;
  name: string;
}

export const EXCHANGE_RATE_MAX_AGE_MS = 1000 * 60 * 60 * 24;

export function normalizeCurrencyCode(value: string): string {
  return value.trim().toUpperCase();
}

export function convertCurrency(amount: number, rate: number): number {
  return Math.round((amount * rate + Number.EPSILON) * 100) / 100;
}

export function isExchangeRateExpired(
  fetchedAt: Date | null | undefined,
  now = new Date(),
  maxAgeMs = EXCHANGE_RATE_MAX_AGE_MS,
): boolean {
  if (!fetchedAt) {
    return true;
  }

  return now.getTime() - fetchedAt.getTime() > maxAgeMs;
}

export function createExchangeRateProvider(
  env: Record<string, string | undefined> = process.env,
): ExchangeRateProvider {
  const health = getExchangeRateProviderHealth(env);

  if (health.kind === "mock") {
    return new MockExchangeRateProvider();
  }

  if (health.configured && health.kind === "open-exchange-rates") {
    return new OpenExchangeRatesProvider(env.OPEN_EXCHANGE_RATES_APP_ID ?? "");
  }

  return new UnconfiguredExchangeRateProvider();
}

export class MockExchangeRateProvider implements ExchangeRateProvider {
  name = "mock-exchange-rate";

  async fetchRate(query: ExchangeRateQuery): Promise<ExchangeRateProviderResult> {
    const base = normalizeCurrencyCode(query.baseCurrency);
    const target = normalizeCurrencyCode(query.targetCurrency);

    return {
      data: {
        fetchedAt: new Date(),
        rate: base === target ? 1 : mockRateForPair(base, target),
        source: this.name,
        validDate: startOfToday(),
      },
      ok: true,
    };
  }
}

export class UnconfiguredExchangeRateProvider implements ExchangeRateProvider {
  name = "none";

  async fetchRate(): Promise<ExchangeRateProviderResult> {
    return { error: "汇率 provider 未配置。", ok: false };
  }
}

class OpenExchangeRatesProvider implements ExchangeRateProvider {
  name = "open-exchange-rates";

  constructor(private readonly appId: string) {}

  async fetchRate(query: ExchangeRateQuery): Promise<ExchangeRateProviderResult> {
    const base = normalizeCurrencyCode(query.baseCurrency);
    const target = normalizeCurrencyCode(query.targetCurrency);

    if (base === target) {
      return {
        data: {
          fetchedAt: new Date(),
          rate: 1,
          source: this.name,
          validDate: startOfToday(),
        },
        ok: true,
      };
    }

    try {
      const url = new URL("https://openexchangerates.org/api/latest.json");
      url.searchParams.set("app_id", this.appId);
      url.searchParams.set("symbols", Array.from(new Set([base, target])).join(","));
      url.searchParams.set("show_alternative", "false");

      const response = await fetch(url, { cache: "no-store" });

      if (!response.ok) {
        return { error: `汇率服务返回 ${response.status}`, ok: false };
      }

      const body = await response.json() as {
        rates?: Record<string, number>;
        timestamp?: number;
      };
      const usdToBase = body.rates?.[base];
      const usdToTarget = body.rates?.[target];

      if (!usdToBase || !usdToTarget) {
        return { error: "汇率服务没有返回所需货币。", ok: false };
      }

      return {
        data: {
          fetchedAt: new Date(),
          rate: usdToTarget / usdToBase,
          source: this.name,
          validDate: body.timestamp
            ? new Date(body.timestamp * 1000)
            : startOfToday(),
        },
        ok: true,
      };
    } catch {
      return { error: "汇率服务请求失败，已尝试使用缓存。", ok: false };
    }
  }
}

export function currencyRateKey(baseCurrency: string, targetCurrency: string): string {
  return `${normalizeCurrencyCode(baseCurrency)}:${normalizeCurrencyCode(targetCurrency)}`;
}

export type CurrencyRateListItem = {
  baseCurrency: string;
  fetchedAt: Date;
  targetCurrency: string;
  validDate: Date;
};

export function dedupeLatestRatesByPair<T extends CurrencyRateListItem>(
  rates: readonly T[],
): T[] {
  const latestByPair = new Map<string, T>();

  for (const rate of rates) {
    const key = currencyRateKey(rate.baseCurrency, rate.targetCurrency);
    const current = latestByPair.get(key);

    if (!current || compareRateFreshness(rate, current) > 0) {
      latestByPair.set(key, rate);
    }
  }

  return Array.from(latestByPair.values());
}

export function formatRateMeta(rate: {
  fetchedAt: Date;
  isManual?: boolean | null;
  source: string;
  validDate: Date;
}): string {
  const kind = rate.isManual ? "手动汇率" : rate.source;
  return `${kind} / ${toDateKey(rate.validDate)} / 更新 ${toDateKey(rate.fetchedAt)}`;
}

function compareRateFreshness(left: CurrencyRateListItem, right: CurrencyRateListItem): number {
  const fetchedDiff = left.fetchedAt.getTime() - right.fetchedAt.getTime();

  if (fetchedDiff !== 0) {
    return fetchedDiff;
  }

  return left.validDate.getTime() - right.validDate.getTime();
}

function mockRateForPair(base: string, target: string): number {
  const known: Record<string, number> = {
    "CNY:EUR": 0.13,
    "CNY:JPY": 21,
    "CNY:USD": 0.14,
    "EUR:CNY": 7.7,
    "JPY:CNY": 0.048,
    "USD:CNY": 7.2,
  };

  return known[currencyRateKey(base, target)] ?? 1;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
