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

test("user can generate a mock AI draft and save it as a note", async ({
  page,
}) => {
  const suffix = Date.now();
  const title = `E2E AI 旅行 ${suffix}`;

  await login(page);

  await page.goto("/trips/new");
  await page.getByLabel("旅行名称 *").fill(title);
  await page.getByLabel("状态").selectOption("PLANNING");
  await page.getByLabel("出发城市").fill("上海");
  await page.getByLabel("主要目的地").fill("成都");
  await page.getByRole("button", { name: "创建旅行" }).click();
  await expect(page).toHaveURL(/\/trips\/(?!new$)[^/]+$/);

  const tripUrl = page.url();
  await page.goto(`${tripUrl}/ai`);

  await expect(
    page.getByText("AI 草稿，需人工核验。营业时间、票价、班次、政策等请以官方渠道为准。"),
  ).toBeVisible();
  await expect(
    page.getByText("请勿输入身份证、护照、手机号、订单号、保险单、同行人隐私等敏感信息。"),
  ).toBeVisible();
  await expect(page.getByText("AI 状态：可用")).toBeVisible();

  await page.getByLabel("任务类型").selectOption("food-recommendations");
  await page.getByRole("textbox", { exact: true, name: "目的地" }).fill("成都");
  await page.getByRole("textbox", { exact: true, name: "口味偏好" }).fill("本地特色小吃");
  await page.getByRole("textbox", { exact: true, name: "预算" }).fill("人均 100 元左右");
  await page.getByRole("textbox", { exact: true, name: "禁忌或过敏" }).fill("不吃太辣");
  await page
    .getByLabel("补充需求（可选）")
    .fill("两日游，希望避开排队特别久的餐厅。");
  await page.getByRole("button", { name: "生成草稿" }).click();

  await expect(page.getByRole("heading", { name: "生成结果" })).toBeVisible();
  await expect(page.locator("pre")).toContainText("# 美食推荐草稿");
  await expect(page.locator("pre")).toContainText("需要人工核验的信息");

  await page.getByRole("button", { name: "保存为笔记" }).click();
  await expect(page.getByText("已保存为笔记。")).toBeVisible();

  await page.goto(`${tripUrl}/notes`);
  await expect(
    page.getByRole("heading", { name: /美食推荐草稿/ }),
  ).toBeVisible();
  await expect(page.locator("article", { hasText: "美食推荐草稿" })).toContainText(
    "# 美食推荐草稿",
  );
  await expect(page.locator("article", { hasText: "美食推荐草稿" })).toContainText(
    "AI 草稿，需人工核验。营业时间、票价、班次、政策等请以官方渠道为准。",
  );
});

test("AI generation blocks sensitive personal information", async ({ page }) => {
  const suffix = Date.now();
  const title = `E2E AI 敏感信息 ${suffix}`;

  await login(page);

  await page.goto("/trips/new");
  await page.getByLabel("旅行名称 *").fill(title);
  await page.getByLabel("主要目的地").fill("成都");
  await page.getByRole("button", { name: "创建旅行" }).click();
  await expect(page).toHaveURL(/\/trips\/(?!new$)[^/]+$/);

  await page.goto(`${page.url()}/ai`);
  await page.getByLabel("任务类型").selectOption("travel-notes");
  await page.getByRole("textbox", { exact: true, name: "目的地" }).fill("成都");
  await page.getByLabel("特殊关注").fill("手机号 13812345678");
  await page.getByRole("button", { name: "生成草稿" }).click();

  await expect(page.getByText("检测到可能包含敏感信息")).toBeVisible();
  await expect(page.locator("pre")).toHaveCount(0);
});
