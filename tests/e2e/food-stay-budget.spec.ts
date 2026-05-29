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

test("user can manage foods, stays, expenses, and budget stats", async ({
  page,
}) => {
  const suffix = Date.now();
  const tripTitle = `E2E 预算旅行 ${suffix}`;
  const foodName = `预算餐厅 ${suffix}`;
  const stayName = `预算酒店 ${suffix}`;
  const expenseTitle = `晚餐 ${suffix}`;
  const updatedExpenseTitle = `晚餐已编辑 ${suffix}`;

  await login(page);

  await page.goto("/trips/new");
  await page.getByLabel("旅行名称 *").fill(tripTitle);
  await page.getByLabel("状态").selectOption("PLANNING");
  await page.getByLabel("默认货币").fill("USD");
  await page.getByRole("button", { name: "创建旅行" }).click();
  await expect(page).toHaveURL(/\/trips\/(?!new$)[^/]+$/);

  const tripUrl = page.url();

  await page.goto(`${tripUrl}/foods`);
  await page.getByLabel("餐厅名称 *").fill(foodName);
  await page.getByLabel("美食状态").selectOption("WANT_TO_TRY");
  await page.getByLabel("地址").fill("中山路 1 号");
  await page.getByLabel("人均价格（USD）").fill("120");
  await page.getByLabel("营业时间").fill("11:00-22:00");
  await page.getByLabel("推荐菜").fill("招牌牛肉, 糖水");
  await page.getByLabel("需要预约").check();
  await page.getByRole("button", { name: "新增餐厅" }).click();
  await expect(page.getByTestId("food-card")).toContainText(foodName);
  await expect(page.getByTestId("food-card")).toContainText("招牌牛肉");
  await expect(page.getByTestId("food-card")).toContainText("USD 120");

  await page.goto(`${tripUrl}/stays`);
  await page.getByLabel("住宿名称 *").fill(stayName);
  await page.getByLabel("订单状态").selectOption("RESERVED");
  await page.getByLabel("入住日期").fill("2026-10-01");
  await page.getByLabel("退房日期").fill("2026-10-03");
  await page.getByLabel("总价（USD）").fill("800");
  await page.getByLabel("电话").fill("010-12345678");
  await page.getByLabel("地址").fill("湖滨路 8 号");
  await page.getByLabel("含早餐").check();
  await page.getByLabel("可寄存行李").check();
  await page.getByLabel("取消政策备注").fill("入住前 24 小时可取消");
  await page.getByRole("button", { name: "新增住宿" }).click();
  await expect(page.getByTestId("stay-card")).toContainText(stayName);
  await expect(page.getByTestId("stay-card")).toContainText("已预订");
  await expect(page.getByTestId("stay-card")).toContainText("USD 800");

  await page.goto(`${tripUrl}/budget`);
  await page.getByLabel("总预算（USD）").fill("2000");
  await page.getByLabel("餐饮预算").fill("500");
  await page.getByLabel("住宿预算").fill("900");
  await page.getByRole("button", { name: "保存预算" }).click();
  await expect(page.getByText("预算已更新。")).toBeVisible();

  await page.getByLabel("标题 *").fill(expenseTitle);
  await page.getByLabel("分类").selectOption("餐饮");
  await page.getByLabel("金额 *").fill("160");
  await page.getByLabel("货币 *").fill("USD");
  await page.getByLabel("支出时间").fill("2026-10-01");
  await page.getByLabel("付款人").fill("我");
  await page.getByLabel("分摊信息").fill("我, 朋友");
  await page.getByLabel("关联地点").selectOption({ label: foodName });
  await page.getByLabel("备注").fill("两人晚餐");
  await page.getByRole("button", { name: "新增支出" }).click();
  await expect(page.getByTestId("expense-card")).toContainText(expenseTitle);
  await expect(page.getByText("USD 160").first()).toBeVisible();
  await expect(page.getByText("8%").first()).toBeVisible();

  const expenseCard = page.getByTestId("expense-card").filter({
    hasText: expenseTitle,
  });
  await expenseCard.locator("summary", { hasText: "编辑支出" }).click();
  await expenseCard.locator('input[name="title"]').fill(updatedExpenseTitle);
  await expenseCard.locator('input[name="amount"]').fill("200");
  await expenseCard.getByRole("button", { name: "保存支出" }).click();
  await expect(page.getByTestId("expense-card")).toContainText(updatedExpenseTitle);
  await expect(page.getByText("10%").first()).toBeVisible();

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain(updatedExpenseTitle);
    await dialog.accept();
  });
  await page.getByTestId("expense-card").getByRole("button", { name: "删除支出" }).click();
  await expect(page.getByText(updatedExpenseTitle)).toHaveCount(0);
});
