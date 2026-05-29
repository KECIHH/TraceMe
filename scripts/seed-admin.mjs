import { randomBytes, scryptSync } from "node:crypto";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const KEY_LENGTH = 64;
const DEFAULT_ADMIN_PASSWORD = "change-me-before-use";
const MIN_INITIAL_ADMIN_PASSWORD_LENGTH = 12;
const EXAMPLE_TRIP_TITLE = "示例旅行（虚构数据）";

async function main() {
  const username = process.env.INITIAL_ADMIN_USERNAME;
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  const shouldResetPassword = process.env.RESET_ADMIN_PASSWORD === "true";
  const shouldResetAiEnabled = process.env.RESET_AI_ENABLED === "true";

  if (!username || !password) {
    throw new Error(
      "INITIAL_ADMIN_USERNAME and INITIAL_ADMIN_PASSWORD must be set before seeding.",
    );
  }
  validateSeedPassword(password);

  const existingUser = await prisma.user.findUnique({ where: { username } });

  if (existingUser) {
    await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        displayName: existingUser.displayName ?? "TraceMe Admin",
        role: "ADMIN",
        ...(shouldResetPassword ? { passwordHash: hashPassword(password) } : {}),
      },
    });
  } else {
    await prisma.user.create({
      data: {
        username,
        passwordHash: hashPassword(password),
        displayName: "TraceMe Admin",
        role: "ADMIN",
      },
    });
  }

  await prisma.appSetting.upsert({
    where: { key: "app.name" },
    update: { value: "TraceMe" },
    create: { key: "app.name", value: "TraceMe" },
  });

  const aiEnabledSetting = await prisma.appSetting.findUnique({
    where: { key: "ai.enabled" },
  });

  if (shouldResetAiEnabled && aiEnabledSetting) {
    await prisma.appSetting.update({
      where: { key: "ai.enabled" },
      data: { value: "true" },
    });
  } else if (!aiEnabledSetting) {
    await prisma.appSetting.create({
      data: { key: "ai.enabled", value: "true" },
    });
  }

  if (process.env.SEED_EXAMPLE_TRIP !== "false") {
    await createExampleTrip();
  }

  console.log(`Seed complete: admin user "${username}" is ready.`);
}

async function createExampleTrip() {
  const existingTrip = await prisma.trip.findFirst({
    select: { id: true },
    where: { title: EXAMPLE_TRIP_TITLE },
  });

  if (existingTrip) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    const trip = await tx.trip.create({
      data: {
        title: EXAMPLE_TRIP_TITLE,
        description:
          "这是一条用于体验 TraceMe 功能的虚构旅行，不包含真实个人信息、手机号、证件号、订单或 API Key。",
        status: "PLANNING",
        startDate: new Date("2026-10-01T00:00:00.000Z"),
        endDate: new Date("2026-10-03T00:00:00.000Z"),
        homeCity: "虚构出发城",
        mainDestination: "蓝湾市",
        baseCurrency: "CNY",
        budgetAmount: "6800",
      },
    });

    const destination = await tx.destination.create({
      data: {
        tripId: trip.id,
        name: "蓝湾市",
        country: "示例国",
        region: "海岸省",
        timezone: "Asia/Shanghai",
        arrivalDate: new Date("2026-10-01T00:00:00.000Z"),
        departureDate: new Date("2026-10-03T00:00:00.000Z"),
        notes: "虚构目的地，仅用于演示。",
      },
    });

    const lighthouse = await tx.place.create({
      data: {
        tripId: trip.id,
        destinationId: destination.id,
        name: "星灯岬灯塔",
        type: "ATTRACTION",
        address: "蓝湾市观海路 1 号（虚构地址）",
        estimatedDurationMin: 90,
        estimatedCost: "60",
        priority: "HIGH",
        tags: ["示例", "日落", "虚构"],
        notes: "适合作为第一天下午的主景点。",
      },
    });

    const noodleHouse = await tx.place.create({
      data: {
        tripId: trip.id,
        destinationId: destination.id,
        name: "月桥面馆",
        type: "RESTAURANT",
        address: "蓝湾市月桥街 8 号（虚构地址）",
        estimatedCost: "88",
        priority: "MEDIUM",
        tags: ["示例", "美食", "虚构"],
        notes: "无真实联系方式和订单信息。",
        foodDetail: {
          create: {
            recommendedDishes: ["海风汤面", "青柠冰茶"],
            averageCost: "88",
            foodStatus: "WANT_TO_TRY",
            reservationNeeded: false,
            notes: "菜品和店铺均为虚构。",
          },
        },
      },
    });

    const harborStay = await tx.place.create({
      data: {
        tripId: trip.id,
        destinationId: destination.id,
        name: "晨港旅舍",
        type: "HOTEL",
        address: "蓝湾市晨港路 18 号（虚构地址）",
        estimatedCost: "980",
        priority: "HIGH",
        tags: ["示例", "住宿", "虚构"],
        notes: "不含真实订单号。",
        stayDetail: {
          create: {
            checkInDate: new Date("2026-10-01T00:00:00.000Z"),
            checkOutDate: new Date("2026-10-03T00:00:00.000Z"),
            bookingStatus: "RESERVED",
            totalCost: "1960",
            breakfastIncluded: true,
            luggageStorage: true,
            cancellationPolicy: "示例政策：出发前 3 天可免费取消。",
            bookingReference: "DEMO-BOOKING-0001",
            notes: "演示订单号，不对应真实预订。",
          },
        },
      },
    });

    const firstDay = await tx.itineraryDay.create({
      data: {
        tripId: trip.id,
        date: new Date("2026-10-01T00:00:00.000Z"),
        city: "蓝湾市",
        theme: "抵达与海边散步",
        weatherSummary: "示例天气：多云。",
      },
    });

    await tx.itineraryDay.create({
      data: {
        tripId: trip.id,
        date: new Date("2026-10-02T00:00:00.000Z"),
        city: "蓝湾市",
        theme: "灯塔与老街",
        weatherSummary: "示例天气：晴。",
      },
    });

    await tx.itineraryItem.createMany({
      data: [
        {
          tripId: trip.id,
          dayId: firstDay.id,
          placeId: harborStay.id,
          title: "抵达并办理入住",
          type: "LODGING",
          startTime: new Date("2026-10-01T14:00:00.000Z"),
          endTime: new Date("2026-10-01T15:00:00.000Z"),
          priority: "HIGH",
          sortOrder: 1000,
        },
        {
          tripId: trip.id,
          dayId: firstDay.id,
          placeId: lighthouse.id,
          title: "星灯岬灯塔看日落",
          type: "ATTRACTION",
          startTime: new Date("2026-10-01T16:30:00.000Z"),
          endTime: new Date("2026-10-01T18:00:00.000Z"),
          costEstimate: "60",
          priority: "HIGH",
          sortOrder: 2000,
        },
        {
          tripId: trip.id,
          dayId: firstDay.id,
          placeId: noodleHouse.id,
          title: "月桥面馆晚餐",
          type: "DINING",
          startTime: new Date("2026-10-01T18:30:00.000Z"),
          endTime: new Date("2026-10-01T19:30:00.000Z"),
          costEstimate: "88",
          priority: "MEDIUM",
          sortOrder: 3000,
        },
      ],
    });

    await tx.checklistItem.createMany({
      data: [
        {
          tripId: trip.id,
          category: "证件",
          title: "检查虚构示例证件夹",
          importance: "HIGH",
          notes: "演示项，不包含真实证件号。",
        },
        {
          tripId: trip.id,
          category: "电子设备",
          title: "充电器与移动电源",
          importance: "MEDIUM",
        },
      ],
    });

    const routePlan = await tx.routePlan.create({
      data: {
        tripId: trip.id,
        title: "机场到晨港旅舍",
        fromName: "蓝湾机场",
        toName: "晨港旅舍",
        departDate: new Date("2026-10-01T12:00:00.000Z"),
        weights: { cost: 0.25, duration: 0.35, comfort: 0.25, risk: 0.15 },
        notes: "虚构路线，用于演示交通评分。",
      },
    });

    const selectedTransport = await tx.transportOption.create({
      data: {
        tripId: trip.id,
        routePlanId: routePlan.id,
        fromName: "蓝湾机场",
        toName: "晨港旅舍",
        mode: "METRO",
        provider: "蓝湾地铁（虚构）",
        departTime: new Date("2026-10-01T12:30:00.000Z"),
        arriveTime: new Date("2026-10-01T13:20:00.000Z"),
        doorToDoorMinutes: 70,
        price: "28",
        currency: "CNY",
        transferCount: 1,
        comfortScore: 7,
        riskScore: 2,
        luggageFriendlyScore: 6,
        flexibilityScore: 8,
        status: "SELECTED",
        notes: "演示交通方案。",
      },
    });

    await tx.transportOption.create({
      data: {
        tripId: trip.id,
        routePlanId: routePlan.id,
        fromName: "蓝湾机场",
        toName: "晨港旅舍",
        mode: "TAXI",
        provider: "示例出租车",
        doorToDoorMinutes: 45,
        price: "138",
        currency: "CNY",
        transferCount: 0,
        comfortScore: 8,
        riskScore: 3,
        luggageFriendlyScore: 9,
        flexibilityScore: 7,
        status: "CANDIDATE",
        notes: "演示备选方案。",
      },
    });

    await tx.routePlan.update({
      where: { id: routePlan.id },
      data: { selectedOptionId: selectedTransport.id },
    });

    await tx.categoryBudget.createMany({
      data: [
        { tripId: trip.id, category: "交通", amount: "1200" },
        { tripId: trip.id, category: "住宿", amount: "2200" },
        { tripId: trip.id, category: "餐饮", amount: "1000" },
      ],
    });

    await tx.expense.createMany({
      data: [
        {
          tripId: trip.id,
          category: "住宿",
          title: "晨港旅舍预估费用",
          amount: "1960",
          currency: "CNY",
          paidAt: new Date("2026-09-20T00:00:00.000Z"),
          relatedPlaceId: harborStay.id,
          notes: "示例支出，不对应真实订单。",
        },
        {
          tripId: trip.id,
          category: "餐饮",
          title: "月桥面馆晚餐预算",
          amount: "88",
          currency: "CNY",
          relatedPlaceId: noodleHouse.id,
          notes: "示例支出。",
        },
      ],
    });

    await tx.note.create({
      data: {
        tripId: trip.id,
        title: "示例旅行说明",
        content:
          "这条旅行完全虚构，用来演示目的地、地点、行程、清单、交通、预算和笔记功能。请替换为自己的真实资料后再使用。",
        tags: ["示例", "虚构数据"],
      },
    });
  });
}

function validateSeedPassword(password) {
  if (password.length < MIN_INITIAL_ADMIN_PASSWORD_LENGTH) {
    throw new Error(
      `INITIAL_ADMIN_PASSWORD must be at least ${MIN_INITIAL_ADMIN_PASSWORD_LENGTH} characters.`,
    );
  }

  if (
    process.env.NODE_ENV === "production" &&
    password === DEFAULT_ADMIN_PASSWORD
  ) {
    throw new Error("INITIAL_ADMIN_PASSWORD must not use the example value.");
  }
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, KEY_LENGTH).toString("hex");

  return `scrypt:${salt}:${derivedKey}`;
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
