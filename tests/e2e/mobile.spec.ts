import { expect, test } from "@playwright/test";

const username = process.env.INITIAL_ADMIN_USERNAME ?? "admin";
const password = process.env.INITIAL_ADMIN_PASSWORD ?? "change-me-before-use";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
}

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });

  expect(overflow).toBeLessThanOrEqual(2);
}

test.describe("mobile experience", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("mobile dashboard and menu are usable", async ({ page }) => {
    await login(page);

    await expect(page.getByRole("heading", { name: "旅行工作台" })).toBeVisible();
    await expect(page.getByRole("button", { name: "展开移动端菜单" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByRole("button", { name: "展开移动端菜单" }).click();
    await expect(page.getByRole("navigation", { name: "移动端主导航" })).toBeVisible();
    await page.getByRole("button", { name: "收起移动端菜单" }).click();
    await expect(page.getByRole("navigation", { name: "移动端主导航" })).toHaveCount(0);
  });

  test("mobile trip creation page does not expose trip-only shortcuts", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/trips/new");

    await page.getByRole("button", { name: "展开移动端菜单" }).click();
    const mobileNav = page.getByRole("navigation", { name: "移动端主导航" });

    await expect(mobileNav).toBeVisible();
    await expect(mobileNav.getByRole("link", { name: "今日模式" })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test("mobile today mode keeps quick links before itinerary days exist", async ({
    page,
  }) => {
    const suffix = Date.now();
    const title = `未生成日期旅行 ${suffix}`;
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    await login(page);
    await page.goto("/trips/new");
    await page.getByLabel("旅行名称 *").fill(title);
    await page.getByLabel("状态").selectOption("TRAVELING");
    await page.getByLabel("出发日期").fill(toDateInput(today));
    await page.getByLabel("返回日期").fill(toDateInput(tomorrow));
    await page.getByLabel("主要目的地").fill("杭州");
    await page.getByRole("button", { name: "创建旅行" }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();

    await page.goto(`${page.url()}/today`);
    await expect(page.getByText("还没有可查看的今日行程")).toBeVisible();
    await expect(page.getByText("酒店/住宿入口")).toBeVisible();
    await expect(page.getByText("文件票据入口")).toBeVisible();
    await expect(page.getByText("交通方案入口")).toBeVisible();
    await expect(page.getByText("紧急备注入口")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("mobile trip detail and today mode avoid horizontal overflow", async ({
    page,
  }) => {
    const suffix = Date.now();
    const title = `移动端旅行 ${suffix}`;
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    await login(page);
    await page.goto("/trips/new");
    await page.getByLabel("旅行名称 *").fill(title);
    await page.getByLabel("状态").selectOption("TRAVELING");
    await page.getByLabel("出发日期").fill(toDateInput(today));
    await page.getByLabel("返回日期").fill(toDateInput(tomorrow));
    await page.getByLabel("主要目的地").fill("杭州");
    await page.getByRole("button", { name: "创建旅行" }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();

    const tripUrl = page.url();
    await expectNoHorizontalOverflow(page);

    await page.goto(`${tripUrl}/itinerary`);
    await page.getByTestId("generate-itinerary-days").click();
    await expect(page.getByTestId("itinerary-day-card")).toHaveCount(2);
    await expectNoHorizontalOverflow(page);

    await page.goto(`${tripUrl}/today`);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText("下一项行程")).toBeVisible();
    await expect(page.getByText("今日全部行程")).toBeVisible();
    await expect(page.getByText("酒店/住宿入口")).toBeVisible();
    await expect(page.getByText("文件票据入口")).toBeVisible();
    await expect(page.getByText("交通方案入口")).toBeVisible();
    await expect(page.getByText("紧急备注入口")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("mobile form validation errors are readable", async ({ page }) => {
    await login(page);
    await page.goto("/trips/new");
    await page.getByLabel("旅行名称 *").fill("移动端表单错误");
    await page.getByLabel("出发日期").fill("2026-10-10");
    await page.getByLabel("返回日期").fill("2026-10-01");
    await page.getByRole("button", { name: "创建旅行" }).click();

    await expect(page.getByText("返回日期不能早于出发日期。")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

function toDateInput(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
