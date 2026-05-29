import { expect, test } from "@playwright/test";

const username = process.env.INITIAL_ADMIN_USERNAME ?? "admin";
const password = process.env.INITIAL_ADMIN_PASSWORD ?? "change-me-before-use";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(password);

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/auth/login") &&
      response.request().method() === "POST",
  );

  await page.getByRole("button", { name: "登录" }).click();

  const response = await responsePromise;
  if (!response.ok()) {
    throw new Error(`Login failed: ${response.status()}`);
  }

  await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
}

test("user can generate, preview, and apply an AI travel plan with mock provider", async ({
  page,
}) => {
  await login(page);

  await page.goto("/trips/new");
  await expect(page.getByRole("heading", { name: "创建旅行计划" })).toBeVisible();
  await page.getByRole("link", { name: "使用 AI 生成旅行" }).click();
  await expect(page).toHaveURL(/\/trips\/ai-plan$/);

  await page.getByLabel("目的地 *").fill("成都");
  await page.getByLabel("出发城市 *").fill("上海");
  await page.getByLabel("出发日期 *").fill("2026-10-01");
  await page.getByLabel("返回日期 *").fill("2026-10-03");
  await page.getByLabel("出行人数").fill("2");
  await page.getByLabel("预算（CNY）").fill("9000");
  await page.getByLabel("美食").check();
  await page.getByLabel("历史").check();
  await page.getByLabel("高铁").check();
  await page.getByLabel("少换乘").check();
  await page.getByLabel("交通方便").check();
  await page.getByLabel("必去地点").fill("宽窄巷子, 武侯祠");
  await page.getByRole("button", { name: "生成 AI 草稿" }).click();

  await expect(page).toHaveURL(/\/trips\/ai-plan\?draftId=/, {
    timeout: 15000,
  });
  await expect(page.getByTestId("ai-plan-preview")).toBeVisible();
  await expect(page.getByText("旅行摘要")).toBeVisible();
  await expect(page.getByTestId("ai-plan-day")).toHaveCount(3);
  await expect(page.getByTestId("ai-plan-place").first()).toBeVisible();
  await expect(page.getByTestId("ai-plan-budget").first()).toBeVisible();
  await expect(page.getByTestId("ai-plan-checklist").first()).toBeVisible();

  await page.getByRole("button", { name: "确认创建旅行" }).click();
  await expect(page).toHaveURL(/\/trips\/(?!ai-plan)(?!new$)[^/]+$/, {
    timeout: 15000,
  });
  await expect(
    page.getByRole("heading", { name: "成都3日 AI 旅行计划" }),
  ).toBeVisible();

  const tripUrl = page.url();
  await page.goto(`${tripUrl}/itinerary`);
  await expect(page.getByTestId("itinerary-day-card")).toHaveCount(3);
  await expect(page.getByText("宽窄巷子").first()).toBeVisible();

  await page.goto(`${tripUrl}/places`);
  await expect(page.getByRole("heading", { name: "宽窄巷子" })).toBeVisible();

  await page.goto(`${tripUrl}/checklist`);
  await expect(page.getByRole("heading", { name: "身份证/护照等有效证件" })).toBeVisible();

  await page.goto(`${tripUrl}/budget`);
  await expect(
    page.getByRole("heading", { name: "AI 估算：交通" }),
  ).toBeVisible();
  await expect(page.getByText("交通").first()).toBeVisible();
});
