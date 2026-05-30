import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ensureDocumentEncryptionKey } from "../../scripts/ensure-production-secrets.mjs";

describe("production secret bootstrap", () => {
  it("generates and reuses a persistent document encryption key", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "traceme-secrets-"));
    const keyFile = path.join(tempDir, "document-encryption-key");

    try {
      const firstEnv: Record<string, string | undefined> = {
        DOCUMENT_ENCRYPTION_KEY_FILE: keyFile,
      };
      const firstResult = await ensureDocumentEncryptionKey(firstEnv);
      const generatedKey = firstEnv.DOCUMENT_ENCRYPTION_KEY;

      expect(firstResult).toMatchObject({
        generated: true,
        keyFile,
        source: "file",
      });
      expect(generatedKey).toBeDefined();
      expect(generatedKey).toHaveLength(43);
      await expect(readFile(keyFile, "utf8")).resolves.toBe(
        `${generatedKey}\n`,
      );

      const secondEnv: Record<string, string | undefined> = {
        DOCUMENT_ENCRYPTION_KEY_FILE: keyFile,
      };
      const secondResult = await ensureDocumentEncryptionKey(secondEnv);

      expect(secondResult).toMatchObject({
        generated: false,
        keyFile,
        source: "file",
      });
      expect(secondEnv.DOCUMENT_ENCRYPTION_KEY).toBe(generatedKey);
    } finally {
      await rm(tempDir, { force: true, recursive: true });
    }
  });

  it("keeps an explicit environment key instead of overwriting it", async () => {
    const env: Record<string, string | undefined> = {
      DOCUMENT_ENCRYPTION_KEY: "explicit-document-key-with-more-than-32-chars",
      DOCUMENT_ENCRYPTION_KEY_FILE: "/tmp/unused-traceme-key",
    };

    await expect(ensureDocumentEncryptionKey(env)).resolves.toMatchObject({
      generated: false,
      source: "environment",
    });
    expect(env.DOCUMENT_ENCRYPTION_KEY).toBe(
      "explicit-document-key-with-more-than-32-chars",
    );
  });
});
