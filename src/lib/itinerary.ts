import type {
  BookingStatus,
  ItineraryItemStatus,
  ItineraryItemType,
  Priority,
} from "@prisma/client";

export type ItineraryComparableItem = {
  id: string;
  title: string;
  startTime: Date | null;
  endTime: Date | null;
  status?: ItineraryItemStatus;
};

export type ItineraryAlertType =
  | "missing-time"
  | "time-conflict"
  | "too-dense"
  | "tight-transfer";

export type ItineraryAlert = {
  type: ItineraryAlertType;
  message: string;
  itemIds: string[];
};

export const ITINERARY_ITEM_TYPE_OPTIONS: Array<{
  value: ItineraryItemType;
  label: string;
}> = [
  { value: "ATTRACTION", label: "景点" },
  { value: "DINING", label: "餐饮" },
  { value: "TRANSPORT", label: "交通" },
  { value: "LODGING", label: "住宿" },
  { value: "SHOPPING", label: "购物" },
  { value: "REST", label: "休息" },
  { value: "CUSTOM", label: "自定义" },
];

export const BOOKING_STATUS_OPTIONS: Array<{
  value: BookingStatus;
  label: string;
}> = [
  { value: "NOT_REQUIRED", label: "无需预约" },
  { value: "TODO", label: "需要预约" },
  { value: "BOOKED", label: "已预约" },
];

export const ITINERARY_PRIORITY_OPTIONS: Array<{
  value: Priority;
  label: string;
}> = [
  { value: "HIGH", label: "必去" },
  { value: "MEDIUM", label: "推荐" },
  { value: "LOW", label: "可选" },
];

export const ITINERARY_STATUS_OPTIONS: Array<{
  value: ItineraryItemStatus;
  label: string;
}> = [
  { value: "PLANNED", label: "计划中" },
  { value: "DONE", label: "已完成" },
  { value: "SKIPPED", label: "已跳过" },
];

export function getItineraryItemTypeLabel(type: ItineraryItemType): string {
  return (
    ITINERARY_ITEM_TYPE_OPTIONS.find((option) => option.value === type)?.label ??
    type
  );
}

export function getBookingStatusLabel(status: BookingStatus): string {
  return (
    BOOKING_STATUS_OPTIONS.find((option) => option.value === status)?.label ??
    status
  );
}

export function getItineraryPriorityLabel(priority: Priority): string {
  return (
    ITINERARY_PRIORITY_OPTIONS.find((option) => option.value === priority)
      ?.label ?? priority
  );
}

export function getItineraryStatusLabel(
  status: ItineraryItemStatus,
): string {
  return (
    ITINERARY_STATUS_OPTIONS.find((option) => option.value === status)?.label ??
    status
  );
}

export function isItineraryItemType(value: string): value is ItineraryItemType {
  return ITINERARY_ITEM_TYPE_OPTIONS.some((option) => option.value === value);
}

export function isBookingStatus(value: string): value is BookingStatus {
  return BOOKING_STATUS_OPTIONS.some((option) => option.value === value);
}

export function isItineraryPriority(value: string): value is Priority {
  return ITINERARY_PRIORITY_OPTIONS.some((option) => option.value === value);
}

export function isItineraryStatus(
  value: string,
): value is ItineraryItemStatus {
  return ITINERARY_STATUS_OPTIONS.some((option) => option.value === value);
}

export function generateDateRange(startDate: Date, endDate: Date): Date[] {
  const start = startOfLocalDay(startDate);
  const end = startOfLocalDay(endDate);

  if (end < start) {
    return [];
  }

  const dates: Date[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

export function dateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function formatDateTitle(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}

export function formatDateInputValue(date: Date | null | undefined): string {
  return date ? dateKey(date) : "";
}

export function formatTimeInputValue(date: Date | null | undefined): string {
  if (!date) {
    return "";
  }

  return [
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
  ].join(":");
}

export function formatTimeRange(
  startTime: Date | null,
  endTime: Date | null,
): string {
  if (!startTime || !endTime) {
    return "未设置时间";
  }

  return `${formatTimeInputValue(startTime)} - ${formatTimeInputValue(endTime)}`;
}

export function isValidTimeOrder(
  startTime: Date | null,
  endTime: Date | null,
): boolean {
  return !startTime || !endTime || endTime > startTime;
}

export function combineDateAndTime(
  date: Date,
  timeValue: string,
): Date | null {
  const match = /^(\d{2}):(\d{2})$/.exec(timeValue);

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) {
    return null;
  }

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hours,
    minutes,
  );
}

export function analyzeItineraryDay(
  items: ItineraryComparableItem[],
): ItineraryAlert[] {
  const alerts: ItineraryAlert[] = [];

  for (const item of items) {
    if (!item.startTime || !item.endTime) {
      alerts.push({
        type: "missing-time",
        message: `${item.title} 未设置时间`,
        itemIds: [item.id],
      });
    }
  }

  if (items.length > 6) {
    alerts.push({
      type: "too-dense",
      message: `当天有 ${items.length} 个行程项，可能过密`,
      itemIds: items.map((item) => item.id),
    });
  }

  const timedItems = items
    .filter(
      (
        item,
      ): item is ItineraryComparableItem & {
        startTime: Date;
        endTime: Date;
      } => Boolean(item.startTime && item.endTime),
    )
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  for (let index = 0; index < timedItems.length; index += 1) {
    const current = timedItems[index];

    if (!isValidTimeOrder(current.startTime, current.endTime)) {
      alerts.push({
        type: "time-conflict",
        message: `${current.title} 的结束时间不晚于开始时间`,
        itemIds: [current.id],
      });
    }

    const next = timedItems[index + 1];

    if (!next) {
      continue;
    }

    if (current.endTime > next.startTime) {
      alerts.push({
        type: "time-conflict",
        message: `${current.title} 与 ${next.title} 时间重叠`,
        itemIds: [current.id, next.id],
      });
      continue;
    }

    const gapMinutes =
      (next.startTime.getTime() - current.endTime.getTime()) / 60_000;

    if (gapMinutes < 15) {
      alerts.push({
        type: "tight-transfer",
        message: `${current.title} 到 ${next.title} 间隔少于 15 分钟`,
        itemIds: [current.id, next.id],
      });
    }
  }

  return alerts;
}

export function getTodayDateMatch(
  today: Date,
  days: Array<{ id: string; date: Date }>,
): { id: string; date: Date } | null {
  const todayKey = dateKey(today);
  return days.find((day) => dateKey(day.date) === todayKey) ?? null;
}

export function isDateInRange(
  date: Date,
  startDate: Date | null | undefined,
  endDate: Date | null | undefined,
): boolean {
  if (!startDate || !endDate) {
    return false;
  }

  const target = startOfLocalDay(date).getTime();
  return (
    target >= startOfLocalDay(startDate).getTime() &&
    target <= startOfLocalDay(endDate).getTime()
  );
}

export function getNearestItineraryDay(
  today: Date,
  days: Array<{ id: string; date: Date }>,
): { id: string; date: Date } | null {
  if (days.length === 0) {
    return null;
  }

  const target = startOfLocalDay(today).getTime();

  return [...days].sort(
    (a, b) =>
      Math.abs(startOfLocalDay(a.date).getTime() - target) -
      Math.abs(startOfLocalDay(b.date).getTime() - target),
  )[0];
}

export function getNextItineraryItem<T extends ItineraryComparableItem>(
  now: Date,
  items: T[],
): T | null {
  const upcoming = items
    .filter(
      (item) =>
        item.status !== "DONE" &&
        item.status !== "SKIPPED" &&
        item.startTime &&
        item.startTime.getTime() >= now.getTime(),
    )
    .sort(
      (a, b) =>
        (a.startTime?.getTime() ?? Number.POSITIVE_INFINITY) -
        (b.startTime?.getTime() ?? Number.POSITIVE_INFINITY),
    );

  return upcoming[0] ?? null;
}
