import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const username = process.env.INITIAL_ADMIN_USERNAME ?? "admin";
const password = process.env.INITIAL_ADMIN_PASSWORD ?? "change-me-before-use";

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe("stage 22 today execution mode", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("supports mobile execution, quick spending, offline summary, and AI draft", async ({
    context,
    page,
  }) => {
    await login(page);
    const trip = await createExecutionTrip();
    const tripUrl = `/trips/${trip.id}`;

    await page.goto(`${tripUrl}/today`);
    await expect(page.getByRole("heading", { name: trip.title })).toBeVisible();
    await expect(page.getByTestId("today-next-step")).toContainText("码头集合");

    const pierCard = page.getByTestId("today-item-card").filter({ hasText: "码头集合" });
    await pierCard.getByRole("button", { name: "完成" }).click();
    await expect(pierCard).toContainText("已完成", { timeout: 15000 });

    await page.locator('textarea[name="recordText"]').fill("临时买水");
    await page.getByTestId("today-record-amount").fill("18.5");
    await page.locator('select[name="recordCategory"]').selectOption({ label: "餐饮" });
    await page.getByTestId("today-save-quick-record").click();
    await expect(page.getByText("快速记录已保存。")).toBeVisible();
    await expect(page.getByText("CNY 18.50")).toBeVisible();

    await page.locator('textarea[name="todayChange"]').fill("下午下雨，想把户外安排延后。");
    await page.getByTestId("today-generate-ai-draft").click();
    await expect(page.getByText("AI 调整草稿已生成，原计划未被覆盖。")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("today-ai-draft-card").first()).toContainText(
      "今日调整建议",
    );

    await waitForServiceWorker(page);
    await page.getByTestId("refresh-offline-cache").click();
    await expect(page.getByText(/离线摘要已更新/)).toBeVisible();

    await context.setOffline(true);
    try {
      await page.goto(`${tripUrl}/today`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: trip.title })).toBeVisible();
      await expect(page.getByText("雨天室内备选").first()).toBeVisible();
      await expect(page.getByText("临时买水")).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });
});

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
}

async function createExecutionTrip() {
  const user = await prisma.user.findUniqueOrThrow({ where: { username } });
  const today = startOfLocalDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const title = `阶段22 今日执行 ${Date.now()}`;

  const trip = await prisma.trip.create({
    data: {
      baseCurrency: "CNY",
      budgetAmount: "3000",
      mainDestination: "杭州",
      members: {
        create: {
          canDownloadSensitiveDocuments: true,
          role: "OWNER",
          userId: user.id,
        },
      },
      startDate: today,
      endDate: tomorrow,
      status: "TRAVELING",
      title,
    },
  });
  const day = await prisma.itineraryDay.create({
    data: {
      city: "杭州",
      date: today,
      theme: "轻量执行",
      tripId: trip.id,
      weatherSummary: "多云转雨",
    },
  });

  await prisma.place.createMany({
    data: [
      {
        address: "西湖边",
        name: "湖边酒店",
        tripId: trip.id,
        type: "HOTEL",
      },
      {
        name: "雨天室内备选",
        tripId: trip.id,
        type: "ATTRACTION",
      },
    ],
  });

  await prisma.itineraryItem.createMany({
    data: [
      {
        dayId: day.id,
        endTime: addTime(today, 10, 30),
        priority: "HIGH",
        sortOrder: 1000,
        startTime: addTime(today, 9, 30),
        title: "码头集合",
        transportToNext: "步行到码头",
        tripId: trip.id,
        type: "TRANSPORT",
      },
      {
        dayId: day.id,
        endTime: addTime(today, 15, 0),
        priority: "MEDIUM",
        sortOrder: 2000,
        startTime: addTime(today, 13, 30),
        title: "雨天室内备选",
        tripId: trip.id,
        type: "ATTRACTION",
      },
    ],
  });

  await prisma.checklistItem.create({
    data: {
      category: "旅途中提醒",
      importance: "HIGH",
      title: "确认返程交通",
      tripId: trip.id,
    },
  });

  await prisma.$disconnect();
  return trip;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addTime(date: Date, hour: number, minute: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute);
}

async function waitForServiceWorker(page: Page) {
  await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) {
      throw new Error("Service Worker is unavailable.");
    }

    await navigator.serviceWorker.ready;
  });
}
