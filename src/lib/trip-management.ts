import type { ChecklistStatus, PlaceType, Priority } from "@prisma/client";

export const PLACE_TYPE_OPTIONS: Array<{ value: PlaceType; label: string }> = [
  { value: "ATTRACTION", label: "景点" },
  { value: "RESTAURANT", label: "餐厅" },
  { value: "HOTEL", label: "酒店" },
  { value: "STATION", label: "车站" },
  { value: "AIRPORT", label: "机场" },
  { value: "STORE", label: "商店" },
  { value: "HOSPITAL", label: "医院" },
  { value: "EMBASSY", label: "使领馆" },
  { value: "EMERGENCY", label: "紧急地点" },
  { value: "OTHER", label: "其他" },
];

export const PRIORITY_OPTIONS: Array<{ value: Priority; label: string }> = [
  { value: "HIGH", label: "必去" },
  { value: "MEDIUM", label: "推荐" },
  { value: "LOW", label: "可选" },
  { value: "AVOID", label: "避雷" },
];

export const CHECKLIST_STATUS_OPTIONS: Array<{
  value: ChecklistStatus;
  label: string;
}> = [
  { value: "TODO", label: "未准备" },
  { value: "DONE", label: "已准备" },
  { value: "SKIPPED", label: "不需要" },
];

export const CHECKLIST_CATEGORIES = [
  "证件",
  "票据",
  "衣物",
  "药品",
  "电子设备",
  "洗漱用品",
  "支付",
  "通信",
  "摄影",
  "户外装备",
  "儿童用品",
  "老人用品",
  "宠物用品",
  "出境游",
  "自驾游",
  "其他",
];

export const BASIC_CHECKLIST_TEMPLATE: Array<{
  category: string;
  title: string;
  notes?: string;
}> = [
  { category: "证件", title: "身份证" },
  { category: "证件", title: "护照", notes: "出境游可选" },
  { category: "证件", title: "驾照", notes: "自驾游可选" },
  { category: "电子设备", title: "手机" },
  { category: "电子设备", title: "充电器" },
  { category: "电子设备", title: "充电宝" },
  { category: "电子设备", title: "数据线" },
  { category: "药品", title: "常用药" },
  { category: "药品", title: "肠胃药" },
  { category: "药品", title: "晕车药" },
  { category: "药品", title: "创可贴" },
  { category: "支付", title: "银行卡" },
  { category: "支付", title: "少量现金" },
  { category: "支付", title: "支付软件确认" },
  { category: "通信", title: "手机流量" },
  { category: "通信", title: "漫游或 eSIM", notes: "出境游可选" },
  { category: "通信", title: "离线地图" },
  { category: "票据", title: "机票/火车票" },
  { category: "票据", title: "酒店订单" },
  { category: "票据", title: "景区预约" },
];

export function getPlaceTypeLabel(type: PlaceType): string {
  return PLACE_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;
}

export function getPriorityLabel(priority: Priority): string {
  return (
    PRIORITY_OPTIONS.find((option) => option.value === priority)?.label ??
    priority
  );
}

export function getChecklistStatusLabel(status: ChecklistStatus): string {
  return (
    CHECKLIST_STATUS_OPTIONS.find((option) => option.value === status)?.label ??
    status
  );
}

export function isPlaceType(value: string): value is PlaceType {
  return PLACE_TYPE_OPTIONS.some((option) => option.value === value);
}

export function isPriority(value: string): value is Priority {
  return PRIORITY_OPTIONS.some((option) => option.value === value);
}

export function isChecklistStatus(value: string): value is ChecklistStatus {
  return CHECKLIST_STATUS_OPTIONS.some((option) => option.value === value);
}

export function isValidOptionalHttpUrl(value: string): boolean {
  const trimmed = value.trim();

  if (!trimmed) {
    return true;
  }

  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function parseOptionalCoordinate(value: string): number | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const numberValue = Number(trimmed);
  return Number.isFinite(numberValue) ? numberValue : Number.NaN;
}

export function isValidLatitude(value: string): boolean {
  const coordinate = parseOptionalCoordinate(value);
  return coordinate === null || (Number.isFinite(coordinate) && coordinate >= -90 && coordinate <= 90);
}

export function isValidLongitude(value: string): boolean {
  const coordinate = parseOptionalCoordinate(value);
  return coordinate === null || (Number.isFinite(coordinate) && coordinate >= -180 && coordinate <= 180);
}

export function isValidOptionalNonNegativeNumber(value: string): boolean {
  const trimmed = value.trim();

  if (!trimmed) {
    return true;
  }

  const numberValue = Number(trimmed);
  return Number.isFinite(numberValue) && numberValue >= 0;
}

export function isValidOptionalNonNegativeInteger(value: string): boolean {
  const trimmed = value.trim();

  if (!trimmed) {
    return true;
  }

  const numberValue = Number(trimmed);
  return Number.isInteger(numberValue) && numberValue >= 0;
}

export function isValidOptionalRating(value: string): boolean {
  const trimmed = value.trim();

  if (!trimmed) {
    return true;
  }

  const numberValue = Number(trimmed);
  return Number.isInteger(numberValue) && numberValue >= 1 && numberValue <= 5;
}

export function splitTags(value: string): string[] {
  return value
    .split(/[,，\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function formatTags(tags: unknown): string {
  if (!Array.isArray(tags)) {
    return "";
  }

  return tags.filter((tag): tag is string => typeof tag === "string").join(", ");
}

export function calculateChecklistCompletion(
  items: Array<{ status: ChecklistStatus }>,
): number {
  const applicableItems = items.filter((item) => item.status !== "SKIPPED");

  if (applicableItems.length === 0) {
    return 0;
  }

  const doneItems = applicableItems.filter((item) => item.status === "DONE");
  return Math.round((doneItems.length / applicableItems.length) * 100);
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

export function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
