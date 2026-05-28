import { randomUUID } from "node:crypto";
import path from "node:path";

import type { DocumentType } from "@prisma/client";

export const DOCUMENT_TYPE_OPTIONS: Array<{ value: DocumentType; label: string }> = [
  { value: "FLIGHT_TICKET", label: "机票" },
  { value: "TRAIN_TICKET", label: "火车票" },
  { value: "HOTEL_BOOKING", label: "酒店订单" },
  { value: "ATTRACTION_RESERVATION", label: "景区预约" },
  { value: "INSURANCE_POLICY", label: "保险单" },
  { value: "CAR_RENTAL", label: "租车订单" },
  { value: "VISA_DOCUMENT", label: "签证文件" },
  { value: "PASSPORT", label: "护照" },
  { value: "ID_CARD", label: "身份证" },
  { value: "ITINERARY", label: "行程单" },
  { value: "PAYMENT_PROOF", label: "付款凭证" },
  { value: "OTHER", label: "其他" },
];

const LEGACY_DOCUMENT_TYPE_LABELS: Partial<Record<DocumentType, string>> = {
  BOOKING: "订单",
  INSURANCE: "保险",
  RECEIPT: "凭证",
  TICKET: "票据",
  VISA: "签证",
};

export const ALLOWED_DOCUMENT_EXTENSIONS = [
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".txt",
  ".md",
  ".markdown",
  ".docx",
  ".xlsx",
] as const;

export const BLOCKED_DOCUMENT_EXTENSIONS = [
  ".bat",
  ".cmd",
  ".exe",
  ".html",
  ".jar",
  ".js",
  ".jsp",
  ".mjs",
  ".php",
  ".pl",
  ".py",
  ".rb",
  ".sh",
  ".svg",
] as const;

const MIME_TYPES_BY_EXTENSION: Record<string, readonly string[]> = {
  ".docx": [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  ".jpeg": ["image/jpeg"],
  ".jpg": ["image/jpeg"],
  ".markdown": ["text/markdown", "text/plain"],
  ".md": ["text/markdown", "text/plain"],
  ".pdf": ["application/pdf"],
  ".png": ["image/png"],
  ".txt": ["text/plain"],
  ".webp": ["image/webp"],
  ".xlsx": [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
};

export const DEFAULT_MAX_DOCUMENT_FILE_SIZE_BYTES = 20 * 1024 * 1024;
export const DEFAULT_MAX_TRIP_DOCUMENT_STORAGE_BYTES = 500 * 1024 * 1024;
export const UPLOAD_STORAGE_DIR = path.join(process.cwd(), "storage", "uploads");

export type FileValidationInput = {
  fileName: string;
  mimeType: string;
  size: number;
  maxSizeBytes?: number;
};

export type FileValidationResult =
  | { ok: true; extension: string }
  | { ok: false; error: string };

export function getDocumentTypeLabel(type: DocumentType): string {
  return (
    DOCUMENT_TYPE_OPTIONS.find((option) => option.value === type)?.label ??
    LEGACY_DOCUMENT_TYPE_LABELS[type] ??
    type
  );
}

export function isDocumentType(value: string): value is DocumentType {
  return DOCUMENT_TYPE_OPTIONS.some((option) => option.value === value);
}

export function getMaxDocumentFileSizeBytes(): number {
  const configured = Number(process.env.MAX_UPLOAD_FILE_SIZE_BYTES);

  return Number.isInteger(configured) && configured > 0
    ? configured
    : DEFAULT_MAX_DOCUMENT_FILE_SIZE_BYTES;
}

export function getMaxTripDocumentStorageBytes(): number {
  const configured = Number(process.env.MAX_TRIP_DOCUMENT_STORAGE_BYTES);

  return Number.isInteger(configured) && configured > 0
    ? configured
    : DEFAULT_MAX_TRIP_DOCUMENT_STORAGE_BYTES;
}

export function normalizeOriginalFileName(fileName: string): string {
  const normalized = fileName.replaceAll("\\", "/");
  const baseName = normalized.split("/").filter(Boolean).at(-1) ?? "upload";

  return baseName.replace(/[\u0000-\u001f\u007f]/g, "").trim() || "upload";
}

export function getFileExtension(fileName: string): string {
  return path.extname(normalizeOriginalFileName(fileName)).toLowerCase();
}

export function isAllowedDocumentExtension(extension: string): boolean {
  const normalized = extension.toLowerCase();

  return (
    ALLOWED_DOCUMENT_EXTENSIONS.includes(
      normalized as (typeof ALLOWED_DOCUMENT_EXTENSIONS)[number],
    ) &&
    !BLOCKED_DOCUMENT_EXTENSIONS.includes(
      normalized as (typeof BLOCKED_DOCUMENT_EXTENSIONS)[number],
    )
  );
}

export function isAllowedMimeTypeForExtension(
  mimeType: string,
  extension: string,
): boolean {
  const allowedMimeTypes = MIME_TYPES_BY_EXTENSION[extension.toLowerCase()];

  return Boolean(
    allowedMimeTypes?.includes(mimeType.toLowerCase().split(";")[0].trim()),
  );
}

export function validateDocumentFile({
  fileName,
  maxSizeBytes = getMaxDocumentFileSizeBytes(),
  mimeType,
  size,
}: FileValidationInput): FileValidationResult {
  const extension = getFileExtension(fileName);

  if (!extension || !isAllowedDocumentExtension(extension)) {
    return { ok: false, error: "文件扩展名不允许上传。" };
  }

  if (!isAllowedMimeTypeForExtension(mimeType, extension)) {
    return { ok: false, error: "文件 MIME type 与扩展名不匹配或不被允许。" };
  }

  if (!Number.isInteger(size) || size <= 0) {
    return { ok: false, error: "文件不能为空。" };
  }

  if (size > maxSizeBytes) {
    return { ok: false, error: `单个文件不能超过 ${formatFileSize(maxSizeBytes)}。` };
  }

  return { ok: true, extension };
}

export function validateTripDocumentStorageUsage(
  currentSizeBytes: number,
  incomingSizeBytes: number,
  maxSizeBytes = getMaxTripDocumentStorageBytes(),
): string | null {
  if (
    !Number.isFinite(currentSizeBytes) ||
    currentSizeBytes < 0 ||
    !Number.isFinite(incomingSizeBytes) ||
    incomingSizeBytes <= 0
  ) {
    return "文件大小无效。";
  }

  if (currentSizeBytes + incomingSizeBytes > maxSizeBytes) {
    return `本次上传会超过当前旅行的文件总容量上限 ${formatFileSize(maxSizeBytes)}。`;
  }

  return null;
}

export function validateDocumentFileContent(
  bytes: Uint8Array,
  extension: string,
): string | null {
  const normalizedExtension = extension.toLowerCase();

  if (normalizedExtension === ".pdf") {
    return startsWithSignature(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])
      ? null
      : "PDF 文件内容与扩展名不匹配。";
  }

  if (normalizedExtension === ".jpg" || normalizedExtension === ".jpeg") {
    return startsWithSignature(bytes, [0xff, 0xd8, 0xff])
      ? null
      : "JPG 文件内容与扩展名不匹配。";
  }

  if (normalizedExtension === ".png") {
    return startsWithSignature(bytes, [
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ])
      ? null
      : "PNG 文件内容与扩展名不匹配。";
  }

  if (normalizedExtension === ".webp") {
    return startsWithSignature(bytes, [0x52, 0x49, 0x46, 0x46]) &&
      hasByteSequence(bytes, "WEBP", 8)
      ? null
      : "WEBP 文件内容与扩展名不匹配。";
  }

  if (normalizedExtension === ".docx") {
    return isZipLike(bytes) && hasByteSequence(bytes, "word/")
      ? null
      : "DOCX 文件内容与扩展名不匹配。";
  }

  if (normalizedExtension === ".xlsx") {
    return isZipLike(bytes) && hasByteSequence(bytes, "xl/")
      ? null
      : "XLSX 文件内容与扩展名不匹配。";
  }

  if (
    normalizedExtension === ".txt" ||
    normalizedExtension === ".md" ||
    normalizedExtension === ".markdown"
  ) {
    return isUtf8Text(bytes) ? null : "文本文件内容不是有效的 UTF-8 文本。";
  }

  return "文件内容类型不被允许。";
}

export function generateSafeStoredFileName(extension: string): string {
  const normalizedExtension = extension.startsWith(".")
    ? extension.toLowerCase()
    : `.${extension.toLowerCase()}`;

  if (!isAllowedDocumentExtension(normalizedExtension)) {
    throw new Error("Unsupported document extension.");
  }

  return `${randomUUID()}${normalizedExtension}`;
}

export function resolveUploadPath(storedFileName: string): string {
  if (
    storedFileName !== path.basename(storedFileName) ||
    storedFileName.includes("..") ||
    storedFileName.includes("/") ||
    storedFileName.includes("\\")
  ) {
    throw new Error("Unsafe stored file name.");
  }

  const resolvedStorageDir = path.resolve(UPLOAD_STORAGE_DIR);
  const resolvedPath = path.resolve(resolvedStorageDir, storedFileName);

  if (
    resolvedPath !== resolvedStorageDir &&
    !resolvedPath.startsWith(`${resolvedStorageDir}${path.sep}`)
  ) {
    throw new Error("Unsafe upload path.");
  }

  return resolvedPath;
}

export function formatFileSize(bytes: number | null | undefined): string {
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

  const formatted = value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1);

  return `${formatted} ${units[unitIndex]}`;
}

function startsWithSignature(
  bytes: Uint8Array,
  signature: readonly number[],
): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

function isZipLike(bytes: Uint8Array): boolean {
  return (
    startsWithSignature(bytes, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWithSignature(bytes, [0x50, 0x4b, 0x05, 0x06]) ||
    startsWithSignature(bytes, [0x50, 0x4b, 0x07, 0x08])
  );
}

function hasByteSequence(
  bytes: Uint8Array,
  text: string,
  startAt = 0,
): boolean {
  const sequence = new TextEncoder().encode(text);

  for (let index = startAt; index <= bytes.length - sequence.length; index += 1) {
    if (sequence.every((byte, offset) => bytes[index + offset] === byte)) {
      return true;
    }
  }

  return false;
}

function isUtf8Text(bytes: Uint8Array): boolean {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return !text.includes("\u0000");
  } catch {
    return false;
  }
}

export function getAllowedDocumentFileDescription(): string {
  return "PDF、JPG、PNG、WEBP、TXT、Markdown、DOCX、XLSX";
}

export function getDocumentAcceptAttribute(): string {
  return ALLOWED_DOCUMENT_EXTENSIONS.join(",");
}
