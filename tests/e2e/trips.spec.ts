import { expect, test } from "@playwright/test";

const username = process.env.INITIAL_ADMIN_USERNAME ?? "admin";
const password = process.env.INITIAL_ADMIN_PASSWORD ?? "change-me-before-use";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("user can create, view, edit, archive, and delete a trip", async ({
  page,
}) => {
  const suffix = Date.now();
  const title = `E2E 旅行 ${suffix}`;
  const updatedTitle = `E2E 旅行已编辑 ${suffix}`;

  await login(page);

  await page.getByRole("link", { name: "旅行计划" }).click();
  await expect(page).toHaveURL(/\/trips$/);

  await page.getByRole("link", { name: "创建新旅行" }).click();
  await expect(page).toHaveURL(/\/trips\/new$/);

  await page.getByLabel("旅行名称 *").fill(title);
  await page.getByLabel("状态").selectOption("PLANNING");
  await page.getByLabel("出发日期").fill("2026-10-01");
  await page.getByLabel("返回日期").fill("2026-10-07");
  await page.getByLabel("出发城市").fill("上海");
  await page.getByLabel("主要目的地").fill("京都");
  await page.getByLabel("总预算").fill("12000");
  await page.getByLabel("简介").fill("秋日赏枫与城市漫游。");
  await page.getByRole("button", { name: "创建旅行" }).click();

  await expect(page).toHaveURL(/\/trips\/(?!new$)[^/]+$/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText("行程日历")).toBeVisible();

  await page.getByRole("link", { name: "返回旅行列表" }).click();
  await expect(page).toHaveURL(/\/trips$/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  await page.getByPlaceholder("搜索旅行名称、目的地、城市").fill(title);
  await page.getByRole("button", { name: "筛选" }).click();
  await expect(page).toHaveURL(/\/trips\?/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  await page.getByRole("heading", { name: title }).click();
  await page.getByRole("link", { name: "编辑旅行" }).click();
  await expect(page).toHaveURL(/\/edit$/);

  await page.getByLabel("旅行名称 *").fill(updatedTitle);
  await page.getByLabel("状态").selectOption("BOOKED");
  await page.getByLabel("总预算").fill("15000");
  await page.getByRole("button", { name: "保存修改" }).click();

  await expect(page).toHaveURL(/\/trips\/(?!new$)[^/]+$/);
  await expect(page.getByRole("heading", { name: updatedTitle })).toBeVisible();
  await expect(page.locator("span", { hasText: "已预订" })).toBeVisible();

  await page.getByRole("button", { name: "归档旅行" }).click();
  await expect(page.locator("span", { hasText: "已归档" })).toBeVisible();

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain(updatedTitle);
    await dialog.accept();
  });
  await page.getByRole("button", { name: "删除旅行" }).click();

  await expect(page).toHaveURL(/\/trips$/);
  await expect(page.getByText(updatedTitle)).toHaveCount(0);
});

test("trip form shows clear validation errors", async ({ page }) => {
  await login(page);
  await page.goto("/trips/new");

  await page.getByLabel("旅行名称 *").fill("校验测试旅行");
  await page.getByLabel("出发日期").fill("2026-10-10");
  await page.getByLabel("返回日期").fill("2026-10-01");
  await page.getByLabel("默认货币").fill("人民币");
  await page.getByLabel("封面图 URL").fill("javascript:alert(1)");
  await page.getByRole("button", { name: "创建旅行" }).click();

  await expect(page.getByText("返回日期不能早于出发日期。")).toBeVisible();
  await expect(
    page.getByText("默认货币必须是 3 位字母代码，例如 CNY。"),
  ).toBeVisible();
  await expect(
    page.getByText("封面图 URL 必须是有效的 http 或 https 地址。"),
  ).toBeVisible();
});

test("user can manage destinations, places, notes, and checklist", async ({
  page,
}) => {
  const suffix = Date.now();
  const title = `E2E 阶段三旅行 ${suffix}`;
  const destinationName = `京都 ${suffix}`;
  const placeName = `锦市场餐厅 ${suffix}`;
  const noteTitle = `关西攻略 ${suffix}`;
  const checklistTitle = `备用眼镜 ${suffix}`;

  await login(page);

  await page.goto("/trips/new");
  await page.getByLabel("旅行名称 *").fill(title);
  await page.getByLabel("状态").selectOption("PLANNING");
  await page.getByRole("button", { name: "创建旅行" }).click();
  await expect(page).toHaveURL(/\/trips\/(?!new$)[^/]+$/);

  const tripUrl = page.url();

  await page.getByRole("link", { name: "目的地" }).click();
  await expect(page).toHaveURL(/\/destinations$/);
  await page.getByLabel("名称 *").fill(destinationName);
  await page.getByLabel("国家").fill("日本");
  await page.getByLabel("省/州/地区").fill("京都府");
  await page.getByLabel("时区").fill("Asia/Tokyo");
  await page.getByLabel("到达日期").fill("2026-10-01");
  await page.getByLabel("离开日期").fill("2026-10-04");
  await page.getByRole("button", { name: "新增目的地" }).click();
  await expect(page.getByRole("heading", { name: destinationName })).toBeVisible();

  await page.goto(`${tripUrl}/places`);
  await page.getByLabel("名称 *").fill(placeName);
  await page.getByLabel("类型").selectOption("RESTAURANT");
  await page.getByLabel("优先级").selectOption("HIGH");
  await page.getByLabel("关联目的地").selectOption({ label: destinationName });
  await page.getByLabel("地址").fill("京都市中京区");
  await page.getByLabel("来源链接").fill("https://example.com/restaurant");
  await page.getByLabel("标签").fill("美食, 午餐");
  await page.getByRole("button", { name: "新增地点" }).click();
  await expect(page.getByRole("heading", { name: placeName })).toBeVisible();
  await expect(page.getByText("餐厅").first()).toBeVisible();

  await page.getByPlaceholder("搜索地点、地址、备注").fill(placeName);
  await page.getByRole("button", { name: "筛选地点" }).click();
  await expect(page).toHaveURL(/\/places\?/);
  await expect(page.getByRole("heading", { name: placeName })).toBeVisible();

  await page.goto(`${tripUrl}/notes`);
  await page.getByLabel("标题 *").fill(noteTitle);
  await page.getByLabel("内容 *").fill("优先确认营业时间和预约要求。");
  await page.getByLabel("来源链接").fill("https://example.com/guide");
  await page.getByLabel("标签").fill("攻略, 餐厅");
  await page.getByRole("button", { name: "新增笔记" }).click();
  await expect(page.getByRole("heading", { name: noteTitle })).toBeVisible();
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain(noteTitle);
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: "删除笔记" }).click();
  await expect(page.getByRole("heading", { name: noteTitle })).toBeVisible();

  await page.goto(`${tripUrl}/checklist`);
  await page.getByLabel("分类").selectOption("其他");
  await page.getByLabel("清单项 *").fill(checklistTitle);
  await page.getByRole("button", { name: "新增清单项" }).click();
  await expect(page.getByRole("heading", { name: checklistTitle })).toBeVisible();
  await page.getByRole("button", { name: "已准备" }).first().click();
  await expect(page.getByText("完成率 100%")).toBeVisible();

  await page.getByRole("button", { name: "一键生成基础模板清单" }).click();
  await expect(page.getByRole("heading", { name: "身份证" })).toBeVisible();
  await expect(
    page.getByRole("heading", { exact: true, name: "手机" }),
  ).toBeVisible();
});

test("user can manage itinerary days, items, sorting, and today mode", async ({
  page,
}) => {
  const suffix = Date.now();
  const title = `E2E 行程日历 ${suffix}`;
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const startDate = toDateInput(today);
  const endDate = toDateInput(tomorrow);

  await login(page);

  await page.goto("/trips/new");
  await page.getByLabel("旅行名称 *").fill(title);
  await page.getByLabel("状态").selectOption("PLANNING");
  await page.getByLabel("出发日期").fill(startDate);
  await page.getByLabel("返回日期").fill(endDate);
  await page.getByLabel("主要目的地").fill("杭州");
  await page.getByRole("button", { name: "创建旅行" }).click();
  await expect(page).toHaveURL(/\/trips\/(?!new$)[^/]+$/);

  const tripUrl = page.url();
  await page.goto(`${tripUrl}/itinerary`);
  await page.getByTestId("generate-itinerary-days").click();
  await expect(page.getByTestId("itinerary-day-card")).toHaveCount(2);

  const firstDay = page.getByTestId("itinerary-day-card").first();
  await firstDay.locator("summary", { hasText: "添加行程项" }).click();
  await fillItineraryItem(firstDay, {
    title: "时间错误行程",
    type: "ATTRACTION",
    startTime: "10:00",
    endTime: "09:00",
    cost: "20",
  });
  await firstDay.getByRole("button", { name: "添加行程项" }).click();
  await expect(page.getByText("结束时间必须晚于开始时间。")).toBeVisible();

  const firstDayAfterValidation = page.getByTestId("itinerary-day-card").first();
  await firstDayAfterValidation
    .locator("summary", { hasText: "添加行程项" })
    .click();
  await fillItineraryItem(firstDayAfterValidation, {
    title: "西湖晨走",
    type: "ATTRACTION",
    startTime: "09:00",
    endTime: "10:00",
    cost: "20",
  });
  await firstDayAfterValidation.getByRole("button", { name: "添加行程项" }).click();
  await expect(page.getByRole("heading", { name: "西湖晨走" })).toBeVisible();

  const firstDayAfterCreate = page.getByTestId("itinerary-day-card").first();
  await firstDayAfterCreate
    .locator("summary", { hasText: "添加行程项" })
    .click();
  await fillItineraryItem(firstDayAfterCreate, {
    title: "湖边午餐",
    type: "DINING",
    startTime: "09:30",
    endTime: "10:30",
    cost: "80",
  });
  await firstDayAfterCreate.getByRole("button", { name: "添加行程项" }).click();
  await expect(page.getByText("西湖晨走 与 湖边午餐 时间重叠")).toBeVisible();

  const firstItem = page.getByTestId("itinerary-item-card").filter({
    has: page.getByRole("heading", { name: "西湖晨走" }),
  });
  await firstItem.getByText("编辑行程项").click();
  await firstItem.locator('input[name="title"]').fill("西湖晨走已编辑");
  await firstItem.locator('input[name="startTime"]').fill("11:00");
  await firstItem.locator('input[name="endTime"]').fill("12:00");
  await firstItem.getByRole("button", { name: "保存行程项" }).click();
  await expect(
    page.getByRole("heading", { name: "西湖晨走已编辑" }),
  ).toBeVisible();

  const editedItem = page.getByTestId("itinerary-item-card").filter({
    has: page.getByRole("heading", { name: "西湖晨走已编辑" }),
  });
  await editedItem.getByRole("button", { name: "下移" }).click();
  await page
    .getByTestId("itinerary-item-card")
    .filter({ has: page.getByRole("heading", { name: "西湖晨走已编辑" }) })
    .getByRole("button", { name: "上移" })
    .click();
  await expect(
    page.getByRole("heading", { name: "西湖晨走已编辑" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "按开始时间排序" }).first().click();
  await expect(page.getByText("已按开始时间排序。")).toBeVisible();

  await page
    .getByTestId("itinerary-item-card")
    .filter({ has: page.getByRole("heading", { name: "湖边午餐" }) })
    .getByRole("button", { name: "标记完成" })
    .click();
  await expect(page.getByText("已完成").first()).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${tripUrl}/today`);
  await expect(page.getByRole("heading", { name: "今日模式" })).toBeVisible();
  await expect(page.getByText("下一项")).toBeVisible();
  await expect(page.getByText("今日全部行程")).toBeVisible();
  await expect(page.getByText("酒店/住宿信息")).toBeVisible();
  await expect(page.getByText("文件票据/准备清单")).toBeVisible();
});

async function fillItineraryItem(
  container: import("@playwright/test").Locator,
  item: {
    cost: string;
    endTime: string;
    startTime: string;
    title: string;
    type: string;
  },
) {
  const form = container
    .locator("details", { hasText: "添加行程项" })
    .locator("form")
    .last();

  await form.locator('input[name="title"]').fill(item.title);
  await form.locator('select[name="type"]').selectOption(item.type);
  await form.locator('input[name="startTime"]').fill(item.startTime);
  await form.locator('input[name="endTime"]').fill(item.endTime);
  await form.locator('input[name="costEstimate"]').fill(item.cost);
  await form.locator('select[name="priority"]').selectOption("HIGH");
}

function toDateInput(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
