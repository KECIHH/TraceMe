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

test("user can create route plans, score options, switch weights, select and delete", async ({
  page,
}) => {
  const suffix = Date.now();
  const tripTitle = `E2E 交通路线 ${suffix}`;
  const routeTitle = `上海到杭州 ${suffix}`;

  await login(page);
  await page.goto("/trips/new");
  await page.getByLabel("旅行名称 *").fill(tripTitle);
  await page.getByLabel("状态").selectOption("PLANNING");
  await page.getByRole("button", { name: "创建旅行" }).click();
  await expect(page).toHaveURL(/\/trips\/(?!new$)[^/]+$/);

  const tripUrl = page.url();
  await page.goto(`${tripUrl}/routes`);
  await expect(page.getByText("请以官方渠道和购票平台实际信息为准")).toBeVisible();

  await page.getByLabel("标题 *").fill(routeTitle);
  await page.getByLabel("起点 *").fill("上海");
  await page.getByLabel("终点 *").fill("杭州");
  await page.getByLabel("出发日期").fill("2026-10-01");
  await page.getByRole("button", { name: "创建路线规划" }).click();
  await expect(page).toHaveURL(/\/routes\/[^/]+$/);
  await expect(page.getByRole("heading", { name: routeTitle })).toBeVisible();

  const optionForm = page.getByTestId("add-transport-option");
  await fillTransportOption(optionForm, {
    mode: "TRAIN",
    provider: "高铁官方",
    number: "G100",
    departTime: "2026-10-01T09:00",
    arriveTime: "2026-10-01T10:10",
    minutes: "100",
    price: "120",
    transfers: "0",
    comfort: "82",
    risk: "10",
    luggage: "80",
    flexibility: "65",
  });
  await optionForm.getByRole("button", { name: "添加交通方案" }).click();
  await expect(page.getByTestId("transport-option-card")).toHaveCount(1);
  await expect(page.getByText("推荐分")).toBeVisible();

  const refreshedOptionForm = page.getByTestId("add-transport-option");
  await fillTransportOption(refreshedOptionForm, {
    mode: "COACH",
    provider: "慢车平台",
    number: "B200",
    departTime: "2026-10-01T08:30",
    arriveTime: "2026-10-01T12:00",
    minutes: "230",
    price: "45",
    transfers: "1",
    comfort: "55",
    risk: "25",
    luggage: "60",
    flexibility: "85",
  });
  await refreshedOptionForm.getByRole("button", { name: "添加交通方案" }).click();
  await expect(page.getByTestId("transport-option-card")).toHaveCount(2);
  await expect(page.getByRole("heading", { name: "横向对比" })).toBeVisible();

  await page.getByLabel("权重模式").selectOption("budget");
  await page.getByRole("button", { name: "保存路线规划和权重" }).click();
  await expect(page.getByText("路线规划和权重已保存。")).toBeVisible();
  await expect(page.getByText("权重：省钱优先")).toBeVisible();

  const cheaperCard = page.getByTestId("transport-option-card").filter({
    hasText: "慢车平台",
  });
  await cheaperCard.getByRole("button", { name: "选择为推荐方案" }).click();
  await expect(cheaperCard.getByText("当前推荐")).toBeVisible();

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("当前已选择方案");
    await dialog.accept();
  });
  await cheaperCard.getByRole("button", { name: "删除方案" }).click();
  await expect(page.getByTestId("transport-option-card")).toHaveCount(1);
  await expect(page.getByText("推荐选择已清空")).toBeVisible();
});

async function fillTransportOption(
  container: import("@playwright/test").Locator,
  option: {
    arriveTime: string;
    comfort: string;
    departTime: string;
    flexibility: string;
    luggage: string;
    minutes: string;
    mode: string;
    number: string;
    price: string;
    provider: string;
    risk: string;
    transfers: string;
  },
) {
  await container.getByLabel("起点 *").fill("上海");
  await container.getByLabel("终点 *").fill("杭州");
  await container.getByLabel("交通方式").selectOption(option.mode);
  await container.getByLabel("承运方/平台").fill(option.provider);
  await container.getByLabel("车次/航班号").fill(option.number);
  await container.getByLabel("出发时间").fill(option.departTime);
  await container.getByLabel("到达时间").fill(option.arriveTime);
  await container.getByLabel("门到门总耗时，分钟").fill(option.minutes);
  await container.getByLabel("价格").fill(option.price);
  await container.getByLabel("货币").fill("CNY");
  await container.getByLabel("中转次数").fill(option.transfers);
  await container.getByLabel("舒适度评分，0-100").fill(option.comfort);
  await container.getByLabel("风险评分，0-100，越高风险越高").fill(option.risk);
  await container.getByLabel("行李友好度，0-100").fill(option.luggage);
  await container.getByLabel("退改灵活度，0-100").fill(option.flexibility);
}
