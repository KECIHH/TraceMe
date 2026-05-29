import { expect, test } from "@playwright/test";

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
  await page.getByRole("button", { name: "创建旅行" }).click();
  await expect(page).toHaveURL(/\/trips\/(?!new$)[^/]+$/);

  return page.url();
}

test("user can upload, edit, download, and delete trip documents", async ({
  page,
}) => {
  const suffix = Date.now();
  const tripTitle = `E2E 文件旅行 ${suffix}`;
  const documentTitle = `测试行程单 ${suffix}`;
  const updatedNote = `已确认订单号 ${suffix}`;

  await login(page);
  const tripUrl = await createTrip(page, tripTitle);

  await page.goto(`${tripUrl}/documents`);
  await page.getByLabel("文件标题 *").fill(documentTitle);
  await page.getByLabel("文件类型 *").selectOption("ITINERARY");
  await page.getByLabel("关联日期").fill("2026-10-01");
  await page.getByLabel("备注").fill("初始备注");
  await page.getByRole("checkbox", { name: "敏感文件" }).check();
  await page
    .getByLabel("上传文件 *")
    .setInputFiles({
      buffer: Buffer.from("%PDF-1.4\n% test pdf\n"),
      mimeType: "application/pdf",
      name: "itinerary.pdf",
    });
  await page.getByRole("button", { name: "上传文件", exact: true }).click();

  const documentCard = page.getByTestId("document-card").filter({
    hasText: documentTitle,
  });
  await expect(documentCard).toBeVisible();
  await expect(documentCard).toContainText("itinerary.pdf");
  await expect(documentCard).toContainText("敏感文件");

  await documentCard.locator("summary", { hasText: "编辑文件信息" }).click();
  await documentCard.locator('textarea[name="notes"]').fill(updatedNote);
  await documentCard.getByRole("button", { name: "保存文件信息" }).click();
  await expect(documentCard).toContainText(updatedNote);

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("隐私信息");
    await dialog.accept();
  });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    documentCard.getByRole("link", { name: "下载" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("itinerary.pdf");

  const downloadHref = await documentCard
    .getByRole("link", { name: "下载" })
    .getAttribute("href");
  expect(downloadHref).toBeTruthy();

  await page.context().clearCookies();
  const unauthorizedResponse = await page.request.get(downloadHref!);
  expect(unauthorizedResponse.status()).toBe(401);

  await login(page);
  await page.goto(`${tripUrl}/documents`);
  const cardAfterRelogin = page.getByTestId("document-card").filter({
    hasText: documentTitle,
  });

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain(documentTitle);
    await dialog.accept();
  });
  await cardAfterRelogin.getByRole("button", { name: "删除文件" }).click();
  await expect(page.getByText(documentTitle)).toHaveCount(0);
});

test("document upload blocks dangerous files and normalizes traversal names", async ({
  page,
}) => {
  const suffix = Date.now();
  const tripUrl = await (async () => {
    await login(page);
    return createTrip(page, `E2E 文件安全 ${suffix}`);
  })();

  await page.goto(`${tripUrl}/documents`);
  await page.getByLabel("文件标题 *").fill(`危险脚本 ${suffix}`);
  await page
    .getByLabel("上传文件 *")
    .setInputFiles({
      buffer: Buffer.from("console.log('nope');"),
      mimeType: "application/javascript",
      name: "danger.js",
    });
  await page.getByRole("button", { name: "上传文件", exact: true }).click();
  await expect(page.getByText("文件扩展名不允许上传。")).toBeVisible();

  await page.getByLabel("文件标题 *").fill(`伪装 PDF ${suffix}`);
  await page
    .getByLabel("上传文件 *")
    .setInputFiles({
      buffer: Buffer.from("console.log('fake pdf');"),
      mimeType: "application/pdf",
      name: "fake.pdf",
    });
  await page.getByRole("button", { name: "上传文件", exact: true }).click();
  await expect(page.getByText("PDF 文件内容与扩展名不匹配。")).toBeVisible();

  const safeTitle = `路径穿越文件 ${suffix}`;
  await page.getByLabel("文件标题 *").fill(safeTitle);
  await page.getByLabel("文件类型 *").selectOption("OTHER");
  await page
    .getByLabel("上传文件 *")
    .setInputFiles({
      buffer: Buffer.from("safe text"),
      mimeType: "text/plain",
      name: "../safe.txt",
    });
  await page.getByRole("button", { name: "上传文件", exact: true }).click();

  const documentCard = page.getByTestId("document-card").filter({
    hasText: safeTitle,
  });
  await expect(documentCard).toContainText("safe.txt");
  await expect(documentCard).not.toContainText("../safe.txt");

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain(safeTitle);
    await dialog.accept();
  });
  await documentCard.getByRole("button", { name: "删除文件" }).click();
  await expect(page.getByText(safeTitle)).toHaveCount(0);
});
