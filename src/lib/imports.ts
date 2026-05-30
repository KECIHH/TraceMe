import type {
  ChecklistStatus,
  PlaceType,
  Priority,
  TransportMode,
} from "@prisma/client";

import { normalizeExpenseCategory } from "@/lib/budget";
import {
  isChecklistStatus,
  isPlaceType,
  isPriority,
  parseDateInput,
} from "@/lib/trip-management";

export const IMPORT_FILE_SIZE_LIMIT_BYTES = 2 * 1024 * 1024;
export const IMPORT_SCHEMA_VERSION = 1;

export const IMPORT_TYPES = [
  "system-json",
  "places-csv",
  "expenses-csv",
  "checklist-csv",
  "markdown-notes",
  "route-gpx-kml",
  "bookmarks-html",
] as const;

export const CONFLICT_STRATEGIES = [
  "skip",
  "overwrite",
  "duplicate",
  "manual",
] as const;

export type ImportType = (typeof IMPORT_TYPES)[number];
export type ConflictStrategy = (typeof CONFLICT_STRATEGIES)[number];
export type ManualConflictAction = Exclude<ConflictStrategy, "manual">;

export type ImportEntity =
  | "destination"
  | "place"
  | "expense"
  | "checklistItem"
  | "note"
  | "routePlan";

export type DestinationImportData = {
  name: string;
  country: string | null;
  region: string | null;
  timezone: string | null;
  arrivalDate: string | null;
  departureDate: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
};

export type PlaceImportData = {
  name: string;
  type: PlaceType;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website: string | null;
  sourceUrl: string | null;
  sourceName: string | null;
  estimatedCost: string | null;
  estimatedDurationMin: number | null;
  ratingPersonal: number | null;
  priority: Priority;
  tags: string[];
  notes: string | null;
};

export type ExpenseImportData = {
  title: string;
  category: string;
  amount: string;
  currency: string;
  exchangeRate: string | null;
  paidAt: string | null;
  payer: string | null;
  splitWith: string[];
  relatedPlaceName: string | null;
  notes: string | null;
};

export type ChecklistImportData = {
  category: string;
  title: string;
  quantity: number;
  importance: Priority;
  dueDate: string | null;
  status: ChecklistStatus;
  notes: string | null;
};

export type NoteImportData = {
  title: string;
  content: string;
  sourceUrl: string | null;
  tags: string[];
};

export type RoutePlanImportData = {
  title: string;
  fromName: string;
  toName: string;
  mode: TransportMode;
  notes: string | null;
  resultJson: {
    format: "gpx" | "kml";
    coordinates: Array<{ latitude: number; longitude: number }>;
  };
};

export type ImportItemData =
  | DestinationImportData
  | PlaceImportData
  | ExpenseImportData
  | ChecklistImportData
  | NoteImportData
  | RoutePlanImportData;

export type ImportConflict = {
  conflictKey: string;
  duplicateInFile?: boolean;
  existingId?: string;
  existingLabel?: string;
  reason: "existing" | "duplicate-in-file";
};

export type ImportPreviewItem = {
  index: number;
  entity: ImportEntity;
  label: string;
  data: ImportItemData;
  errors: string[];
  warnings: string[];
  status: "new" | "conflict" | "invalid";
  sourceRow?: number;
  conflict?: ImportConflict | null;
};

export type ImportPreview = {
  schemaVersion: typeof IMPORT_SCHEMA_VERSION;
  type: ImportType;
  fileName: string;
  fileSize: number;
  parsedAt: string;
  summary: ImportSummary;
  warnings: string[];
  errors: string[];
  items: ImportPreviewItem[];
};

export type ImportSummary = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  conflictRows: number;
  newRows: number;
};

export type ImportValidationReport = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  conflictRows: number;
  steps: Array<{
    name: string;
    ok: boolean;
    message: string;
  }>;
};

export type CsvParseResult = {
  headers: string[];
  records: Array<{
    rowNumber: number;
    values: Record<string, string>;
  }>;
  errors: string[];
};

export type ExistingImportData = {
  destinations: Array<{
    id: string;
    name: string;
    country: string | null;
    region: string | null;
  }>;
  places: Array<{
    id: string;
    name: string;
    address: string | null;
  }>;
  expenses: Array<{
    id: string;
    title: string;
    category: string;
    amount: unknown;
    currency: string;
    paidAt: Date | string | null;
  }>;
  checklistItems: Array<{
    id: string;
    category: string;
    title: string;
  }>;
  notes: Array<{
    id: string;
    title: string;
    sourceUrl: string | null;
  }>;
  routePlans: Array<{
    id: string;
    title: string;
    fromName: string;
    toName: string;
  }>;
};

export type BuildImportPreviewOptions = {
  content: string;
  existing: ExistingImportData;
  fileName: string;
  fileSize: number;
  importedAt?: Date;
  mimeType?: string | null;
  type: ImportType;
};

export type ImportDecision = "create" | "overwrite" | "skip";

type ParsedImport = {
  items: ImportPreviewItem[];
  errors: string[];
  warnings: string[];
};

const TYPE_CONFIG: Record<
  ImportType,
  { extensions: string[]; mimeHints: string[]; label: string }
> = {
  "system-json": {
    extensions: [".json"],
    label: "TraceMe JSON",
    mimeHints: ["application/json", "text/json"],
  },
  "places-csv": {
    extensions: [".csv"],
    label: "Places CSV",
    mimeHints: ["text/csv", "application/vnd.ms-excel", "text/plain"],
  },
  "expenses-csv": {
    extensions: [".csv"],
    label: "Expenses CSV",
    mimeHints: ["text/csv", "application/vnd.ms-excel", "text/plain"],
  },
  "checklist-csv": {
    extensions: [".csv"],
    label: "Checklist CSV",
    mimeHints: ["text/csv", "application/vnd.ms-excel", "text/plain"],
  },
  "markdown-notes": {
    extensions: [".md", ".markdown", ".txt"],
    label: "Markdown notes",
    mimeHints: ["text/markdown", "text/plain", "application/octet-stream"],
  },
  "route-gpx-kml": {
    extensions: [".gpx", ".kml"],
    label: "GPX/KML route",
    mimeHints: ["application/gpx+xml", "application/vnd.google-earth.kml+xml", "text/xml", "application/xml"],
  },
  "bookmarks-html": {
    extensions: [".html", ".htm"],
    label: "Browser bookmarks",
    mimeHints: ["text/html", "application/octet-stream"],
  },
};

export function isImportType(value: string): value is ImportType {
  return IMPORT_TYPES.includes(value as ImportType);
}

export function isConflictStrategy(value: string): value is ConflictStrategy {
  return CONFLICT_STRATEGIES.includes(value as ConflictStrategy);
}

export function getImportTypeLabel(type: ImportType): string {
  return TYPE_CONFIG[type].label;
}

export function validateImportFileMeta({
  fileName,
  fileSize,
  mimeType,
  type,
}: {
  fileName: string;
  fileSize: number;
  mimeType?: string | null;
  type: ImportType;
}): string[] {
  const errors: string[] = [];
  const config = TYPE_CONFIG[type];
  const extension = getFileExtension(fileName);

  if (!fileName || hasUnsafeFileName(fileName)) {
    errors.push("导入文件名不安全，不能包含路径或上级目录片段。");
  }

  if (!config.extensions.includes(extension)) {
    errors.push(`文件类型不支持，请上传 ${config.extensions.join(", ")} 文件。`);
  }

  if (fileSize <= 0) {
    errors.push("导入文件不能为空。");
  }

  if (fileSize > IMPORT_FILE_SIZE_LIMIT_BYTES) {
    errors.push(`导入文件不能超过 ${formatBytes(IMPORT_FILE_SIZE_LIMIT_BYTES)}。`);
  }

  if (mimeType && !config.mimeHints.includes(mimeType)) {
    errors.push(`文件 MIME 类型 ${mimeType} 与导入类型不匹配。`);
  }

  return errors;
}

export function validateImportFileBeforeRead({
  fileName,
  fileSize,
  mimeType,
  type,
}: {
  fileName: string;
  fileSize: number;
  mimeType?: string | null;
  type: ImportType;
}): string[] {
  return validateImportFileMeta({ fileName, fileSize, mimeType, type });
}

export function buildImportPreview({
  content,
  existing,
  fileName,
  fileSize,
  importedAt = new Date(),
  mimeType,
  type,
}: BuildImportPreviewOptions): {
  preview: ImportPreview;
  validation: ImportValidationReport;
} {
  const metaErrors = validateImportFileMeta({ fileName, fileSize, mimeType, type });
  const parsed = metaErrors.length > 0
    ? { errors: metaErrors, items: [], warnings: [] }
    : parseImportContent(type, content, fileName);
  const items = detectImportConflicts(parsed.items, existing);
  const summary = summarizeImportItems(items);
  const errors = [...parsed.errors];
  const warnings = [...parsed.warnings];

  if (summary.totalRows > 0 && summary.validRows === 0 && errors.length === 0) {
    errors.push("没有可导入的有效数据行。");
  }

  const preview: ImportPreview = {
    schemaVersion: IMPORT_SCHEMA_VERSION,
    type,
    fileName: safeDisplayFileName(fileName),
    fileSize,
    parsedAt: importedAt.toISOString(),
    summary,
    warnings,
    errors,
    items,
  };

  return {
    preview,
    validation: buildValidationReport(preview),
  };
}

export function parseCsv(text: string): CsvParseResult {
  const rows: string[][] = [];
  const errors: string[] = [];
  let cell = "";
  let row: string[] = [];
  let inQuotes = false;
  let rowNumber = 1;

  const normalized = stripBom(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
        continue;
      }

      if (char === '"') {
        inQuotes = false;
        continue;
      }

      cell += char;
      continue;
    }

    if (char === '"') {
      if (cell.length > 0) {
        errors.push(`第 ${rowNumber} 行存在未转义的引号。`);
      }
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      rowNumber += 1;
      continue;
    }

    cell += char;
  }

  if (inQuotes) {
    errors.push("CSV 引号没有正确闭合。");
  }

  row.push(cell);
  rows.push(row);

  const nonEmptyRows = rows.filter((currentRow) =>
    currentRow.some((value) => value.trim() !== ""),
  );

  if (nonEmptyRows.length === 0) {
    return { errors: ["CSV 文件为空。"], headers: [], records: [] };
  }

  const headers = nonEmptyRows[0].map((header) => header.trim());
  const normalizedHeaders = headers.map(normalizeHeader);

  if (headers.every((header) => !header)) {
    errors.push("CSV 缺少表头。");
  }

  const records = nonEmptyRows.slice(1).map((currentRow, rowIndex) => {
    const values: Record<string, string> = {};

    normalizedHeaders.forEach((header, headerIndex) => {
      if (!header) {
        return;
      }

      values[header] = currentRow[headerIndex]?.trim() ?? "";
    });

    return {
      rowNumber: rowIndex + 2,
      values,
    };
  });

  return { errors, headers, records };
}

export function validateSystemJsonSchema(value: unknown): string[] {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return ["JSON 根节点必须是对象。"];
  }

  if (value.exportType !== "trip") {
    errors.push("JSON exportType 必须是 trip。");
  }

  if (value.schemaVersion !== 1) {
    errors.push("JSON schemaVersion 必须是 1。");
  }

  if (!isRecord(value.trip)) {
    errors.push("JSON trip 字段必须是对象。");
  }

  return errors;
}

export function convertMarkdownToSafeNote(
  markdown: string,
  fileName = "imported-note.md",
): NoteImportData {
  const cleaned = markdown.replace(/\u0000/g, "");
  const titleMatch = /^#\s+(.+)$/m.exec(cleaned);
  const title = sanitizeCsvFormula(
    escapeHtmlText(titleMatch?.[1]?.trim() || basenameWithoutExtension(fileName) || "Imported note"),
  );

  return {
    title,
    content: escapeHtmlText(cleaned.trim()),
    sourceUrl: null,
    tags: ["imported", "markdown"],
  };
}

export function sanitizeCsvFormula(value: string): string {
  if (/^\s*[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }

  return value;
}

export function detectImportConflicts(
  items: ImportPreviewItem[],
  existing: ExistingImportData,
): ImportPreviewItem[] {
  const existingByKey = buildExistingConflictIndex(existing);
  const seenInFile = new Map<string, ImportPreviewItem>();

  return items.map((item) => {
    if (item.errors.length > 0) {
      return { ...item, conflict: null, status: "invalid" };
    }

    const key = getImportItemConflictKey(item);
    const existingConflict = existingByKey.get(key);
    let conflict: ImportConflict | null = null;

    if (existingConflict) {
      conflict = {
        conflictKey: key,
        existingId: existingConflict.id,
        existingLabel: existingConflict.label,
        reason: "existing",
      };
    } else {
      const earlierItem = seenInFile.get(key);

      if (earlierItem) {
        conflict = {
          conflictKey: key,
          duplicateInFile: true,
          existingLabel: earlierItem.label,
          reason: "duplicate-in-file",
        };
      }
    }

    if (!conflict) {
      seenInFile.set(key, item);
    }

    return {
      ...item,
      conflict,
      status: conflict ? "conflict" : "new",
    };
  });
}

export function refreshImportPreviewConflicts(
  preview: ImportPreview,
  existing: ExistingImportData,
): ImportPreview {
  const items = detectImportConflicts(
    preview.items.map((item) => ({
      ...item,
      conflict: null,
      status: item.errors.length > 0 ? "invalid" : "new",
    })),
    existing,
  );

  return {
    ...preview,
    summary: summarizeImportItems(items),
    items,
  };
}

export function resolveImportDecision(
  item: ImportPreviewItem,
  strategy: ConflictStrategy,
  manualAction?: ManualConflictAction,
): ImportDecision {
  if (item.status === "invalid") {
    return "skip";
  }

  if (!item.conflict) {
    return "create";
  }

  const selected = strategy === "manual" ? manualAction ?? "skip" : strategy;

  if (selected === "skip") {
    return "skip";
  }

  if (selected === "overwrite" && item.conflict.existingId) {
    return "overwrite";
  }

  if (selected === "duplicate") {
    return "create";
  }

  return "skip";
}

export function makeImportCopyLabel(value: string): string {
  return `${value} (copy)`;
}

export function isImportPreview(value: unknown): value is ImportPreview {
  return (
    isRecord(value) &&
    value.schemaVersion === IMPORT_SCHEMA_VERSION &&
    isImportType(String(value.type)) &&
    typeof value.fileName === "string" &&
    typeof value.fileSize === "number" &&
    Array.isArray(value.items)
  );
}

function parseImportContent(
  type: ImportType,
  content: string,
  fileName: string,
): ParsedImport {
  switch (type) {
    case "system-json":
      return parseSystemJson(content);
    case "places-csv":
      return parsePlacesCsv(content);
    case "expenses-csv":
      return parseExpensesCsv(content);
    case "checklist-csv":
      return parseChecklistCsv(content);
    case "markdown-notes":
      return parseMarkdownNote(content, fileName);
    case "route-gpx-kml":
      return parseRouteFile(content, getFileExtension(fileName));
    case "bookmarks-html":
      return parseBookmarksHtml(content);
    default:
      return {
        errors: ["不支持的导入类型。"],
        items: [],
        warnings: [],
      };
  }
}

function parseSystemJson(content: string): ParsedImport {
  let parsed: unknown;

  try {
    parsed = JSON.parse(stripBom(content));
  } catch {
    return { errors: ["JSON 文件无法解析。"], items: [], warnings: [] };
  }

  const schemaErrors = validateSystemJsonSchema(parsed);

  if (schemaErrors.length > 0 || !isRecord(parsed) || !isRecord(parsed.trip)) {
    return { errors: schemaErrors, items: [], warnings: [] };
  }

  const trip = parsed.trip;
  const items: ImportPreviewItem[] = [];

  for (const destination of asArray(trip.destinations)) {
    items.push(makeItem("destination", mapSystemDestination(destination), items.length));
  }

  for (const place of asArray(trip.places)) {
    items.push(makeItem("place", mapSystemPlace(place), items.length));
  }

  for (const expense of asArray(trip.expenses)) {
    items.push(makeItem("expense", mapSystemExpense(expense), items.length));
  }

  for (const item of asArray(trip.checklistItems)) {
    items.push(makeItem("checklistItem", mapSystemChecklistItem(item), items.length));
  }

  for (const note of asArray(trip.notes)) {
    items.push(makeItem("note", mapSystemNote(note), items.length));
  }

  return {
    errors: items.length === 0 ? ["JSON 中没有可导入的数据。"] : [],
    items: validateItems(items),
    warnings: [],
  };
}

function parsePlacesCsv(content: string): ParsedImport {
  const csv = parseCsv(content);
  const items = csv.records.map((record, index) =>
    makeItem("place", mapPlaceCsvRecord(record.values), index, record.rowNumber),
  );

  return {
    errors: csv.errors,
    items: validateItems(items),
    warnings: [],
  };
}

function parseExpensesCsv(content: string): ParsedImport {
  const csv = parseCsv(content);
  const items = csv.records.map((record, index) =>
    makeItem("expense", mapExpenseCsvRecord(record.values), index, record.rowNumber),
  );

  return {
    errors: csv.errors,
    items: validateItems(items),
    warnings: [],
  };
}

function parseChecklistCsv(content: string): ParsedImport {
  const csv = parseCsv(content);
  const items = csv.records.map((record, index) =>
    makeItem(
      "checklistItem",
      mapChecklistCsvRecord(record.values),
      index,
      record.rowNumber,
    ),
  );

  return {
    errors: csv.errors,
    items: validateItems(items),
    warnings: [],
  };
}

function parseMarkdownNote(content: string, fileName: string): ParsedImport {
  const note = convertMarkdownToSafeNote(content, fileName);
  const item = makeItem("note", note, 0, 1);

  return {
    errors: [],
    items: validateItems([item]),
    warnings: ["Markdown 已按纯文本安全转义保存，不会作为 HTML 直接渲染。"],
  };
}

function parseRouteFile(content: string, extension: string): ParsedImport {
  const format = extension === ".kml" ? "kml" : "gpx";
  const title = extractXmlName(content) ?? `Imported ${format.toUpperCase()} route`;
  const coordinates =
    format === "kml" ? extractKmlCoordinates(content) : extractGpxCoordinates(content);

  if (coordinates.length === 0) {
    return { errors: ["路线文件中没有找到坐标点。"], items: [], warnings: [] };
  }

  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  const data: RoutePlanImportData = {
    title: sanitizeCsvFormula(title),
    fromName: `${first.latitude.toFixed(5)}, ${first.longitude.toFixed(5)}`,
    toName: `${last.latitude.toFixed(5)}, ${last.longitude.toFixed(5)}`,
    mode: "OTHER",
    notes: `Imported ${coordinates.length} route points from ${format.toUpperCase()}.`,
    resultJson: { coordinates, format },
  };

  return {
    errors: [],
    items: validateItems([makeItem("routePlan", data, 0, 1)]),
    warnings: [],
  };
}

function parseBookmarksHtml(content: string): ParsedImport {
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const items: ImportPreviewItem[] = [];
  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(content))) {
    const sourceUrl = decodeHtmlText(match[1].trim());
    const title = decodeHtmlText(stripTags(match[2]).trim());

    if (!isHttpUrl(sourceUrl) || !title) {
      continue;
    }

    items.push(
      makeItem(
        "note",
        {
          title: sanitizeCsvFormula(title),
          content: sourceUrl,
          sourceUrl,
          tags: ["imported", "bookmark"],
        },
        items.length,
      ),
    );
  }

  return {
    errors: items.length === 0 ? ["书签文件中没有找到有效链接。"] : [],
    items: validateItems(items),
    warnings: [],
  };
}

function mapPlaceCsvRecord(values: Record<string, string>): PlaceImportData {
  const type = readCsvValue(values, ["type", "place_type", "类型"]);
  const priority = readCsvValue(values, ["priority", "importance", "优先级"]);

  return {
    name: safeCsvText(readCsvValue(values, ["name", "title", "place", "名称", "地点"])),
    type: parsePlaceType(type),
    address: optionalSafeCsvText(readCsvValue(values, ["address", "addr", "地址"])),
    latitude: parseOptionalNumber(readCsvValue(values, ["latitude", "lat", "纬度"])),
    longitude: parseOptionalNumber(readCsvValue(values, ["longitude", "lng", "lon", "经度"])),
    phone: optionalSafeCsvText(readCsvValue(values, ["phone", "tel", "电话"])),
    website: optionalSafeCsvText(readCsvValue(values, ["website", "url", "官网"])),
    sourceUrl: optionalSafeCsvText(readCsvValue(values, ["source_url", "sourceurl", "source", "来源链接"])),
    sourceName: optionalSafeCsvText(readCsvValue(values, ["source_name", "sourcename", "来源"])),
    estimatedCost: optionalAmountText(readCsvValue(values, ["estimated_cost", "cost", "预计花费"])),
    estimatedDurationMin: parseOptionalInteger(readCsvValue(values, ["duration", "estimated_duration_min", "游玩时长"])),
    ratingPersonal: parseOptionalInteger(readCsvValue(values, ["rating", "score", "评分"])),
    priority: parsePriority(priority),
    tags: splitCsvList(readCsvValue(values, ["tags", "tag", "标签"])),
    notes: optionalSafeCsvText(readCsvValue(values, ["notes", "note", "备注"])),
  };
}

function mapExpenseCsvRecord(values: Record<string, string>): ExpenseImportData {
  const amount = readCsvValue(values, ["amount", "money", "金额"]);

  return {
    title: safeCsvText(readCsvValue(values, ["title", "name", "item", "名称", "支出"])),
    category: normalizeExpenseCategory(
      safeCsvText(readCsvValue(values, ["category", "type", "分类"])),
    ),
    amount: amount.trim(),
    currency: readCsvValue(values, ["currency", "ccy", "币种"]).trim().toUpperCase() || "CNY",
    exchangeRate: optionalAmountText(readCsvValue(values, ["exchange_rate", "exchangerate", "rate", "汇率"])),
    paidAt: optionalDateText(readCsvValue(values, ["paid_at", "paidat", "date", "日期"])),
    payer: optionalSafeCsvText(readCsvValue(values, ["payer", "paid_by", "付款人"])),
    splitWith: splitCsvList(readCsvValue(values, ["split_with", "splitwith", "分摊"])),
    relatedPlaceName: optionalSafeCsvText(readCsvValue(values, ["place", "related_place", "关联地点"])),
    notes: optionalSafeCsvText(readCsvValue(values, ["notes", "note", "备注"])),
  };
}

function mapChecklistCsvRecord(values: Record<string, string>): ChecklistImportData {
  const status = readCsvValue(values, ["status", "状态"]);
  const importance = readCsvValue(values, ["importance", "priority", "重要性"]);

  return {
    category: safeCsvText(readCsvValue(values, ["category", "type", "分类"])) || "其他",
    title: safeCsvText(readCsvValue(values, ["title", "name", "item", "清单项", "事项"])),
    quantity: parseOptionalInteger(readCsvValue(values, ["quantity", "qty", "数量"])) ?? 1,
    importance: parsePriority(importance),
    dueDate: optionalDateText(readCsvValue(values, ["due_date", "duedate", "date", "截止日期"])),
    status: parseChecklistStatus(status),
    notes: optionalSafeCsvText(readCsvValue(values, ["notes", "note", "备注"])),
  };
}

function mapSystemDestination(value: unknown): DestinationImportData {
  const record = asRecord(value);

  return {
    name: safeText(record.name),
    country: optionalSafeText(record.country),
    region: optionalSafeText(record.region),
    timezone: optionalSafeText(record.timezone),
    arrivalDate: optionalDateText(record.arrivalDate),
    departureDate: optionalDateText(record.departureDate),
    latitude: parseOptionalNumber(record.latitude),
    longitude: parseOptionalNumber(record.longitude),
    notes: optionalSafeText(record.notes),
  };
}

function mapSystemPlace(value: unknown): PlaceImportData {
  const record = asRecord(value);

  return {
    name: safeText(record.name),
    type: parsePlaceType(record.type),
    address: optionalSafeText(record.address),
    latitude: parseOptionalNumber(record.latitude),
    longitude: parseOptionalNumber(record.longitude),
    phone: optionalSafeText(record.phone),
    website: optionalSafeText(record.website),
    sourceUrl: optionalSafeText(record.sourceUrl),
    sourceName: optionalSafeText(record.sourceName),
    estimatedCost: optionalAmountText(record.estimatedCost),
    estimatedDurationMin: parseOptionalInteger(record.estimatedDurationMin),
    ratingPersonal: parseOptionalInteger(record.ratingPersonal),
    priority: parsePriority(record.priority),
    tags: splitJsonList(record.tags),
    notes: optionalSafeText(record.notes),
  };
}

function mapSystemExpense(value: unknown): ExpenseImportData {
  const record = asRecord(value);

  return {
    title: safeText(record.title),
    category: normalizeExpenseCategory(safeText(record.category)),
    amount: String(record.amount ?? "").trim(),
    currency: String(record.currency ?? "CNY").trim().toUpperCase(),
    exchangeRate: optionalAmountText(record.exchangeRate),
    paidAt: optionalDateText(record.paidAt),
    payer: optionalSafeText(record.payer),
    splitWith: splitJsonList(record.splitWith),
    relatedPlaceName: null,
    notes: optionalSafeText(record.notes),
  };
}

function mapSystemChecklistItem(value: unknown): ChecklistImportData {
  const record = asRecord(value);

  return {
    category: safeText(record.category) || "其他",
    title: safeText(record.title),
    quantity: parseOptionalInteger(record.quantity) ?? 1,
    importance: parsePriority(record.importance),
    dueDate: optionalDateText(record.dueDate),
    status: parseChecklistStatus(record.status),
    notes: optionalSafeText(record.notes),
  };
}

function mapSystemNote(value: unknown): NoteImportData {
  const record = asRecord(value);

  return {
    title: safeText(record.title),
    content: escapeHtmlText(String(record.content ?? "")),
    sourceUrl: optionalSafeText(record.sourceUrl),
    tags: splitJsonList(record.tags),
  };
}

function validateItems(items: ImportPreviewItem[]): ImportPreviewItem[] {
  return items.map((item) => {
    const errors = [...item.errors, ...validateImportItem(item)];

    return {
      ...item,
      errors,
      status: errors.length > 0 ? "invalid" : item.status,
    };
  });
}

function validateImportItem(item: ImportPreviewItem): string[] {
  switch (item.entity) {
    case "destination":
      return validateDestinationData(item.data as DestinationImportData);
    case "place":
      return validatePlaceData(item.data as PlaceImportData);
    case "expense":
      return validateExpenseData(item.data as ExpenseImportData);
    case "checklistItem":
      return validateChecklistData(item.data as ChecklistImportData);
    case "note":
      return validateNoteData(item.data as NoteImportData);
    case "routePlan":
      return validateRoutePlanData(item.data as RoutePlanImportData);
  }
}

function validateDestinationData(data: DestinationImportData): string[] {
  const errors: string[] = [];

  if (!data.name) {
    errors.push("目的地名称不能为空。");
  }

  validateCoordinates(data.latitude, data.longitude, errors);
  validateDate(data.arrivalDate, "到达日期", errors);
  validateDate(data.departureDate, "离开日期", errors);

  return errors;
}

function validatePlaceData(data: PlaceImportData): string[] {
  const errors: string[] = [];

  if (!data.name) {
    errors.push("地点名称不能为空。");
  }

  validateCoordinates(data.latitude, data.longitude, errors);
  validateOptionalUrl(data.website, "官网", errors);
  validateOptionalUrl(data.sourceUrl, "来源链接", errors);

  if (data.estimatedCost && !isNonNegativeNumberText(data.estimatedCost)) {
    errors.push("预计花费必须是非负数字。");
  }

  if (
    data.estimatedDurationMin !== null &&
    (!Number.isInteger(data.estimatedDurationMin) || data.estimatedDurationMin < 0)
  ) {
    errors.push("建议游玩时长必须是非负整数。");
  }

  if (
    data.ratingPersonal !== null &&
    (!Number.isInteger(data.ratingPersonal) || data.ratingPersonal < 1 || data.ratingPersonal > 5)
  ) {
    errors.push("个人评分必须是 1 到 5 的整数。");
  }

  return errors;
}

function validateExpenseData(data: ExpenseImportData): string[] {
  const errors: string[] = [];

  if (!data.title) {
    errors.push("支出标题不能为空。");
  }

  if (!isNonNegativeNumberText(data.amount)) {
    errors.push("支出金额必须是非负数字。");
  }

  if (!/^[A-Z]{3}$/.test(data.currency)) {
    errors.push("币种必须是 3 位字母代码。");
  }

  if (data.exchangeRate && !isPositiveNumberText(data.exchangeRate)) {
    errors.push("汇率必须大于 0。");
  }

  validateDate(data.paidAt, "支出日期", errors);

  return errors;
}

function validateChecklistData(data: ChecklistImportData): string[] {
  const errors: string[] = [];

  if (!data.title) {
    errors.push("清单项不能为空。");
  }

  if (!Number.isInteger(data.quantity) || data.quantity < 1) {
    errors.push("数量必须是大于 0 的整数。");
  }

  validateDate(data.dueDate, "截止日期", errors);

  return errors;
}

function validateNoteData(data: NoteImportData): string[] {
  const errors: string[] = [];

  if (!data.title) {
    errors.push("笔记标题不能为空。");
  }

  if (!data.content) {
    errors.push("笔记内容不能为空。");
  }

  validateOptionalUrl(data.sourceUrl, "来源链接", errors);

  return errors;
}

function validateRoutePlanData(data: RoutePlanImportData): string[] {
  const errors: string[] = [];

  if (!data.title) {
    errors.push("路线标题不能为空。");
  }

  if (data.resultJson.coordinates.length === 0) {
    errors.push("路线必须包含坐标点。");
  }

  return errors;
}

function makeItem(
  entity: ImportEntity,
  data: ImportItemData,
  index: number,
  sourceRow?: number,
): ImportPreviewItem {
  return {
    index,
    entity,
    label: getImportItemLabel(entity, data),
    data,
    errors: [],
    warnings: [],
    status: "new",
    sourceRow,
  };
}

function getImportItemLabel(entity: ImportEntity, data: ImportItemData): string {
  if (entity === "expense") {
    const expense = data as ExpenseImportData;
    return `${expense.title || "Untitled expense"} ${expense.amount ? `(${expense.amount} ${expense.currency})` : ""}`.trim();
  }

  if (entity === "checklistItem") {
    const item = data as ChecklistImportData;
    return `${item.category || "其他"} / ${item.title || "Untitled item"}`;
  }

  if (entity === "routePlan") {
    return (data as RoutePlanImportData).title || "Untitled route";
  }

  return "name" in data ? data.name : (data as NoteImportData).title;
}

function summarizeImportItems(items: ImportPreviewItem[]): ImportSummary {
  return {
    totalRows: items.length,
    validRows: items.filter((item) => item.status !== "invalid").length,
    invalidRows: items.filter((item) => item.status === "invalid").length,
    conflictRows: items.filter((item) => item.status === "conflict").length,
    newRows: items.filter((item) => item.status === "new").length,
  };
}

function buildValidationReport(preview: ImportPreview): ImportValidationReport {
  const ok = preview.errors.length === 0 && preview.summary.validRows > 0;

  return {
    ok,
    errors: preview.errors,
    warnings: preview.warnings,
    totalRows: preview.summary.totalRows,
    validRows: preview.summary.validRows,
    invalidRows: preview.summary.invalidRows,
    conflictRows: preview.summary.conflictRows,
    steps: [
      {
        name: "upload",
        ok: true,
        message: "文件已接收，尚未写入业务数据。",
      },
      {
        name: "parse",
        ok: preview.errors.length === 0,
        message: preview.errors.length === 0 ? "解析完成。" : preview.errors.join("；"),
      },
      {
        name: "validate",
        ok: preview.summary.validRows > 0 && preview.summary.invalidRows === 0,
        message:
          preview.summary.invalidRows === 0
            ? "校验通过。"
            : `有 ${preview.summary.invalidRows} 行未通过校验。`,
      },
      {
        name: "preview",
        ok: preview.summary.totalRows > 0,
        message: `预览 ${preview.summary.totalRows} 行，用户确认后才会写入数据库。`,
      },
      {
        name: "conflicts",
        ok: true,
        message:
          preview.summary.conflictRows > 0
            ? `发现 ${preview.summary.conflictRows} 行冲突。`
            : "未发现冲突。",
      },
    ],
  };
}

function buildExistingConflictIndex(existing: ExistingImportData) {
  const map = new Map<string, { id: string; label: string }>();

  for (const destination of existing.destinations) {
    map.set(destinationConflictKey(destination), {
      id: destination.id,
      label: destination.name,
    });
  }

  for (const place of existing.places) {
    map.set(placeConflictKey(place), {
      id: place.id,
      label: place.name,
    });
  }

  for (const expense of existing.expenses) {
    map.set(expenseConflictKey(expense), {
      id: expense.id,
      label: expense.title,
    });
  }

  for (const item of existing.checklistItems) {
    map.set(checklistConflictKey(item), {
      id: item.id,
      label: item.title,
    });
  }

  for (const note of existing.notes) {
    map.set(noteConflictKey(note), {
      id: note.id,
      label: note.title,
    });
  }

  for (const route of existing.routePlans) {
    map.set(routeConflictKey(route), {
      id: route.id,
      label: route.title,
    });
  }

  return map;
}

function getImportItemConflictKey(item: ImportPreviewItem): string {
  switch (item.entity) {
    case "destination":
      return destinationConflictKey(item.data as DestinationImportData);
    case "place":
      return placeConflictKey(item.data as PlaceImportData);
    case "expense":
      return expenseConflictKey(item.data as ExpenseImportData);
    case "checklistItem":
      return checklistConflictKey(item.data as ChecklistImportData);
    case "note":
      return noteConflictKey(item.data as NoteImportData);
    case "routePlan":
      return routeConflictKey(item.data as RoutePlanImportData);
  }
}

function destinationConflictKey(value: {
  country?: string | null;
  name: string;
  region?: string | null;
}) {
  return ["destination", value.name, value.country ?? "", value.region ?? ""]
    .map(normalizeConflictText)
    .join(":");
}

function placeConflictKey(value: { address?: string | null; name: string }) {
  return ["place", value.name, value.address ?? ""]
    .map(normalizeConflictText)
    .join(":");
}

function expenseConflictKey(value: {
  amount: unknown;
  category: string;
  currency: string;
  paidAt?: Date | string | null;
  title: string;
}) {
  return [
    "expense",
    value.title,
    value.category,
    String(value.amount),
    value.currency,
    normalizeDateForConflict(value.paidAt),
  ]
    .map(normalizeConflictText)
    .join(":");
}

function checklistConflictKey(value: { category: string; title: string }) {
  return ["checklist", value.category, value.title]
    .map(normalizeConflictText)
    .join(":");
}

function noteConflictKey(value: { sourceUrl?: string | null; title: string }) {
  return ["note", value.title, value.sourceUrl ?? ""]
    .map(normalizeConflictText)
    .join(":");
}

function routeConflictKey(value: {
  fromName: string;
  title: string;
  toName: string;
}) {
  return ["route", value.title, value.fromName, value.toName]
    .map(normalizeConflictText)
    .join(":");
}

function normalizeConflictText(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeDateForConflict(value: Date | string | null | undefined): string {
  if (!value) {
    return "";
  }

  if (value instanceof Date) {
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, "0"),
      String(value.getDate()).padStart(2, "0"),
    ].join("-");
  }

  return String(value).slice(0, 10);
}

function readCsvValue(values: Record<string, string>, aliases: string[]): string {
  for (const alias of aliases) {
    const normalized = normalizeHeader(alias);

    if (Object.prototype.hasOwnProperty.call(values, normalized)) {
      return values[normalized] ?? "";
    }
  }

  return "";
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function safeCsvText(value: string): string {
  return sanitizeCsvFormula(value.trim());
}

function optionalSafeCsvText(value: string): string | null {
  const safe = safeCsvText(value);
  return safe ? safe : null;
}

function safeText(value: unknown): string {
  return sanitizeCsvFormula(String(value ?? "").trim());
}

function optionalSafeText(value: unknown): string | null {
  const text = safeText(value);
  return text ? text : null;
}

function optionalAmountText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function optionalDateText(value: unknown): string | null {
  const text = String(value ?? "").trim();

  if (!text) {
    return null;
  }

  return text.slice(0, 10);
}

function parseOptionalNumber(value: unknown): number | null {
  const text = String(value ?? "").trim();

  if (!text) {
    return null;
  }

  const numberValue = Number(text);
  return Number.isFinite(numberValue) ? numberValue : Number.NaN;
}

function parseOptionalInteger(value: unknown): number | null {
  const text = String(value ?? "").trim();

  if (!text) {
    return null;
  }

  const numberValue = Number(text);
  return Number.isInteger(numberValue) ? numberValue : Number.NaN;
}

function parsePlaceType(value: unknown): PlaceType {
  const text = String(value ?? "").trim().toUpperCase();
  return isPlaceType(text) ? text : "OTHER";
}

function parsePriority(value: unknown): Priority {
  const text = String(value ?? "").trim().toUpperCase();
  return isPriority(text) ? text : "MEDIUM";
}

function parseChecklistStatus(value: unknown): ChecklistStatus {
  const text = String(value ?? "").trim().toUpperCase();
  return isChecklistStatus(text) ? text : "TODO";
}

function splitCsvList(value: string): string[] {
  return value
    .split(/[,;|\n]/)
    .map((item) => safeCsvText(item))
    .filter(Boolean);
}

function splitJsonList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => safeText(item)).filter(Boolean);
  }

  return splitCsvList(String(value ?? ""));
}

function validateCoordinates(
  latitude: number | null,
  longitude: number | null,
  errors: string[],
) {
  if (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) {
    errors.push("纬度必须在 -90 到 90 之间。");
  }

  if (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) {
    errors.push("经度必须在 -180 到 180 之间。");
  }
}

function validateDate(value: string | null, label: string, errors: string[]) {
  if (value && !parseDateInput(value)) {
    errors.push(`${label}格式必须是 YYYY-MM-DD。`);
  }
}

function validateOptionalUrl(value: string | null, label: string, errors: string[]) {
  if (value && !isHttpUrl(value)) {
    errors.push(`${label}必须是 http 或 https 地址。`);
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isNonNegativeNumberText(value: string): boolean {
  const numberValue = Number(value);
  return value.trim() !== "" && Number.isFinite(numberValue) && numberValue >= 0;
}

function isPositiveNumberText(value: string): boolean {
  const numberValue = Number(value);
  return value.trim() !== "" && Number.isFinite(numberValue) && numberValue > 0;
}

function getFileExtension(fileName: string): string {
  const match = /\.[^.]+$/.exec(fileName.trim().toLowerCase());
  return match?.[0] ?? "";
}

function hasUnsafeFileName(fileName: string): boolean {
  return (
    fileName.includes("/") ||
    fileName.includes("\\") ||
    fileName.includes("\0") ||
    fileName === "." ||
    fileName === ".." ||
    fileName.includes("..")
  );
}

function safeDisplayFileName(fileName: string): string {
  return fileName.replace(/[\\/]/g, "_").replaceAll("\0", "").slice(0, 160);
}

function basenameWithoutExtension(fileName: string): string {
  const safeName = safeDisplayFileName(fileName);
  return safeName.replace(/\.[^.]+$/, "");
}

function formatBytes(value: number): string {
  if (value >= 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }

  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${value} B`;
}

function stripBom(value: string): string {
  return value.replace(/^\uFEFF/, "");
}

function escapeHtmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, "");
}

function decodeHtmlText(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractXmlName(content: string): string | null {
  const match = /<name>([^<]+)<\/name>/i.exec(content);
  return match ? stripTags(decodeHtmlText(match[1])).trim() : null;
}

function extractGpxCoordinates(content: string): Array<{ latitude: number; longitude: number }> {
  const coordinates: Array<{ latitude: number; longitude: number }> = [];
  const pattern = /<(?:trkpt|rtept|wpt)\b[^>]*\blat=["']([^"']+)["'][^>]*\blon=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content))) {
    const latitude = Number(match[1]);
    const longitude = Number(match[2]);

    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      coordinates.push({ latitude, longitude });
    }
  }

  return coordinates;
}

function extractKmlCoordinates(content: string): Array<{ latitude: number; longitude: number }> {
  const coordinates: Array<{ latitude: number; longitude: number }> = [];
  const pattern = /<coordinates>([\s\S]*?)<\/coordinates>/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content))) {
    for (const tuple of match[1].trim().split(/\s+/)) {
      const [longitudeText, latitudeText] = tuple.split(",");
      const latitude = Number(latitudeText);
      const longitude = Number(longitudeText);

      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        coordinates.push({ latitude, longitude });
      }
    }
  }

  return coordinates;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
