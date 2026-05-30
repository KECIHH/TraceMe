import { createHash } from "node:crypto";

import type {
  ChecklistStatus,
  DocumentType,
  ItineraryItemStatus,
  ItineraryItemType,
  PlaceType,
  Priority,
} from "@prisma/client";

export const OFFLINE_CACHE_SCHEMA_VERSION = 1;

const SENSITIVE_DOCUMENT_TYPES: readonly DocumentType[] = [
  "PASSPORT",
  "ID_CARD",
  "INSURANCE",
  "INSURANCE_POLICY",
  "VISA",
  "VISA_DOCUMENT",
  "BOOKING",
  "HOTEL_BOOKING",
  "FLIGHT_TICKET",
  "TRAIN_TICKET",
  "PAYMENT_PROOF",
];

const SENSITIVE_KEY_PATTERN =
  /(api[-_]?key|authorization|cookie|password|passport|idcard|id_card|session|token|prompt|file(path|content)?|attachment|backup|document|insurance|visa)/i;
const SENSITIVE_TEXT_PATTERNS: readonly RegExp[] = [
  /\b[A-Z0-9]{8,12}\b/g,
  /(api[-_ ]?key|session|token|passport|护照|身份证|保险)[:：]?\s*\S+/gi,
];
const CHINESE_ID_PATTERN = /\b\d{17}[\dXx]\b/g;

export type OfflineChecklistItem = {
  category: string;
  importance: Priority;
  status: ChecklistStatus;
  title: string;
};

export type OfflineItineraryItem = {
  endTime: string | null;
  placeName: string | null;
  startTime: string | null;
  status: ItineraryItemStatus;
  title: string;
  transportToNext: string | null;
  type: ItineraryItemType;
};

export type OfflinePlaceSummary = {
  address: string | null;
  name: string;
  phone: string | null;
  type: PlaceType;
};

export type OfflineTripSummary = {
  cacheVersion: string;
  checklist: OfflineChecklistItem[];
  dateRange: {
    endDate: string | null;
    startDate: string | null;
  };
  emergencyNotes: string[];
  generatedAt: string;
  lodging: OfflinePlaceSummary[];
  places: OfflinePlaceSummary[];
  schemaVersion: number;
  title: string;
  today: {
    city: string | null;
    date: string | null;
    items: OfflineItineraryItem[];
    theme: string | null;
    weatherSummary: string | null;
  };
  transports: string[];
  tripId: string;
};

export function isSensitiveDocumentType(type: DocumentType): boolean {
  return SENSITIVE_DOCUMENT_TYPES.includes(type);
}

export function stripSensitiveFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripSensitiveFields(item)) as T;
  }

  if (!value || typeof value !== "object" || value instanceof Date) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SENSITIVE_KEY_PATTERN.test(key))
      .map(([key, nested]) => [key, stripSensitiveFields(nested)]),
  ) as T;
}

export function redactSensitiveOfflineText(value: string): string {
  const redactedText = SENSITIVE_TEXT_PATTERNS.reduce(
    (text, pattern) => text.replace(pattern, "[已隐藏]"),
    value,
  );

  return redactedText.replace(CHINESE_ID_PATTERN, (candidate) =>
    isValidChineseResidentId(candidate) ? "[已隐藏]" : candidate,
  );
}

export function sanitizeOfflineText(value: string): string {
  return redactSensitiveOfflineText(value).trim();
}

export function sanitizeOptionalOfflineText(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  const sanitized = sanitizeOfflineText(value);
  return sanitized ? sanitized : null;
}

export function formatOfflineLocalTime(date: Date | null | undefined): string | null {
  if (!date) {
    return null;
  }

  return [
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
  ].join(":");
}

export function isValidChineseResidentId(value: string): boolean {
  if (!/^\d{17}[\dXx]$/.test(value)) {
    return false;
  }

  const birthDate = value.slice(6, 14);
  const year = Number(birthDate.slice(0, 4));
  const month = Number(birthDate.slice(4, 6));
  const day = Number(birthDate.slice(6, 8));
  const parsedDate = new Date(year, month - 1, day);

  if (
    parsedDate.getFullYear() !== year ||
    parsedDate.getMonth() !== month - 1 ||
    parsedDate.getDate() !== day
  ) {
    return false;
  }

  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const checksums = ["1", "0", "X", "9", "8", "7", "6", "5", "4", "3", "2"];
  const total = weights.reduce(
    (sum, weight, index) => sum + Number(value[index]) * weight,
    0,
  );

  return checksums[total % 11] === value[17].toUpperCase();
}

export function buildOfflineCacheVersion(
  summary: Omit<OfflineTripSummary, "cacheVersion" | "generatedAt">,
): string {
  return createHash("sha256")
    .update(stableStringify(summary))
    .digest("hex")
    .slice(0, 16);
}

export function attachOfflineCacheMetadata(
  summary: Omit<OfflineTripSummary, "cacheVersion" | "generatedAt">,
  generatedAt = new Date(),
): OfflineTripSummary {
  return {
    ...summary,
    cacheVersion: buildOfflineCacheVersion(summary),
    generatedAt: generatedAt.toISOString(),
  };
}

export function assertOfflineSummaryHasNoSensitiveKeys(
  summary: OfflineTripSummary,
): boolean {
  return !containsSensitiveKey(summary);
}

function containsSensitiveKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => containsSensitiveKey(item));
  }

  if (!value || typeof value !== "object" || value instanceof Date) {
    return false;
  }

  return Object.entries(value).some(
    ([key, nested]) =>
      SENSITIVE_KEY_PATTERN.test(key) || containsSensitiveKey(nested),
  );
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (!value || typeof value !== "object") {
    return JSON.stringify(value);
  }

  return `{${Object.keys(value)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableStringify(
          (value as Record<string, unknown>)[key],
        )}`,
    )
    .join(",")}}`;
}
