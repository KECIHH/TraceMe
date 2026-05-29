import { randomBytes, scryptSync } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";

const prisma = new PrismaClient();
const initialPassword = "SettingsPass123";
const changedPassword = "SettingsPass456";
const username = `settings-e2e-${Date.now()}`;

test.beforeAll(async () => {
  await prisma.user.create({
    data: {
      displayName: "Settings E2E",
      passwordHash: hashPassword(initialPassword),
      role: "ADMIN",
      username,
    },
  });
});

test.afterAll(async () => {
  await prisma.user
    .deleteMany({
      where: { username },
    })
    .catch(() => {});
  await prisma.$disconnect();
});

test("user can manage profile, password, AI status, and system info safely", async ({
  page,
}) => {
  await login(page, username, initialPassword);

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "设置中心" })).toBeVisible();
  await expect(page.getByText(username)).toBeVisible();
  await expect(page.getByRole("link", { name: "个人资料" })).toBeVisible();
  await expect(page.getByRole("link", { name: "修改密码" })).toBeVisible();
  await expect(page.getByRole("link", { name: "备份管理" })).toBeVisible();
  await expect(page.getByRole("link", { name: "AI 设置" })).toBeVisible();
  await expect(page.getByRole("link", { name: "关于系统" })).toBeVisible();

  const displayName = `设置测试用户 ${Date.now()}`;
  await page.goto("/settings/profile");
  await expect(page.getByRole("heading", { name: "个人资料" })).toBeVisible();
  await expect(page.getByLabel("用户名")).toHaveValue(username);
  await page.getByLabel("显示名称").fill(displayName);
  await page.getByRole("button", { name: "保存个人资料" }).click();
  await expect(page.getByText("个人资料已更新。")).toBeVisible();
  await expect(page.getByText(displayName)).toBeVisible();

  await page.goto("/settings/password");
  await expect(page.getByRole("heading", { name: "修改密码" })).toBeVisible();
  await page.getByLabel("当前密码").fill(initialPassword);
  await page.getByRole("textbox", { exact: true, name: "新密码" }).fill(changedPassword);
  await page.getByLabel("确认新密码").fill(changedPassword);
  await page.getByRole("button", { name: "更新密码" }).click();
  await expect(page.getByText("密码已更新")).toBeVisible();

  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(initialPassword);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByText("用户名或密码不正确。")).toBeVisible();

  await login(page, username, changedPassword);

  await page.goto("/settings/ai");
  await expect(page.getByRole("heading", { name: "AI 设置" })).toBeVisible();
  await expect(page.getByText("API Key", { exact: true })).toBeVisible();
  await expect(page.getByText("已配置", { exact: true })).toBeVisible();
  await expect(page.getByText("OPENAI_API_KEY")).toHaveCount(0);
  await expect(page.getByText("test-openai-key-not-real")).toHaveCount(0);
  await expect(page.getByText("sk-")).toHaveCount(0);

  await page.goto("/settings/system");
  await expect(page.getByRole("heading", { name: "系统信息" })).toBeVisible();
  await expect(page.getByText("应用名称")).toBeVisible();
  await expect(page.getByText("数据库连接状态")).toBeVisible();
  await expect(page.getByText("旅行数量")).toBeVisible();
  await expect(page.getByText("上传文件总大小")).toBeVisible();
  await expect(page.getByText("备份文件总大小")).toBeVisible();
  await expect(page.getByText("SESSION_SECRET")).toHaveCount(0);
  await expect(page.getByText("OPENAI_API_KEY")).toHaveCount(0);
  await expect(page.getByText("DOCUMENT_ENCRYPTION_KEY")).toHaveCount(0);
  await expect(page.getByText("DATABASE_URL")).toHaveCount(0);

  await page.getByRole("button", { name: "重新计算统计" }).click();
  await expect(page.getByText("系统统计已重新计算。")).toBeVisible();
});

async function login(page: Page, loginUsername: string, loginPassword: string) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(loginUsername);
  await page.getByLabel("密码").fill(loginPassword);
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, 64).toString("hex");

  return `scrypt:${salt}:${derivedKey}`;
}
