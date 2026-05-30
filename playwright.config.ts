import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.test", override: true });

const e2ePort = process.env.E2E_PORT ?? "3100";
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";

const e2eEnv = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL ?? "file:./e2e.db",
  INITIAL_ADMIN_USERNAME: process.env.INITIAL_ADMIN_USERNAME ?? "admin",
  INITIAL_ADMIN_PASSWORD:
    process.env.INITIAL_ADMIN_PASSWORD ?? "change-me-before-use",
  E2E_BYPASS_LOGIN_RATE_LIMIT: "true",
  AI_PROVIDER: "mock",
  MAP_PROVIDER: "mock",
  WEATHER_PROVIDER: "mock",
  EXCHANGE_RATE_PROVIDER: "mock",
  OPENAI_API_KEY: "test-openai-key-not-real",
  DOCUMENT_ENCRYPTION_KEY: "test-document-encryption-key-32-bytes-minimum",
  RESET_ADMIN_PASSWORD: "true",
  RESET_AI_ENABLED: "true",
  HOSTNAME: "127.0.0.1",
  PORT: e2ePort,
};

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  reporter: "list",
  workers: 1,
  use: {
    baseURL: e2eBaseUrl,
    trace: "on-first-retry",
  },
  webServer: {
    command: `${npmExecutable} run start:e2e`,
    env: e2eEnv,
    reuseExistingServer: !process.env.CI,
    url: e2eBaseUrl,
    timeout: 120000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
