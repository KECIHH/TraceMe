import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

const prisma = new PrismaClient();
const username = process.env.INITIAL_ADMIN_USERNAME ?? "admin";
const password = process.env.INITIAL_ADMIN_PASSWORD ?? "change-me-before-use";

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("user can complete a trip review, save preferences, export markdown, and reuse preferences in AI planning", async ({
  page,
}) => {
  await login(page);

  await page.goto("/trips/new");
  await page.locator('input[name="title"]').fill("阶段23杭州复盘");
  await page.locator('select[name="status"]').selectOption("COMPLETED");
  await page.locator('input[name="startDate"]').fill("2026-05-01");
  await page.locator('input[name="endDate"]').fill("2026-05-03");
  await page.locator('input[name="homeCity"]').fill("上海");
  await page.locator('input[name="mainDestination"]').fill("杭州");
  await page.locator('input[name="budgetAmount"]').fill("5000");
  await page.getByRole("button", { name: "创建旅行" }).click();
  await expect(page).toHaveURL(/\/trips\/(?!new$)[^/]+$/, { timeout: 15000 });

  const tripId = page.url().split("/trips/")[1]?.split(/[/?#]/)[0];
  expect(tripId).toBeTruthy();

  await page.goto(`/trips/${tripId}/review`);
  await expect(
    page.getByRole("heading", { name: "旅行复盘与个人知识库" }),
  ).toBeVisible();

  await page
    .locator('textarea[name="summary"]')
    .fill("整体喜欢慢节奏，预算敏感，不喜欢转场过多。");
  await page.locator('input[name="actualCostAmount"]').fill("4600");
  await page.locator('select[name="actualPace"]').selectOption("relaxed");
  await page
    .locator('textarea[name="recommendations"]')
    .fill("龙井村适合慢逛\n本地美食区域值得再去");
  await page
    .locator('textarea[name="warnings"]')
    .fill("周末热门景点排队过久\n跨区转场太多会疲惫");
  await page
    .locator('textarea[name="regrets"]')
    .fill("没有提前预约，预算缓冲留少了");
  await page
    .locator('textarea[name="nextTimeAdvice"]')
    .fill("下次每天 2-3 个核心点，交通尽量少换乘，住宿要安静安全。");
  await page
    .locator('textarea[name="placeTags"]')
    .fill("龙井村：适合慢逛、值得再去\n西湖：避开周末");
  await page
    .locator('textarea[name="stayTags"]')
    .fill("湖滨住宿：安静、安全、交通方便");
  await page
    .locator('textarea[name="transportTags"]')
    .fill("高铁：少换乘、确定性高");

  await page.getByRole("button", { name: "生成 AI 复盘草稿" }).click();
  await expect(page).toHaveURL(/\/review\?message=/, { timeout: 15000 });
  await expect(page.locator('textarea[name="summary"]')).toHaveValue(
    /阶段23杭州复盘复盘/,
  );

  await page.getByRole("button", { name: "确认并保存正式复盘" }).click();
  await expect(page).toHaveURL(/\/review\?message=/, { timeout: 15000 });
  await expect(page.getByText("喜欢慢节奏", { exact: true })).toBeVisible();
  await expect(page.getByText("不喜欢转场过多", { exact: true })).toBeVisible();
  await expect(page.getByText("预算敏感", { exact: true })).toBeVisible();
  await expect(page.getByText("下一次旅行建议", { exact: true })).toBeVisible();

  const exportResponse = await page.request.get(
    `/api/trips/${tripId}/review/export?format=md`,
  );
  expect(exportResponse.ok()).toBeTruthy();
  const markdown = await exportResponse.text();
  expect(markdown).toContain("阶段23杭州复盘复盘");
  expect(markdown).toContain("## 推荐");
  expect(markdown).not.toContain("aiDraftJson");
  expect(markdown).not.toContain("createdById");

  await page.goto("/trips/ai-plan");
  await page.locator('textarea[name="travelGoal"]').fill("下一次周边三日游");
  await page.locator('input[name="destination"]').fill("苏州");
  await page.locator('input[name="homeCity"]').fill("上海");
  await page.locator('input[name="startDate"]').fill("2026-06-01");
  await page.locator('input[name="endDate"]').fill("2026-06-03");
  await page.locator('input[name="people"]').fill("2");
  await page.locator('input[name="budgetAmount"]').fill("4000");
  await page.getByRole("button", { name: "生成 AI 方案" }).click();

  await expect(page).toHaveURL(/\/trips\/ai-plan\?draftId=/, {
    timeout: 15000,
  });
  await expect(page.getByTestId("ai-plan-preview")).toBeVisible();
  await expect(page.getByText(/慢旅行/).first()).toBeVisible();
  await expect(page.getByText(/少换乘/).first()).toBeVisible();
  await expect(page.getByText(/预算优先/).first()).toBeVisible();
});

async function login(page: import("@playwright/test").Page) {
  await page.context().clearCookies();
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
