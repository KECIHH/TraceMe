import { expect, test } from "@playwright/test";

const username = process.env.INITIAL_ADMIN_USERNAME ?? "admin";
const password = process.env.INITIAL_ADMIN_PASSWORD ?? "change-me-before-use";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(password);

  const responsePromise = page.waitForResponse(response =>
    response.url().includes("/api/auth/login") && response.request().method() === "POST"
  );

  await page.getByRole("button", { name: "登录" }).click();

  const response = await responsePromise;
  if (!response.ok()) {
    throw new Error(`Login failed: ${response.status()}`);
  }

  await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
}

test("stage 17 maps, mock weather, and currency rates render", async ({
  page,
}) => {
  const suffix = Date.now();
  const tripTitle = `E2E 阶段17 ${suffix}`;
  const placeName = `阶段17地点 ${suffix}`;

  await login(page);

  await page.goto("/trips/new");
  await page.getByLabel("旅行名称 *").fill(tripTitle);
  await page.getByLabel("状态").selectOption("PLANNING");
  await page.getByLabel("出发日期").fill("2026-10-01");
  await page.getByLabel("返回日期").fill("2026-10-02");
  await page.getByLabel("主要目的地").fill("上海");
  await page.getByLabel("默认货币").fill("CNY");
  await page.getByRole("button", { name: "创建旅行" }).click();
  await expect(page).toHaveURL(/\/trips\/(?!new$)[^/]+$/);

  const tripUrl = page.url();

  await page.goto(`${tripUrl}/places`);
  await page.getByLabel("名称 *").fill(placeName);
  await page.getByLabel("类型").selectOption("ATTRACTION");
  await page.getByLabel("地址").fill("上海市黄浦区");
  await page.getByLabel("纬度").fill("31.2304");
  await page.getByLabel("经度").fill("121.4737");
  await page.getByRole("button", { name: "新增地点" }).click();
  await expect(page.getByRole("heading", { name: placeName })).toBeVisible();

  await page.goto(`${tripUrl}/map`);
  await expect(page.getByTestId("trip-map-canvas").first()).toBeVisible();
  await expect(page.getByTestId("map-marker")).toHaveCount(1);
  await expect(page.getByText("Google Maps").first()).toBeVisible();

  await page.goto(`${tripUrl}/itinerary`);
  await page.getByTestId("generate-itinerary-days").click();
  await expect(page.getByTestId("itinerary-day-card")).toHaveCount(2);
  await page.getByText("手动天气备注").first().click();
  await page.locator('input[name="manualNote"]').first().fill("晴，注意防晒");
  await page.getByRole("button", { name: "保存天气备注" }).click();
  await expect(page.getByTestId("weather-snapshot").first()).toContainText("晴，注意防晒");
  await page.getByTestId("refresh-weather").click();
  await expect(page.getByText(/天气 provider 未配置|天气已刷新|上次缓存/)).toBeVisible();

  await page.goto(`${tripUrl}/today`);
  await expect(page.getByText("外部数据仅供参考，请人工核验。")).toBeVisible();
  await expect(page.getByTestId("today-refresh-weather")).toBeVisible();

  await page.goto(`${tripUrl}/budget`);
  await page.getByLabel("标题 *").fill(`咖啡 ${suffix}`);
  await page.getByLabel("金额 *").fill("10");
  await page.getByLabel("货币 *").fill("USD");
  await page.getByRole("button", { name: "新增支出" }).click();
  await page.getByTestId("refresh-exchange-rates").click();
  await expect(page.getByTestId("currency-rate-card").first()).toContainText("USD");
  await expect(page.getByTestId("currency-rate-card").first()).toContainText("mock-exchange-rate");
  await page.getByLabel("原币种").fill("USD");
  await page.getByLabel("目标币种").fill("CNY");
  const manualRateInput = page.getByRole("textbox", {
    exact: true,
    name: "汇率",
  });
  await expect(page.locator('input[name="manualRate"]')).toHaveCount(1);
  await manualRateInput.fill("7.2");
  await expect(manualRateInput).toHaveValue("7.2");
  await page.getByRole("button", { name: "保存手动汇率" }).click();
  await expect(page.getByTestId("currency-rate-card").first()).toContainText("USD");
  await expect(page.getByText("汇率仅作为记录用途，请以实际支付为准。")).toBeVisible();
});
