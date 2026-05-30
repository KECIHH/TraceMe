import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import { verifyBackupFile } from "@/lib/backup";

const username = process.env.INITIAL_ADMIN_USERNAME ?? "admin";
const password = process.env.INITIAL_ADMIN_PASSWORD ?? "change-me-before-use";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(password);

  const responsePromise = page.waitForResponse(response =>
    response.url().includes('/api/auth/login') && response.request().method() === 'POST'
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
  await page.getByLabel("出发日期").fill("2026-10-01");
  await page.getByLabel("返回日期").fill("2026-10-05");
  await page.getByLabel("出发城市").fill("上海");
  await page.getByLabel("主要目的地").fill("京都");
  await page.getByLabel("总预算").fill("12000");
  await page.getByRole("button", { name: "创建旅行" }).click();
  await expect(page).toHaveURL(/\/trips\/(?!new$)[^/]+$/);

  return page.url();
}

test("user can export a trip and manage system backups", async ({ page }) => {
  const suffix = Date.now();
  const tripTitle = `E2E 导出旅行 ${suffix}`;
  const backupNote = `E2E 备份 ${suffix}`;

  await login(page);
  const tripUrl = await createTrip(page, tripTitle);

  await page.goto(`${tripUrl}/export`);
  await expect(page.getByRole("heading", { name: "导出旅行数据" })).toBeVisible();
  await expect(page.getByText("不要把备份文件发给 AI")).toBeVisible();

  const [markdownDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "导出 Markdown" }).click(),
  ]);
  const markdownPath = await markdownDownload.path();
  expect(markdownDownload.suggestedFilename()).toMatch(/\.md$/);
  expect(readFileSync(markdownPath!, "utf8")).toContain(tripTitle);

  const [jsonDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "导出 JSON" }).click(),
  ]);
  const jsonPath = await jsonDownload.path();
  const json = JSON.parse(readFileSync(jsonPath!, "utf8")) as {
    exportType: string;
    trip: { title: string };
  };

  expect(json.exportType).toBe("trip");
  expect(json.trip.title).toBe(tripTitle);

  const [printPage] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("link", { name: "打开可打印 HTML" }).click(),
  ]);
  await expect(printPage.getByRole("heading", { name: tripTitle })).toBeVisible();
  await expect(printPage.getByRole("button", { name: "打印" })).toBeVisible();
  await printPage.close();

  await page.goto("/settings/backups");
  await expect(page.getByRole("heading", { name: "系统备份管理" })).toBeVisible();
  await expect(page.getByText("不要把备份文件发给 AI")).toBeVisible();
  await page.getByLabel("备份备注").fill(backupNote);
  await page.getByRole("button", { name: "创建备份" }).click();
  await expect(page.getByText("系统备份已创建")).toBeVisible();

  const backupRecord = page.getByTestId("backup-record").filter({
    hasText: backupNote,
  });
  await expect(backupRecord).toBeVisible();
  await expect(backupRecord).toContainText("成功");

  const [backupDownload] = await Promise.all([
    page.waitForEvent("download"),
    backupRecord.getByRole("link", { name: "下载备份" }).click(),
  ]);
  expect(backupDownload.suggestedFilename()).toMatch(
    /^travel-planner-backup-\d{8}-\d{6}\.zip$/,
  );
  const backupPath = await backupDownload.path();
  const verification = await verifyBackupFile(backupPath!);
  expect(verification.ok).toBe(true);
  const backupBytes = readFileSync(backupPath!);
  expect(backupBytes.includes(Buffer.from(".env"))).toBe(false);
  expect(backupBytes.includes(Buffer.from("manifest.json"))).toBe(true);
  expect(backupBytes.includes(Buffer.from("database/e2e.db"))).toBe(true);
  expect(backupBytes.includes(Buffer.from(".snapshot-"))).toBe(false);

  await page.reload();
  const backupRecordAfterDownload = page.getByTestId("backup-record").filter({
    hasText: backupNote,
  });
  await expect(backupRecordAfterDownload).toBeVisible();

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("删除备份文件");
    await dialog.accept();
  });
  await backupRecordAfterDownload.getByRole("button", { name: "删除备份" }).click();
  await expect(page.getByText("备份文件已删除")).toBeVisible();
  await expect(
    page.getByTestId("backup-record").filter({ hasText: backupNote }),
  ).toContainText("已删除");
});
