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

test("stage 18 advanced AI drafts require confirmation before applying", async ({
  page,
}) => {
  const suffix = Date.now();
  const title = `E2E AI 高级草稿 ${suffix}`;
  const fullApiKey = `sk-e2e-full-secret-${suffix}`;

  await login(page);

  await page.goto("/settings/ai");
  await page.getByLabel("Provider").selectOption("openai");
  await page.getByLabel("模型").selectOption("gpt-4.1-mini");
  await page.getByLabel("API Key（留空则保留现有加密 Key 或环境变量）").fill(fullApiKey);
  await page.getByRole("button", { name: "保存 provider 配置" }).click();
  await expect(page.getByText("AI provider 配置已保存。")).toBeVisible();
  await expect(page.getByText(fullApiKey)).toHaveCount(0);

  await page.getByLabel("Provider").selectOption("mock");
  await page.getByLabel("模型").selectOption("mock-travel-structured");
  await page.getByRole("button", { name: "保存 provider 配置" }).click();
  await expect(page.getByText("AI provider 配置已保存。")).toBeVisible();
  await page.getByRole("button", { name: "测试连接" }).click();
  await expect(page.getByText("AI provider 连接测试通过。")).toBeVisible();

  await page.goto("/trips/new");
  await page.getByLabel("旅行名称 *").fill(title);
  await page.getByLabel("状态").selectOption("PLANNING");
  await page.getByLabel("出发城市").fill("上海");
  await page.getByLabel("主要目的地").fill("杭州");
  await page.getByLabel("总预算").fill("3000");
  await page.getByRole("button", { name: "创建旅行" }).click();
  await expect(page).toHaveURL(/\/trips\/(?!new$)[^/]+$/);

  const tripUrl = page.url();
  await page.goto(`${tripUrl}/ai`);
  await page.getByLabel("高级任务").selectOption("itinerary-optimization");
  await page.getByRole("button", { name: "生成结构化草稿" }).click();
  await expect(page.getByText("AI 结构化草稿已生成，请预览后再应用。")).toBeVisible();
  await expect(page.locator("article", { hasText: "行程优化" }).first()).toContainText(
    "AI 草稿，需人工核验",
  );

  await page.getByLabel("高级任务").selectOption("checklist-completion");
  await page.getByRole("button", { name: "生成结构化草稿" }).click();
  await expect(page.getByText("AI 结构化草稿已生成，请预览后再应用。")).toBeVisible();

  const checklistDraft = page.locator("article", { hasText: "清单补全" }).first();
  await checklistDraft.getByRole("button", { name: "应用草稿" }).click();
  await expect(page.getByText(/已应用清单草稿，新增 \d+ 个清单项。/)).toBeVisible();

  await page.goto(`${tripUrl}/checklist`);
  await expect(page.getByRole("heading", { name: "移动电源" })).toBeVisible();

  await page.goto(`${tripUrl}/ai`);
  await page.getByLabel("高级任务").selectOption("budget-risk");
  await page.getByRole("button", { name: "生成结构化草稿" }).click();
  await expect(page.getByText("AI 结构化草稿已生成，请预览后再应用。")).toBeVisible();
  const budgetDraft = page.locator("article", { hasText: "预算风险" }).first();
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("预算风险");
    await dialog.accept();
  });
  await budgetDraft.getByRole("button", { name: "删除草稿" }).click();
  await expect(page.getByText("AI 草稿已删除。")).toBeVisible();
  await expect(budgetDraft).toContainText("已删除");
});
