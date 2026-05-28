import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.test", override: true });

const e2eEnv = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL ?? "file:./e2e.db",
  INITIAL_ADMIN_USERNAME: process.env.INITIAL_ADMIN_USERNAME ?? "admin",
  INITIAL_ADMIN_PASSWORD:
    process.env.INITIAL_ADMIN_PASSWORD ?? "change-me-before-use",
  RESET_ADMIN_PASSWORD: "true",
};

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command:
      "npm run db:ensure && npm run db:deploy && npm run db:seed && npm run dev -- --hostname 127.0.0.1 --port 3000",
    env: e2eEnv,
    reuseExistingServer: !process.env.CI,
    url: "http://127.0.0.1:3000",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
