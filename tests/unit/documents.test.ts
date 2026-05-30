import { describe, expect, it } from "vitest";

import {
  formatFileSize,
  generateSafeStoredFileName,
  getFileExtension,
  isAllowedDocumentExtension,
  isAllowedMimeTypeForExtension,
  normalizeOriginalFileName,
  resolveUploadPath,
  validateDocumentFile,
  validateDocumentFileContent,
  validateTripDocumentStorageUsage,
} from "@/lib/documents";

describe("document file safety", () => {
  it("validates allowed file extensions", () => {
    expect(isAllowedDocumentExtension(".pdf")).toBe(true);
    expect(isAllowedDocumentExtension(".jpg")).toBe(true);
    expect(isAllowedDocumentExtension(".avif")).toBe(true);
    expect(isAllowedDocumentExtension(".md")).toBe(true);
    expect(isAllowedDocumentExtension(".docx")).toBe(true);
    expect(isAllowedDocumentExtension(".exe")).toBe(false);
    expect(isAllowedDocumentExtension(".sh")).toBe(false);
    expect(isAllowedDocumentExtension(".svg")).toBe(false);
  });

  it("validates MIME type against extension", () => {
    expect(isAllowedMimeTypeForExtension("application/pdf", ".pdf")).toBe(true);
    expect(isAllowedMimeTypeForExtension("image/png", ".png")).toBe(true);
    expect(isAllowedMimeTypeForExtension("image/avif", ".avif")).toBe(true);
    expect(isAllowedMimeTypeForExtension("text/plain", ".md")).toBe(true);
    expect(isAllowedMimeTypeForExtension("application/javascript", ".txt")).toBe(
      false,
    );
  });

  it("validates file content signatures", () => {
    expect(
      validateDocumentFileContent(
        new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]),
        ".pdf",
      ),
    ).toBeNull();
    expect(
      validateDocumentFileContent(
        new TextEncoder().encode("console.log('fake pdf');"),
        ".pdf",
      ),
    ).toBe("PDF 文件内容与扩展名不匹配。");
    expect(
      validateDocumentFileContent(new TextEncoder().encode("hello"), ".txt"),
    ).toBeNull();
    expect(
      validateDocumentFileContent(
        new Uint8Array([
          0x00, 0x00, 0x00, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69,
          0x66,
        ]),
        ".avif",
      ),
    ).toBeNull();
    expect(validateDocumentFileContent(new Uint8Array([0xff]), ".txt")).toBe(
      "文本文件内容不是有效的 UTF-8 文本。",
    );
  });

  it("validates file size", () => {
    expect(
      validateDocumentFile({
        fileName: "ticket.pdf",
        maxSizeBytes: 10,
        mimeType: "application/pdf",
        size: 10,
      }).ok,
    ).toBe(true);
    expect(
      validateDocumentFile({
        fileName: "ticket.pdf",
        maxSizeBytes: 10,
        mimeType: "application/pdf",
        size: 11,
      }).ok,
    ).toBe(false);
    expect(
      validateDocumentFile({
        fileName: "ticket.pdf",
        maxSizeBytes: 10,
        mimeType: "application/pdf",
        size: 0,
      }).ok,
    ).toBe(false);
  });

  it("generates safe random stored file names", () => {
    const first = generateSafeStoredFileName(".pdf");
    const second = generateSafeStoredFileName(".pdf");

    expect(first).toMatch(/^[a-f0-9-]{36}\.pdf$/);
    expect(second).toMatch(/^[a-f0-9-]{36}\.pdf$/);
    expect(first).not.toBe(second);
  });

  it("prevents path traversal in stored paths", () => {
    expect(normalizeOriginalFileName("../passport.pdf")).toBe("passport.pdf");
    expect(normalizeOriginalFileName("..\\passport.pdf")).toBe("passport.pdf");
    expect(getFileExtension("../passport.pdf")).toBe(".pdf");
    expect(() => resolveUploadPath("../passport.pdf")).toThrow(
      "Unsafe stored file name.",
    );
    expect(() => resolveUploadPath("nested/passport.pdf")).toThrow(
      "Unsafe stored file name.",
    );
  });

  it("formats file sizes", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1024)).toBe("1.0 KB");
    expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
  });

  it("validates trip-level storage limits", () => {
    expect(validateTripDocumentStorageUsage(900, 100, 1000)).toBeNull();
    expect(validateTripDocumentStorageUsage(901, 100, 1000)).toBe(
      "本次上传会超过当前旅行的文件总容量上限 1000 B。",
    );
    expect(validateTripDocumentStorageUsage(-1, 100, 1000)).toBe(
      "文件大小无效。",
    );
  });
});
