import { expect, test, type Page } from "@playwright/test";

const username = process.env.INITIAL_ADMIN_USERNAME ?? "admin";
const password = process.env.INITIAL_ADMIN_PASSWORD ?? "change-me-before-use";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
}

async function createTrip(page: Page, title: string) {
  const today = new Date("2026-06-01T00:00:00Z");
  const tomorrow = new Date("2026-06-02T00:00:00Z");

  await page.goto("/trips/new");
  await page.getByLabel("旅行名称 *").fill(title);
  await page.getByLabel("状态").selectOption("TRAVELING");
  await page.getByLabel("出发日期").fill(toDateInput(today));
  await page.getByLabel("返回日期").fill(toDateInput(tomorrow));
  await page.getByLabel("主要目的地").fill("杭州");
  await page.getByRole("button", { name: "创建旅行" }).click();
  await expect(page).toHaveURL(/\/trips\/(?!new$)[^/]+$/);

  return page.url();
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );

  expect(overflow).toBeLessThanOrEqual(2);
}

test("PWA manifest and offline fallback are available", async ({ page }) => {
  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);

  const body = await manifest.json();
  expect(body.display).toBe("standalone");
  expect(body.theme_color).toBe("#2f6f73");
  expect(body.icons.length).toBeGreaterThanOrEqual(2);

  await page.goto("/offline");
  await expect(page.getByRole("heading", { name: /离线/ })).toBeVisible();
});

test("offline cache can refresh and clear on a trip", async ({ page }) => {
  await login(page);
  const tripUrl = await createTrip(page, `PWA 离线旅行 ${Date.now()}`);

  await page.goto(tripUrl);
  await waitForServiceWorker(page);
  await page.getByTestId("refresh-offline-cache").click();
  await expect(page.getByText(/离线摘要已更新/)).toBeVisible();

  const cachedTripIds = await page.evaluate(() =>
    Object.keys(localStorage).filter((key) =>
      key.startsWith("traceme.offline.trip."),
    ),
  );
  expect(cachedTripIds.length).toBe(1);

  await page.getByTestId("clear-offline-cache").click();
  await expect(page.getByText("本设备离线数据已清除。")).toBeVisible();

  const remaining = await page.evaluate(() =>
    Object.keys(localStorage).filter((key) =>
      key.startsWith("traceme.offline.trip."),
    ),
  );
  expect(remaining).toEqual([]);
});

test("cached trip summary is readable after a real offline navigation", async ({
  context,
  page,
}) => {
  await login(page);
  const title = `PWA 真实离线 ${Date.now()}`;
  const tripUrl = await createTrip(page, title);

  await page.goto(tripUrl);
  await waitForServiceWorker(page);
  await page.getByTestId("refresh-offline-cache").click();
  await expect(page.getByText(/离线摘要已更新/)).toBeVisible();

  await context.setOffline(true);
  try {
    await page.goto(`${tripUrl}/today`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText("离线模式")).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test("dark mode can be toggled and remembered", async ({ page }) => {
  await login(page);

  await page.evaluate(() => localStorage.setItem("traceme.theme", "light"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.getByTestId("theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("image upload compresses images and records a thumbnail", async ({ page }) => {
  await login(page);
  const tripUrl = await createTrip(page, `PWA 图片旅行 ${Date.now()}`);
  const title = `图片票据 ${Date.now()}`;

  await page.goto(`${tripUrl}/documents`);
  await page.getByLabel("文件标题 *").fill(title);
  await page.getByLabel("文件类型 *").selectOption("OTHER");
  await page
    .getByLabel("上传文件 *")
    .setInputFiles({
      buffer: png1x1(),
      mimeType: "image/png",
      name: "ticket.png",
    });
  await expect(page.getByText(/缩略图/)).toBeVisible();
  await page.getByRole("button", { name: "上传文件", exact: true }).click();

  const card = page.getByTestId("document-card").filter({ hasText: title });
  await expect(card).toContainText("已生成缩略图");
  await expect(card.getByRole("img", { name: /缩略图/ })).toBeVisible();
});

test.describe("mobile visual coverage", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("captures core mobile pages without horizontal overflow", async ({ page }) => {
    await login(page);
    const tripUrl = await createTrip(page, `移动视觉旅行 ${Date.now()}`);

    await page.goto(`${tripUrl}/itinerary`);
    await page.getByTestId("generate-itinerary-days").click();
    await expect(page.getByTestId("itinerary-day-card")).toHaveCount(2);

    const pages = [
      ["dashboard", "/dashboard"],
      ["trip-detail", tripUrl],
      ["today", `${tripUrl}/today`],
      ["itinerary", `${tripUrl}/itinerary`],
      ["places", `${tripUrl}/places`],
      ["documents", `${tripUrl}/documents`],
      ["settings", "/settings"],
    ] as const;

    for (const [name, url] of pages) {
      await page.goto(url);
      await expectNoHorizontalOverflow(page);
      await page.screenshot({
        fullPage: true,
        path: `test-results/stage16-mobile-${name}.png`,
      });
    }
  });
});

function toDateInput(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function png1x1(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64",
  );
}

async function waitForServiceWorker(page: Page) {
  await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) {
      throw new Error("Service Worker is unavailable.");
    }

    await navigator.serviceWorker.ready;
  });
}
