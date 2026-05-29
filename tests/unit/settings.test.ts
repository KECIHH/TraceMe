import { describe, expect, it } from "vitest";

import {
  isSamePasswordValue,
  validateNewPassword,
  validatePasswordChangeFields,
} from "@/lib/settings/password";
import {
  calculateSystemCounts,
  formatBytes,
  isSensitiveEnvironmentKey,
  sanitizeEnvironmentSnapshot,
} from "@/lib/settings/system";

describe("settings password validation", () => {
  it("requires a new password with at least 10 characters", () => {
    const result = validateNewPassword("short1");

    expect(result.strongEnough).toBe(false);
    expect(result.issues).toContain("新密码至少需要 10 位。");
  });

  it("warns when a password does not contain both letters and numbers", () => {
    const result = validateNewPassword("longpassword");

    expect(result.strongEnough).toBe(true);
    expect(result.warnings).toContain("建议新密码同时包含字母和数字。");
  });

  it("checks old and new password equality", () => {
    expect(isSamePasswordValue("TraceMe12345", "TraceMe12345")).toBe(true);
    expect(isSamePasswordValue("TraceMe12345", "TraceMe67890")).toBe(false);
  });

  it("validates password change fields together", () => {
    const result = validatePasswordChangeFields({
      confirmPassword: "TraceMe67890",
      currentPassword: "TraceMe12345",
      newPassword: "TraceMe67890",
    });

    expect(result.strongEnough).toBe(true);
    expect(result.issues).toEqual([]);
  });
});

describe("settings system statistics", () => {
  it("calculates non-negative system counts", () => {
    const recentBackupAt = new Date("2026-05-29T01:02:03.000Z");
    const counts = calculateSystemCounts({
      backupBytes: 2048,
      backupFileCount: 2,
      documentCount: 3,
      documentRecordBytes: 1024,
      itineraryItemCount: 5,
      placeCount: 4,
      recentBackupAt,
      tripCount: 1,
      uploadBytes: 4096,
      uploadFileCount: 6,
    });

    expect(counts).toMatchObject({
      backupBytes: 2048,
      backupFileCount: 2,
      documentCount: 3,
      documentRecordBytes: 1024,
      itineraryItemCount: 5,
      placeCount: 4,
      recentBackupAt,
      tripCount: 1,
      uploadBytes: 4096,
      uploadFileCount: 6,
    });
    expect(formatBytes(counts.uploadBytes + counts.backupBytes)).toBe("6.0 KB");
  });

  it("hides sensitive environment variables", () => {
    const sanitized = sanitizeEnvironmentSnapshot({
      DATABASE_URL: "file:./dev.db",
      DOCUMENT_ENCRYPTION_KEY: "doc-secret",
      NODE_ENV: "test",
      OPENAI_API_KEY: "test-openai-key",
      SESSION_SECRET: "session-secret",
      TRACE_PUBLIC_FLAG: "visible",
    });

    expect(sanitized).toEqual({
      NODE_ENV: "test",
      TRACE_PUBLIC_FLAG: "visible",
    });
    expect(isSensitiveEnvironmentKey("OPENAI_API_KEY")).toBe(true);
    expect(isSensitiveEnvironmentKey("DOCUMENT_ENCRYPTION_KEY")).toBe(true);
    expect(isSensitiveEnvironmentKey("TRACE_PUBLIC_FLAG")).toBe(false);
  });
});
