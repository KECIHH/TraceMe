import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

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
  const body = await response.json();

  if (!response.ok()) {
    throw new Error(`Login failed: ${response.status()} - ${JSON.stringify(body)}`);
  }

  await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
}

async function createTrip(page: import("@playwright/test").Page, title: string) {
  await page.goto("/trips/new");
  await page.getByLabel("旅行名称 *").fill(title);
  await page.getByLabel("状态").selectOption("PLANNING");
  await page.getByRole("button", { name: "创建旅行" }).click();
  await expect(page).toHaveURL(/\/trips\/(?!new$)[^/]+$/);

  return page.url();
}

test("user can import places CSV through preview and conflict flow", async ({
  page,
}) => {
  const suffix = Date.now();
  const tripTitle = `E2E 导入旅行 ${suffix}`;
  const placeName = `导入咖啡馆 ${suffix}`;
  const tempDir = mkdtempSync(path.join(tmpdir(), "traceme-import-"));
  const placesCsvPath = path.join(tempDir, "places.csv");
  const badCsvPath = path.join(tempDir, "bad-expenses.csv");

  writeFileSync(
    placesCsvPath,
    `name,address,type,priority,notes\n${placeName},Kyoto,RESTAURANT,HIGH,Imported from CSV\n`,
    "utf8",
  );
  writeFileSync(
    badCsvPath,
    "title,amount,currency\nBroken lunch,-12,CNY\n",
    "utf8",
  );

  await login(page);
  const tripUrl = await createTrip(page, tripTitle);

  await page.goto(`${tripUrl}/import`);
  await expect(page.getByRole("heading", { name: "导入旅行数据" })).toBeVisible();
  await page.getByLabel("导入类型").selectOption("places-csv");
  await page.getByLabel("文件").setInputFiles(placesCsvPath);
  await page.getByRole("button", { name: "上传并解析" }).click();

  await expect(page.getByText("文件已解析完成")).toBeVisible();
  await expect(page.getByText("导入预览")).toBeVisible();
  await expect(page.getByTestId("import-preview-row")).toContainText(placeName);
  await expect(page.getByText("新增").first()).toBeVisible();

  await page.getByRole("button", { name: "确认导入并写入数据库" }).click();
  await expect(page.getByText("导入完成：新增 1 条")).toBeVisible();

  await page.goto(`${tripUrl}/places`);
  await expect(page.getByRole("heading", { name: placeName })).toBeVisible();

  await page.goto(`${tripUrl}/import`);
  await page.getByLabel("导入类型").selectOption("places-csv");
  await page.getByLabel("文件").setInputFiles(placesCsvPath);
  await page.getByRole("button", { name: "上传并解析" }).click();
  await expect(page.getByText("发现 1 行冲突。")).toBeVisible();
  await expect(page.getByText("冲突").first()).toBeVisible();

  await page.goto(`${tripUrl}/import`);
  await page.getByLabel("导入类型").selectOption("expenses-csv");
  await page.getByLabel("文件").setInputFiles(badCsvPath);
  await page.getByRole("button", { name: "上传并解析" }).click();
  await expect(page.getByText("导入解析失败，请查看错误报告。")).toBeVisible();
  await expect(page.getByText("支出金额必须是非负数字。")).toBeVisible();

  await page.goto(`${tripUrl}/places`);
  await expect(page.getByRole("heading", { name: placeName })).toBeVisible();
});
