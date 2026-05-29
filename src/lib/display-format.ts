import type { TripStatus } from "@prisma/client";

import { getTripStatusLabel } from "@/lib/trips";

export const EMPTY_VALUE_LABEL = "未填写";

export function formatEmptyValue(
  value: string | number | null | undefined,
  fallback = EMPTY_VALUE_LABEL,
): string {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === "string" && value.trim() === "") {
    return fallback;
  }

  return String(value);
}

export function formatDisplayDate(
  date: Date | null | undefined,
  fallback = EMPTY_VALUE_LABEL,
): string {
  if (!date) {
    return fallback;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatDisplayTime(
  date: Date | null | undefined,
  fallback = EMPTY_VALUE_LABEL,
): string {
  if (!date) {
    return fallback;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDisplayDateTime(
  date: Date | null | undefined,
  fallback = EMPTY_VALUE_LABEL,
): string {
  if (!date) {
    return fallback;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatDisplayMoney(
  amount: number | string | { toString(): string } | null | undefined,
  currency = "CNY",
  fallback = EMPTY_VALUE_LABEL,
): string {
  if (amount === null || amount === undefined || amount === "") {
    return fallback;
  }

  const numericAmount = Number(amount.toString());

  if (!Number.isFinite(numericAmount)) {
    return fallback;
  }

  return `${currency || "CNY"} ${numericAmount.toLocaleString("zh-CN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(numericAmount) ? 0 : 2,
  })}`;
}

export function formatDisplayFileSize(
  bytes: number | null | undefined,
): string {
  if (!bytes || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const formatted =
    value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1);

  return `${formatted} ${units[unitIndex]}`;
}

export function formatTripStatusLabel(status: TripStatus): string {
  return getTripStatusLabel(status);
}
