"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { requireTripAccess } from "@/lib/collaboration";
import {
  combineDateAndTime,
  dateKey,
  generateDateRange,
  isBookingStatus,
  isItineraryItemType,
  isItineraryPriority,
  isItineraryStatus,
  isValidTimeOrder,
  startOfLocalDay,
} from "@/lib/itinerary";
import { prisma } from "@/lib/prisma";

type ItineraryRedirectTarget = "itinerary" | "today";

export async function generateItineraryDaysAction(tripId: string) {
  const trip = await requireTrip(tripId);
  const redirectPath = itineraryPath(tripId);

  if (!trip.startDate || !trip.endDate) {
    redirectWithMessage(
      redirectPath,
      "error",
      "请先设置旅行开始日期和结束日期。",
    );
  }

  const createdCount = await createMissingDays(
    tripId,
    trip.startDate,
    trip.endDate,
  );

  revalidateTripItinerary(tripId);
  redirectWithMessage(
    redirectPath,
    "message",
    createdCount > 0
      ? `已生成 ${createdCount} 天行程日期。`
      : "行程日期已存在，无需重复生成。",
  );
}

export async function syncItineraryDaysAction(tripId: string) {
  const trip = await requireTrip(tripId);
  const redirectPath = itineraryPath(tripId);

  if (!trip.startDate || !trip.endDate) {
    redirectWithMessage(
      redirectPath,
      "error",
      "请先设置旅行开始日期和结束日期。",
    );
  }

  const createdCount = await createMissingDays(
    tripId,
    trip.startDate,
    trip.endDate,
  );
  const outOfRangeCount = await countOutOfRangeDays(
    tripId,
    trip.startDate,
    trip.endDate,
  );

  revalidateTripItinerary(tripId);
  redirectWithMessage(
    redirectPath,
    "message",
    [
      createdCount > 0
        ? `已补齐 ${createdCount} 个缺失日期`
        : "没有缺失日期",
      outOfRangeCount > 0
        ? `${outOfRangeCount} 个既有日期超出当前旅行范围，已保留`
        : "没有超出范围的既有日期",
    ].join("；") + "。",
  );
}

export async function updateItineraryDayAction(
  tripId: string,
  dayId: string,
  formData: FormData,
) {
  await requireTrip(tripId);

  await runMutationOrRedirect(
    () =>
      prisma.itineraryDay.update({
        where: { id: dayId, tripId },
        data: {
          city: optionalText(formData, "city"),
          theme: optionalText(formData, "theme"),
          weatherSummary: optionalText(formData, "weatherSummary"),
          notes: optionalText(formData, "notes"),
        },
      }),
    itineraryPath(tripId),
    "行程日期不存在或已被删除。",
  );

  revalidateTripItinerary(tripId);
  redirectWithMessage(
    `${itineraryPath(tripId)}#day-${dayId}`,
    "message",
    "当天信息已保存。",
  );
}

export async function createItineraryItemAction(
  tripId: string,
  dayId: string,
  formData: FormData,
) {
  await requireTrip(tripId);
  const day = await requireDay(tripId, dayId);
  const redirectPath = `${itineraryPath(tripId)}#day-${dayId}`;
  const validationError = await validateItemForm(tripId, day.date, formData);

  if (validationError) {
    redirectWithMessage(redirectPath, "error", validationError);
  }

  const lastItem = await prisma.itineraryItem.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
    where: { dayId, tripId },
  });

  await prisma.itineraryItem.create({
    data: {
      ...buildItemData(tripId, dayId, day.date, formData),
      sortOrder: (lastItem?.sortOrder ?? 0) + 1000,
    },
  });

  revalidateTripItinerary(tripId);
  redirectWithMessage(redirectPath, "message", "行程项已添加。");
}

export async function updateItineraryItemAction(
  tripId: string,
  itemId: string,
  formData: FormData,
) {
  await requireTrip(tripId);
  const existingItem = await prisma.itineraryItem.findFirst({
    include: { day: true },
    where: { id: itemId, tripId },
  });

  if (!existingItem) {
    redirectWithMessage(itineraryPath(tripId), "error", "行程项不存在或已删除。");
  }

  const redirectPath = `${itineraryPath(tripId)}#item-${itemId}`;
  const validationError = await validateItemForm(
    tripId,
    existingItem.day.date,
    formData,
  );

  if (validationError) {
    redirectWithMessage(redirectPath, "error", validationError);
  }

  await prisma.itineraryItem.update({
    where: { id: itemId, tripId },
    data: buildItemData(tripId, existingItem.dayId, existingItem.day.date, formData),
  });

  revalidateTripItinerary(tripId);
  redirectWithMessage(redirectPath, "message", "行程项已更新。");
}

export async function deleteItineraryItemAction(
  tripId: string,
  itemId: string,
) {
  await requireTrip(tripId);
  const existingItem = await prisma.itineraryItem.findFirst({
    select: { dayId: true },
    where: { id: itemId, tripId },
  });

  if (!existingItem) {
    redirectWithMessage(itineraryPath(tripId), "error", "行程项不存在或已删除。");
  }

  await prisma.itineraryItem.delete({ where: { id: itemId, tripId } });
  await normalizeSortOrder(tripId, existingItem.dayId);

  revalidateTripItinerary(tripId);
  redirectWithMessage(
    `${itineraryPath(tripId)}#day-${existingItem.dayId}`,
    "message",
    "行程项已删除。",
  );
}

export async function moveItineraryItemAction(
  tripId: string,
  itemId: string,
  direction: "up" | "down",
) {
  await requireTrip(tripId);
  const currentItem = await prisma.itineraryItem.findFirst({
    where: { id: itemId, tripId },
  });

  if (!currentItem) {
    redirectWithMessage(itineraryPath(tripId), "error", "行程项不存在或已删除。");
  }

  const items = await prisma.itineraryItem.findMany({
    orderBy: [{ sortOrder: "asc" }, { startTime: "asc" }, { createdAt: "asc" }],
    where: { dayId: currentItem.dayId, tripId },
  });
  const currentIndex = items.findIndex((item) => item.id === itemId);
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

  if (targetIndex < 0 || targetIndex >= items.length) {
    redirect(`${itineraryPath(tripId)}#item-${itemId}`);
  }

  const targetItem = items[targetIndex];

  await prisma.$transaction([
    prisma.itineraryItem.update({
      where: { id: currentItem.id, tripId },
      data: { sortOrder: targetItem.sortOrder },
    }),
    prisma.itineraryItem.update({
      where: { id: targetItem.id, tripId },
      data: { sortOrder: currentItem.sortOrder },
    }),
  ]);
  await normalizeSortOrder(tripId, currentItem.dayId);

  revalidateTripItinerary(tripId);
  redirect(`${itineraryPath(tripId)}#item-${itemId}`);
}

export async function reorderItineraryItemsAction(
  tripId: string,
  dayId: string,
  formData: FormData,
) {
  await requireTrip(tripId);
  await requireDay(tripId, dayId);
  const orderedIds = formValue(formData, "orderedItemIds")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (orderedIds.length === 0) {
    redirect(`${itineraryPath(tripId)}#day-${dayId}`);
  }

  const existingItems = await prisma.itineraryItem.findMany({
    select: { id: true },
    where: { dayId, tripId },
  });
  const existingIds = new Set(existingItems.map((item) => item.id));
  const isValidOrder =
    orderedIds.length === existingItems.length &&
    orderedIds.every((id) => existingIds.has(id)) &&
    new Set(orderedIds).size === orderedIds.length;

  if (!isValidOrder) {
    redirectWithMessage(
      `${itineraryPath(tripId)}#day-${dayId}`,
      "error",
      "拖拽排序数据无效，请刷新后重试。",
    );
  }

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.itineraryItem.update({
        where: { id, tripId },
        data: { sortOrder: (index + 1) * 1000 },
      }),
    ),
  );

  revalidateTripItinerary(tripId);
  redirectWithMessage(
    `${itineraryPath(tripId)}#day-${dayId}`,
    "message",
    "拖拽排序已保存。",
  );
}

export async function sortItineraryDayByStartTimeAction(
  tripId: string,
  dayId: string,
) {
  await requireTrip(tripId);
  await requireDay(tripId, dayId);

  const items = await prisma.itineraryItem.findMany({
    orderBy: [{ startTime: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    where: { dayId, tripId },
  });

  await prisma.$transaction(
    items.map((item, index) =>
      prisma.itineraryItem.update({
        where: { id: item.id, tripId },
        data: { sortOrder: (index + 1) * 1000 },
      }),
    ),
  );

  revalidateTripItinerary(tripId);
  redirectWithMessage(
    `${itineraryPath(tripId)}#day-${dayId}`,
    "message",
    "已按开始时间排序。",
  );
}

export async function updateItineraryItemStatusAction(
  tripId: string,
  itemId: string,
  status: string,
  target: ItineraryRedirectTarget,
) {
  await requireTrip(tripId);

  if (!isItineraryStatus(status)) {
    redirectWithMessage(targetPath(tripId, target), "error", "行程状态无效。");
  }

  await runMutationOrRedirect(
    () =>
      prisma.itineraryItem.update({
        where: { id: itemId, tripId },
        data: { status },
      }),
    targetPath(tripId, target),
    "行程项不存在或已删除。",
  );

  revalidateTripItinerary(tripId);
  redirect(targetPath(tripId, target));
}

async function createMissingDays(
  tripId: string,
  startDate: Date,
  endDate: Date,
): Promise<number> {
  const existingDays = await prisma.itineraryDay.findMany({
    select: { date: true },
    where: { tripId },
  });
  const existingDateKeys = new Set(existingDays.map((day) => dateKey(day.date)));
  const missingDates = generateDateRange(startDate, endDate).filter(
    (date) => !existingDateKeys.has(dateKey(date)),
  );

  if (missingDates.length > 0) {
    await prisma.itineraryDay.createMany({
      data: missingDates.map((date) => ({
        tripId,
        date: startOfLocalDay(date),
      })),
    });
  }

  return missingDates.length;
}

async function countOutOfRangeDays(
  tripId: string,
  startDate: Date,
  endDate: Date,
): Promise<number> {
  const start = startOfLocalDay(startDate);
  const end = startOfLocalDay(endDate);

  return prisma.itineraryDay.count({
    where: {
      tripId,
      OR: [{ date: { lt: start } }, { date: { gt: end } }],
    },
  });
}

async function requireTrip(tripId: string) {
  await requireTripAccess(tripId, "edit");
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });

  if (!trip) {
    notFound();
  }

  return trip;
}

async function requireDay(tripId: string, dayId: string) {
  const day = await prisma.itineraryDay.findFirst({
    where: { id: dayId, tripId },
  });

  if (!day) {
    redirectWithMessage(itineraryPath(tripId), "error", "行程日期不存在。");
  }

  return day;
}

async function validateItemForm(
  tripId: string,
  dayDate: Date,
  formData: FormData,
): Promise<string | null> {
  if (!requiredText(formData, "title")) {
    return "请填写行程标题。";
  }

  const costEstimate = formValue(formData, "costEstimate").trim();

  if (costEstimate && (!Number.isFinite(Number(costEstimate)) || Number(costEstimate) < 0)) {
    return "预估费用不能小于 0。";
  }

  const durationMin = formValue(formData, "durationMin").trim();

  if (durationMin && (!Number.isInteger(Number(durationMin)) || Number(durationMin) < 0)) {
    return "预计持续时间必须是大于等于 0 的整数。";
  }

  const sortOrder = formValue(formData, "sortOrder").trim();

  if (sortOrder && !Number.isInteger(Number(sortOrder))) {
    return "排序必须是整数。";
  }

  const startTime = optionalDateTime(dayDate, formData, "startTime");
  const endTime = optionalDateTime(dayDate, formData, "endTime");

  if (formValue(formData, "startTime") && !startTime) {
    return "开始时间无效。";
  }

  if (formValue(formData, "endTime") && !endTime) {
    return "结束时间无效。";
  }

  if (!isValidTimeOrder(startTime, endTime)) {
    return "结束时间必须晚于开始时间。";
  }

  const placeId = optionalText(formData, "placeId");

  if (placeId) {
    const place = await prisma.place.findFirst({
      select: { id: true },
      where: { id: placeId, tripId },
    });

    if (!place) {
      return "关联地点不属于当前旅行。";
    }
  }

  return null;
}

function buildItemData(
  tripId: string,
  dayId: string,
  dayDate: Date,
  formData: FormData,
) {
  const type = formValue(formData, "type");
  const bookingStatus = formValue(formData, "bookingStatus");
  const priority = formValue(formData, "priority");
  const status = formValue(formData, "status");
  const parsedSortOrder = optionalInteger(formData, "sortOrder");

  return {
    tripId,
    dayId,
    placeId: optionalText(formData, "placeId"),
    title: requiredText(formData, "title"),
    type: isItineraryItemType(type) ? type : "CUSTOM",
    startTime: optionalDateTime(dayDate, formData, "startTime"),
    endTime: optionalDateTime(dayDate, formData, "endTime"),
    durationMin: optionalInteger(formData, "durationMin"),
    costEstimate: optionalText(formData, "costEstimate"),
    bookingStatus: isBookingStatus(bookingStatus) ? bookingStatus : "TODO",
    priority: isItineraryPriority(priority) ? priority : "MEDIUM",
    status: isItineraryStatus(status) ? status : "PLANNED",
    transportToNext: optionalText(formData, "transportToNext"),
    notes: optionalText(formData, "notes"),
    ...(parsedSortOrder !== null ? { sortOrder: parsedSortOrder } : {}),
  };
}

async function normalizeSortOrder(tripId: string, dayId: string) {
  const items = await prisma.itineraryItem.findMany({
    orderBy: [{ sortOrder: "asc" }, { startTime: "asc" }, { createdAt: "asc" }],
    select: { id: true },
    where: { dayId, tripId },
  });

  await prisma.$transaction(
    items.map((item, index) =>
      prisma.itineraryItem.update({
        where: { id: item.id, tripId },
        data: { sortOrder: (index + 1) * 1000 },
      }),
    ),
  );
}

function optionalDateTime(
  date: Date,
  formData: FormData,
  key: string,
): Date | null {
  const value = formValue(formData, key).trim();
  return value ? combineDateAndTime(date, value) : null;
}

function requiredText(formData: FormData, key: string): string {
  return formValue(formData, key).trim();
}

function optionalText(formData: FormData, key: string): string | null {
  const value = requiredText(formData, key);
  return value ? value : null;
}

function optionalInteger(formData: FormData, key: string): number | null {
  const value = requiredText(formData, key);

  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function formValue(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

function itineraryPath(tripId: string): string {
  return `/trips/${tripId}/itinerary`;
}

function todayPath(tripId: string): string {
  return `/trips/${tripId}/today`;
}

function targetPath(tripId: string, target: ItineraryRedirectTarget): string {
  return target === "today" ? todayPath(tripId) : itineraryPath(tripId);
}

function redirectWithMessage(
  path: string,
  key: "error" | "message",
  message: string,
): never {
  const [pathname, hash] = path.split("#");
  redirect(
    `${pathname}?${key}=${encodeURIComponent(message)}${hash ? `#${hash}` : ""}`,
  );
}

async function runMutationOrRedirect<T>(
  mutation: () => Promise<T>,
  redirectPath: string,
  message: string,
): Promise<T> {
  try {
    return await mutation();
  } catch (error) {
    if (isPrismaNotFoundError(error)) {
      redirectWithMessage(redirectPath, "error", message);
    }

    throw error;
  }
}

function isPrismaNotFoundError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  );
}

function revalidateTripItinerary(tripId: string) {
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/itinerary`);
  revalidatePath(`/trips/${tripId}/today`);
}
