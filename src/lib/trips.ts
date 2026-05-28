import type { TripStatus } from "@prisma/client";

export const TRIP_STATUS_OPTIONS: Array<{
  value: TripStatus;
  label: string;
  tone: string;
}> = [
  { value: "INSPIRATION", label: "灵感阶段", tone: "bg-[#fff7d6] text-[#6d5412]" },
  { value: "PLANNING", label: "规划中", tone: "bg-[#e8f2ff] text-[#25547f]" },
  { value: "BOOKED", label: "已预订", tone: "bg-[#e8f6ef] text-[#276044]" },
  {
    value: "DEPARTING_SOON",
    label: "即将出发",
    tone: "bg-[#fff0e5] text-[#8a4516]",
  },
  { value: "TRAVELING", label: "旅行中", tone: "bg-[#e7f5f6] text-[#245d62]" },
  { value: "COMPLETED", label: "已结束", tone: "bg-[#eceff3] text-[#4d5964]" },
  { value: "ARCHIVED", label: "已归档", tone: "bg-[#f1e8f5] text-[#6a4078]" },
];

export type TripFormValues = {
  title: string;
  description: string;
  status: string;
  startDate: string;
  endDate: string;
  homeCity: string;
  mainDestination: string;
  baseCurrency: string;
  budgetAmount: string;
  coverImage: string;
};

export type TripFormErrors = Partial<Record<keyof TripFormValues, string>>;
export type ValidTripFormValues = TripFormValues & { status: TripStatus };

export type TripFormValidationResult =
  | { ok: true; values: ValidTripFormValues }
  | { ok: false; values: TripFormValues; errors: TripFormErrors };

export function getTripStatusLabel(status: TripStatus): string {
  return (
    TRIP_STATUS_OPTIONS.find((option) => option.value === status)?.label ??
    status
  );
}

export function getTripStatusTone(status: TripStatus): string {
  return (
    TRIP_STATUS_OPTIONS.find((option) => option.value === status)?.tone ??
    "bg-[#eceff3] text-[#4d5964]"
  );
}

export function isTripStatus(value: string): value is TripStatus {
  return TRIP_STATUS_OPTIONS.some((option) => option.value === value);
}

export function validateTripFormValues(
  values: TripFormValues,
): TripFormValidationResult {
  const errors: TripFormErrors = {};

  if (!values.title.trim()) {
    errors.title = "请填写旅行名称。";
  }

  const status = values.status;

  if (!isTripStatus(status)) {
    errors.status = "请选择有效的旅行状态。";
  }

  const start = values.startDate ? parseDateInput(values.startDate) : null;
  const end = values.endDate ? parseDateInput(values.endDate) : null;

  if (values.startDate && !start) {
    errors.startDate = "请输入有效的出发日期。";
  }

  if (values.endDate && !end) {
    errors.endDate = "请输入有效的返回日期。";
  }

  if (start && end) {
    if (end.getTime() < start.getTime()) {
      errors.endDate = "返回日期不能早于出发日期。";
    }
  }

  if (values.budgetAmount.trim()) {
    const budget = Number(values.budgetAmount);

    if (!Number.isFinite(budget) || budget < 0) {
      errors.budgetAmount = "总预算不能小于 0。";
    }
  }

  if (!isValidCurrencyCode(values.baseCurrency)) {
    errors.baseCurrency = "默认货币必须是 3 位字母代码，例如 CNY。";
  }

  if (values.coverImage.trim() && !isValidHttpUrl(values.coverImage)) {
    errors.coverImage = "封面图 URL 必须是有效的 http 或 https 地址。";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, values, errors };
  }

  if (!isTripStatus(status)) {
    return {
      ok: false,
      values,
      errors: { status: "请选择有效的旅行状态。" },
    };
  }

  return { ok: true, values: { ...values, status } };
}

export function formDataToTripValues(formData: FormData): TripFormValues {
  const status = String(formData.get("status") ?? "INSPIRATION");

  return {
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    status,
    startDate: String(formData.get("startDate") ?? ""),
    endDate: String(formData.get("endDate") ?? ""),
    homeCity: String(formData.get("homeCity") ?? ""),
    mainDestination: String(formData.get("mainDestination") ?? ""),
    baseCurrency: String(formData.get("baseCurrency") ?? "CNY") || "CNY",
    budgetAmount: String(formData.get("budgetAmount") ?? ""),
    coverImage: String(formData.get("coverImage") ?? ""),
  };
}

export function parseDateInput(value: string): Date | null {
  if (!value) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function toDateInputValue(date: Date | null | undefined): string {
  if (!date) {
    return "";
  }

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function formatTripDate(date: Date | null | undefined): string {
  if (!date) {
    return "未设置";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatTripDateRange(
  startDate: Date | null | undefined,
  endDate: Date | null | undefined,
): string {
  if (!startDate && !endDate) {
    return "日期待定";
  }

  if (startDate && endDate) {
    return `${formatTripDate(startDate)} - ${formatTripDate(endDate)}`;
  }

  return startDate
    ? `${formatTripDate(startDate)} 出发`
    : `${formatTripDate(endDate)} 返回`;
}

export function getTripDurationDays(
  startDate: Date | null | undefined,
  endDate: Date | null | undefined,
): number | null {
  if (!startDate || !endDate) {
    return null;
  }

  const start = Date.UTC(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate(),
  );
  const end = Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

  return Math.floor((end - start) / 86_400_000) + 1;
}

export function getDaysUntilDeparture(
  startDate: Date | null | undefined,
  now = new Date(),
): number | null {
  if (!startDate) {
    return null;
  }

  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const start = Date.UTC(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate(),
  );

  return Math.ceil((start - today) / 86_400_000);
}

export function formatDaysUntilDeparture(days: number | null): string {
  if (days === null) {
    return "出发日期待定";
  }

  if (days > 0) {
    return `${days} 天后出发`;
  }

  if (days === 0) {
    return "今天出发";
  }

  return `已出发 ${Math.abs(days)} 天`;
}

export function formatBudget(
  amount: unknown,
  currency: string | null | undefined,
): string {
  if (amount === null || amount === undefined || amount === "") {
    return "预算待定";
  }

  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount)) {
    return "预算待定";
  }

  return `${currency || "CNY"} ${numericAmount.toLocaleString("zh-CN", {
    maximumFractionDigits: 2,
  })}`;
}

export function isValidCurrencyCode(value: string): boolean {
  return /^[A-Z]{3}$/i.test(value.trim());
}

export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
