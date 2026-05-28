import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.test", override: true });

const e2eEnv = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL ?? "file:./e2e.db",
  INITIAL_ADMIN_USERNAME: process.env.INITIAL_ADMIN_USERNAME ?? "admin",
  INITIAL_ADMIN_PASSWORD:
    process.env.INITIAL_ADMIN_PASSWORD ?? "change-me-before-use",
  E2E_BYPASS_LOGIN_RATE_LIMIT: "true",
  RESET_ADMIN_PASSWORD: "true",
};
const e2ePort = process.env.E2E_PORT ?? "3100";
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: e2eBaseUrl,
    trace: "on-first-retry",
  },
  webServer: {
    command:
      `npm run db:ensure && npm run db:deploy && npm run db:seed && npm run dev -- --hostname 127.0.0.1 --port ${e2ePort}`,
    env: e2eEnv,
    reuseExistingServer: !process.env.CI,
    url: e2eBaseUrl,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
