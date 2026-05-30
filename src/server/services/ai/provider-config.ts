import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { createConfiguredAiProvider } from "@/lib/ai";
import { prisma } from "@/lib/prisma";

export const AI_PROVIDER_CONFIG_SETTING_KEY = "ai.provider.config";
export const AI_CONFIG_ENCRYPTION_KEY_ENV = "AI_CONFIG_ENCRYPTION_KEY";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;

export type AiProviderName = "mock" | "openai";

export type StoredAiProviderConfig = {
  apiKeyPreview?: string;
  encryptedApiKey?: EncryptedSecret;
  model: string;
  provider: AiProviderName;
};

export type SafeAiProviderConfig = {
  apiKeyConfigured: boolean;
  apiKeySource: "env" | "stored" | "none";
  apiKeyPreview?: string;
  encryptionReady: boolean;
  model: string;
  provider: AiProviderName;
};

export type ResolvedAiProviderConfig = SafeAiProviderConfig & {
  apiKey?: string;
};

type EncryptedSecret = {
  algorithm: typeof ALGORITHM;
  authTag: string;
  ciphertext: string;
  iv: string;
  version: 1;
};

const DEFAULT_MODEL_BY_PROVIDER: Record<AiProviderName, string> = {
  mock: "mock-travel-structured",
  openai: "gpt-4.1-mini",
};

export function isAiProviderName(value: string): value is AiProviderName {
  return value === "mock" || value === "openai";
}

export function getDefaultModel(provider: AiProviderName): string {
  return DEFAULT_MODEL_BY_PROVIDER[provider];
}

export async function getSafeAiProviderConfig(
  env: Record<string, string | undefined> = process.env,
): Promise<SafeAiProviderConfig> {
  const resolved = await resolveAiProviderConfig(env);

  return {
    apiKeyConfigured: resolved.apiKeyConfigured,
    apiKeyPreview: resolved.apiKeyPreview,
    apiKeySource: resolved.apiKeySource,
    encryptionReady: resolved.encryptionReady,
    model: resolved.model,
    provider: resolved.provider,
  };
}

export async function resolveAiProviderConfig(
  env: Record<string, string | undefined> = process.env,
): Promise<ResolvedAiProviderConfig> {
  const stored = await readStoredProviderConfig();
  const envProvider = isAiProviderName(env.AI_PROVIDER ?? "")
    ? (env.AI_PROVIDER as AiProviderName)
    : null;
  const provider = stored?.provider ?? envProvider ?? "openai";
  const envApiKey = env.OPENAI_API_KEY?.trim();
  const encryptionReady = Boolean(getAiConfigEncryptionKey(env));
  const storedApiKey = stored?.encryptedApiKey
    ? decryptApiKey(stored.encryptedApiKey, env)
    : null;
  const apiKey = provider === "openai" ? envApiKey || storedApiKey || undefined : undefined;
  const model =
    stored?.model?.trim() ||
    env.OPENAI_MODEL?.trim() ||
    getDefaultModel(provider);

  return {
    apiKey,
    apiKeyConfigured: provider === "mock" || Boolean(apiKey),
    apiKeyPreview:
      provider === "openai"
        ? envApiKey
          ? maskApiKey(envApiKey)
          : stored?.apiKeyPreview
        : undefined,
    apiKeySource: provider !== "openai" ? "none" : envApiKey ? "env" : storedApiKey ? "stored" : "none",
    encryptionReady,
    model,
    provider,
  };
}

export async function saveAiProviderConfig(input: {
  apiKey?: string;
  env?: Record<string, string | undefined>;
  model?: string;
  provider: AiProviderName;
}): Promise<void> {
  const env = input.env ?? process.env;
  const existing = await readStoredProviderConfig();
  const apiKey = input.apiKey?.trim();
  const model = input.model?.trim() || getDefaultModel(input.provider);
  const next: StoredAiProviderConfig = {
    apiKeyPreview: existing?.apiKeyPreview,
    encryptedApiKey: existing?.encryptedApiKey,
    model,
    provider: input.provider,
  };

  if (input.provider === "mock") {
    delete next.apiKeyPreview;
    delete next.encryptedApiKey;
  } else if (apiKey) {
    next.encryptedApiKey = encryptApiKey(apiKey, env);
    next.apiKeyPreview = maskApiKey(apiKey);
  }

  if (input.provider === "openai" && !next.encryptedApiKey && !env.OPENAI_API_KEY?.trim()) {
    throw new Error("请填写 API Key，或在服务端配置 OPENAI_API_KEY。");
  }

  await prisma.appSetting.upsert({
    create: { key: AI_PROVIDER_CONFIG_SETTING_KEY, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
    where: { key: AI_PROVIDER_CONFIG_SETTING_KEY },
  });
}

export async function deleteAiProviderConfig(): Promise<void> {
  await prisma.appSetting.deleteMany({
    where: { key: AI_PROVIDER_CONFIG_SETTING_KEY },
  });
}

export async function testAiProviderConnection(
  config: ResolvedAiProviderConfig,
): Promise<{ ok: true } | { message: string; ok: false }> {
  if (!config.apiKeyConfigured) {
    return { message: "AI provider 尚未配置 API Key。", ok: false };
  }

  const provider = createConfiguredAiProvider({
    apiKey: config.apiKey,
    configured: config.apiKeyConfigured,
    model: config.model,
    provider: config.provider,
  });

  try {
    await provider.generateText({
      includeDraftNotice: false,
      maxOutputTokens: 32,
      systemPrompt: "你是连接测试助手。只回复 OK。",
      task: {
        fields: [],
        id: "travel-notes",
        label: "AI provider 连接测试",
        outputSections: ["连接状态"],
        placeholder: "",
      },
      userPrompt: "请回复 OK。",
    });

    return { ok: true };
  } catch {
    return { message: "AI provider 连接测试失败，请检查 API Key、模型和网络。", ok: false };
  }
}

export function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();

  if (trimmed.length <= 8) {
    return "****";
  }

  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

export function encryptApiKey(
  apiKey: string,
  env: Record<string, string | undefined> = process.env,
): EncryptedSecret {
  const key = requireAiConfigEncryptionKey(env);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(apiKey.trim(), "utf8"),
    cipher.final(),
  ]);

  return {
    algorithm: ALGORITHM,
    authTag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    version: 1,
  };
}

export function decryptApiKey(
  encrypted: EncryptedSecret,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const key = getAiConfigEncryptionKey(env);

  if (!key || encrypted.algorithm !== ALGORITHM) {
    return null;
  }

  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(encrypted.iv, "base64url"),
    );

    decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64url"));

    return Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

export function getAiConfigEncryptionKey(
  env: Record<string, string | undefined> = process.env,
): Buffer | null {
  const raw = env[AI_CONFIG_ENCRYPTION_KEY_ENV]?.trim();

  if (!raw) {
    return null;
  }

  if (/^[a-f0-9]{64}$/i.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  const base64 = tryDecodeBase64Key(raw);
  if (base64) {
    return base64;
  }

  if (Buffer.byteLength(raw, "utf8") >= KEY_BYTES) {
    return createHash("sha256").update(raw, "utf8").digest();
  }

  return null;
}

function requireAiConfigEncryptionKey(
  env: Record<string, string | undefined>,
): Buffer {
  const key = getAiConfigEncryptionKey(env);

  if (!key) {
    throw new Error(`${AI_CONFIG_ENCRYPTION_KEY_ENV} is required to store AI API keys.`);
  }

  return key;
}

async function readStoredProviderConfig(): Promise<StoredAiProviderConfig | null> {
  const setting = await prisma.appSetting.findUnique({
    where: { key: AI_PROVIDER_CONFIG_SETTING_KEY },
  });

  if (!setting) {
    return null;
  }

  try {
    const parsed = JSON.parse(setting.value) as Partial<StoredAiProviderConfig>;
    const providerValue = String(parsed.provider ?? "");
    const provider = isAiProviderName(providerValue)
      ? providerValue
      : "openai";

    return {
      apiKeyPreview:
        typeof parsed.apiKeyPreview === "string"
          ? parsed.apiKeyPreview
          : undefined,
      encryptedApiKey: isEncryptedSecret(parsed.encryptedApiKey)
        ? parsed.encryptedApiKey
        : undefined,
      model:
        typeof parsed.model === "string" && parsed.model.trim()
          ? parsed.model
          : getDefaultModel(provider),
      provider,
    };
  } catch {
    return null;
  }
}

function isEncryptedSecret(value: unknown): value is EncryptedSecret {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    record.algorithm === ALGORITHM &&
    typeof record.authTag === "string" &&
    typeof record.ciphertext === "string" &&
    typeof record.iv === "string" &&
    record.version === 1
  );
}

function tryDecodeBase64Key(raw: string): Buffer | null {
  const normalized = raw.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );

  if (!/^[a-z0-9+/]+={0,2}$/i.test(padded)) {
    return null;
  }

  try {
    const decoded = Buffer.from(padded, "base64");
    return decoded.length === KEY_BYTES ? decoded : null;
  } catch {
    return null;
  }
}
