import type {
  TransportMode,
  TransportOptionStatus,
} from "@prisma/client";

import type { RouteScoreWeights } from "@/lib/route-score";

export const TRANSPORT_MODE_OPTIONS: Array<{
  value: TransportMode;
  label: string;
}> = [
  { value: "TRAIN", label: "火车" },
  { value: "FLIGHT", label: "飞机" },
  { value: "COACH", label: "大巴" },
  { value: "CAR", label: "自驾" },
  { value: "TAXI", label: "打车" },
  { value: "METRO", label: "地铁" },
  { value: "BUS", label: "公交" },
  { value: "WALK", label: "步行" },
  { value: "BIKE", label: "骑行" },
  { value: "OTHER", label: "混合" },
];

export const TRANSPORT_STATUS_OPTIONS: Array<{
  value: TransportOptionStatus;
  label: string;
  tone: string;
}> = [
  {
    value: "CANDIDATE",
    label: "候选",
    tone: "bg-[#e8f2ff] text-[#25547f]",
  },
  {
    value: "SELECTED",
    label: "已选择",
    tone: "bg-[#e8f6ef] text-[#276044]",
  },
  {
    value: "BOOKED",
    label: "已预订",
    tone: "bg-[#f0e8ff] text-[#5e3d8c]",
  },
  {
    value: "CANCELLED",
    label: "已取消",
    tone: "bg-[#eceff3] text-[#4d5964]",
  },
];

export function getTransportModeLabel(mode: TransportMode): string {
  return (
    TRANSPORT_MODE_OPTIONS.find((option) => option.value === mode)?.label ?? mode
  );
}

export function getTransportStatusLabel(
  status: TransportOptionStatus,
): string {
  return (
    TRANSPORT_STATUS_OPTIONS.find((option) => option.value === status)?.label ??
    status
  );
}

export function getTransportStatusTone(status: TransportOptionStatus): string {
  return (
    TRANSPORT_STATUS_OPTIONS.find((option) => option.value === status)?.tone ??
    "bg-[#eceff3] text-[#4d5964]"
  );
}

export function isTransportMode(value: string): value is TransportMode {
  return TRANSPORT_MODE_OPTIONS.some((option) => option.value === value);
}

export function isTransportStatus(
  value: string,
): value is TransportOptionStatus {
  return TRANSPORT_STATUS_OPTIONS.some((option) => option.value === value);
}

export function formatDateTimeValue(date: Date | null | undefined): string {
  if (!date) {
    return "未设置";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDateTimeInputValue(date: Date | null | undefined): string {
  if (!date) {
    return "";
  }

  return [
    [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-"),
    [
      String(date.getHours()).padStart(2, "0"),
      String(date.getMinutes()).padStart(2, "0"),
    ].join(":"),
  ].join("T");
}

export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) {
    return "未设置";
  }

  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;

  if (hours === 0) {
    return `${restMinutes} 分钟`;
  }

  return restMinutes === 0
    ? `${hours} 小时`
    : `${hours} 小时 ${restMinutes} 分钟`;
}

export function formatPrice(
  price: unknown,
  currency: string | null | undefined,
): string {
  if (price === null || price === undefined || price === "") {
    return "未设置";
  }

  const numericPrice = Number(price);

  if (!Number.isFinite(numericPrice)) {
    return "未设置";
  }

  return `${currency || "CNY"} ${numericPrice.toLocaleString("zh-CN", {
    maximumFractionDigits: 2,
  })}`;
}

export function parseDateTimeInput(value: string): Date | null {
  if (!value) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const date = new Date(year, month - 1, day, hour, minute);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null;
  }

  return date;
}

export function parseStoredRouteWeights(
  value: unknown,
): Partial<RouteScoreWeights> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const weights: Partial<RouteScoreWeights> = {};

  for (const key of [
    "time",
    "cost",
    "comfort",
    "transfer",
    "risk",
    "luggage",
    "flexibility",
  ] as const) {
    const weight = (value as Partial<Record<string, unknown>>)[key];

    if (typeof weight === "number" && Number.isFinite(weight)) {
      weights[key] = weight;
    }
  }

  return weights;
}
