export type ProviderKind = "mock" | "none" | "open-meteo" | "open-exchange-rates" | "static";

export type ProviderHealth = {
  configured: boolean;
  kind: ProviderKind;
  message: string;
  publicKeyAllowed?: boolean;
};

export const NO_PROVIDER_MESSAGE = "未配置外部服务，已使用本地兜底；页面不会因此中断。";

export function getMapProviderHealth(
  env: Record<string, string | undefined> = process.env,
): ProviderHealth {
  const kind = normalizeProviderKind(env.MAP_PROVIDER, "none");
  const publicKeyAllowed = env.MAP_PUBLIC_API_KEY_EXPOSED === "true";

  if (kind === "mock") {
    return {
      configured: true,
      kind,
      message: "地图使用 mock provider；适合本地演示和 E2E。",
      publicKeyAllowed,
    };
  }

  if (kind === "static" || env.NEXT_PUBLIC_MAP_PROVIDER) {
    return {
      configured: true,
      kind: "static",
      message: publicKeyAllowed
        ? "地图 public key 仅可用于前端，并应在服务商后台限制域名。"
        : "地图使用前端静态渲染和外部导航链接。",
      publicKeyAllowed,
    };
  }

  return {
    configured: false,
    kind: "none",
    message: NO_PROVIDER_MESSAGE,
    publicKeyAllowed,
  };
}

export function getWeatherProviderHealth(
  env: Record<string, string | undefined> = process.env,
): ProviderHealth {
  const kind = normalizeProviderKind(env.WEATHER_PROVIDER, "none");

  if (kind === "mock") {
    return { configured: true, kind, message: "天气使用 mock provider。" };
  }

  if (kind === "open-meteo") {
    return { configured: true, kind, message: "天气使用 Open-Meteo provider。" };
  }

  return { configured: false, kind: "none", message: NO_PROVIDER_MESSAGE };
}

export function getExchangeRateProviderHealth(
  env: Record<string, string | undefined> = process.env,
): ProviderHealth {
  const kind = normalizeProviderKind(env.EXCHANGE_RATE_PROVIDER, "none");

  if (kind === "mock") {
    return { configured: true, kind, message: "汇率使用 mock provider。" };
  }

  if (kind === "open-exchange-rates" && env.OPEN_EXCHANGE_RATES_APP_ID?.trim()) {
    return {
      configured: true,
      kind,
      message: "汇率使用 Open Exchange Rates provider，服务端 Key 不会下发到前端。",
    };
  }

  if (kind === "open-exchange-rates") {
    return {
      configured: false,
      kind,
      message: "已选择 Open Exchange Rates，但缺少服务端 API Key；将使用手动兜底。",
    };
  }

  return { configured: false, kind: "none", message: NO_PROVIDER_MESSAGE };
}

function normalizeProviderKind(value: string | undefined, fallback: ProviderKind): ProviderKind {
  const normalized = value?.trim().toLowerCase();

  switch (normalized) {
    case "mock":
    case "none":
    case "open-meteo":
    case "open-exchange-rates":
    case "static":
      return normalized;
    default:
      return fallback;
  }
}
