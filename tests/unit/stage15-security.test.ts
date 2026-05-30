import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { redactAuditMetadata } from "@/lib/audit";
import {
  generateBackupFileName,
  generateBackupManifest,
  planBackupPrune,
  verifyBackupFile,
} from "@/lib/backup";
import { sha256Hex } from "@/lib/crypto-utils";
import {
  decryptDocumentBuffer,
  encryptDocumentBuffer,
  getDocumentEncryptionKey,
} from "@/lib/document-encryption";
import { redactForLogs } from "@/lib/logging";

const key = Buffer.from("0123456789abcdef0123456789abcdef");
const wrongKey = Buffer.from("abcdef0123456789abcdef0123456789");

describe("document encryption", () => {
  it("encrypts, decrypts, and generates required metadata", () => {
    const plaintext = Buffer.from("secret travel document");
    const encrypted = encryptDocumentBuffer(plaintext, key);

    expect(encrypted.ciphertext.equals(plaintext)).toBe(false);
    expect(encrypted.encryptionAlgorithm).toBe("aes-256-gcm");
    expect(encrypted.encryptionIv).toBeTruthy();
    expect(encrypted.encryptionAuthTag).toBeTruthy();
    expect(encrypted.encryptionVersion).toBe(1);
    expect(encrypted.encryptedFileSize).toBe(encrypted.ciphertext.length);
    expect(encrypted.fileSha256).toBe(sha256Hex(plaintext));

    expect(
      decryptDocumentBuffer(
        encrypted.ciphertext,
        {
          encryptionAlgorithm: encrypted.encryptionAlgorithm,
          encryptionAuthTag: encrypted.encryptionAuthTag,
          encryptionIv: encrypted.encryptionIv,
        },
        key,
      ).toString("utf8"),
    ).toBe("secret travel document");
  });

  it("fails to decrypt with the wrong key", () => {
    const encrypted = encryptDocumentBuffer(Buffer.from("passport"), key);

    expect(() =>
      decryptDocumentBuffer(
        encrypted.ciphertext,
        {
          encryptionAlgorithm: encrypted.encryptionAlgorithm,
          encryptionAuthTag: encrypted.encryptionAuthTag,
          encryptionIv: encrypted.encryptionIv,
        },
        wrongKey,
      ),
    ).toThrow();
  });

  it("accepts a long environment secret without exposing it", () => {
    expect(
      getDocumentEncryptionKey({
        DOCUMENT_ENCRYPTION_KEY: "long-document-secret-at-least-32-characters",
      }),
    ).toHaveLength(32);
  });
});

describe("backup reliability helpers", () => {
  it("generates deterministic backup file names", () => {
    expect(generateBackupFileName(new Date(2026, 4, 30, 9, 8, 7))).toBe(
      "travel-planner-backup-20260530-090807.zip",
    );
  });

  it("generates a manifest with checksums and schema data", () => {
    const manifest = generateBackupManifest({
      createdAt: new Date("2026-05-30T01:02:03.000Z"),
      files: [{ path: "database/dev.db", sha256: "abc", size: 12 }],
      migrations: ["20260530090000_stage15_security_reliability"],
    });

    expect(manifest).toMatchObject({
      app: "TraceMe",
      createdAt: "2026-05-30T01:02:03.000Z",
      format: "zip",
      schemaVersion: 1,
    });
    expect(manifest.files).toEqual([
      { path: "database/dev.db", sha256: "abc", size: 12 },
    ]);
    expect(manifest.excluded).toContain(".env");
    expect(manifest.schema.migrations).toContain(
      "20260530090000_stage15_security_reliability",
    );
  });

  it("plans daily backup retention pruning", () => {
    const plan = planBackupPrune(
      Array.from({ length: 9 }, (_, index) => ({
        fileName: `travel-planner-backup-202605${String(30 - index).padStart(2, "0")}-010203.zip`,
      })),
      { daily: 7, weekly: 0 },
    );

    expect(plan.filter((item) => item.keep)).toHaveLength(7);
    expect(plan.filter((item) => !item.keep)).toHaveLength(2);
  });

  it("returns structured errors for invalid zip files", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "traceme-backup-test-"));
    const invalidZipPath = path.join(tempDir, "broken.zip");

    try {
      await writeFile(invalidZipPath, Buffer.from("this is not a valid zip archive header"));

      await expect(verifyBackupFile(invalidZipPath)).resolves.toMatchObject({
        ok: false,
        errors: [expect.stringContaining("Invalid backup zip")],
      });
    } finally {
      await rm(tempDir, { force: true, recursive: true });
    }
  });
});

describe("redaction", () => {
  it("redacts audit metadata secrets", () => {
    expect(
      JSON.stringify(
        redactAuditMetadata({
          apiKey: "sk-secret1234567890",
          nested: { password: "secret", safe: "value" },
        }),
      ),
    ).toBe('{"apiKey":"[REDACTED]","nested":{"password":"[REDACTED]","safe":"value"}}');
  });

  it("redacts structured error log details", () => {
    const redacted = JSON.stringify(
      redactForLogs({
        cookie: "traceme_session=abc",
        message: "failed with api_key=sk-secret1234567890",
      }),
    );

    expect(redacted).not.toContain("sk-secret");
    expect(redacted).not.toContain("abc");
  });
});
