import { expect, test } from "@playwright/test";

const username = process.env.INITIAL_ADMIN_USERNAME ?? "admin";
const password = process.env.INITIAL_ADMIN_PASSWORD ?? "change-me-before-use";

test("guest visiting dashboard is redirected to login", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "登录到迹遇" })).toBeVisible();
});

test("guest visiting protected sections is redirected to login", async ({
  page,
}) => {
  for (const path of ["/trips", "/settings"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test("seed user can login, visit dashboard, and logout", async ({ page }) => {
  await page.goto("/login");

  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "旅行工作台" })).toBeVisible();

  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});
