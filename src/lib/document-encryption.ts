import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { sha256Hex } from "@/lib/crypto-utils";

export const DOCUMENT_ENCRYPTION_ALGORITHM = "aes-256-gcm";
export const DOCUMENT_ENCRYPTION_VERSION = 1;
export const DOCUMENT_ENCRYPTION_KEY_ENV = "DOCUMENT_ENCRYPTION_KEY";

const KEY_BYTES = 32;
const IV_BYTES = 12;

export type DocumentEncryptionMetadata = {
  encryptionAlgorithm: typeof DOCUMENT_ENCRYPTION_ALGORITHM;
  encryptionAuthTag: string;
  encryptionIv: string;
  encryptionVersion: typeof DOCUMENT_ENCRYPTION_VERSION;
  encryptedFileSize: number;
  fileSha256: string;
  isEncrypted: true;
};

export type EncryptedDocument = DocumentEncryptionMetadata & {
  ciphertext: Buffer;
};

export function getDocumentEncryptionKey(
  env: Record<string, string | undefined> = process.env,
): Buffer | null {
  const raw = env[DOCUMENT_ENCRYPTION_KEY_ENV]?.trim();

  if (!raw) {
    return null;
  }

  if (/^[a-f0-9]{64}$/i.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  const base64 = tryDecodeBase64Key(raw);
  if (base64) {
    return base64;
  }

  if (Buffer.byteLength(raw, "utf8") >= KEY_BYTES) {
    return createHash("sha256").update(raw, "utf8").digest();
  }

  return null;
}

export function getDocumentEncryptionStatus(
  env: Record<string, string | undefined> = process.env,
) {
  const configured = Boolean(env[DOCUMENT_ENCRYPTION_KEY_ENV]?.trim());
  const key = getDocumentEncryptionKey(env);

  return {
    configured,
    ready: Boolean(key),
    message: !configured
      ? `${DOCUMENT_ENCRYPTION_KEY_ENV} is not configured.`
      : key
        ? "Document encryption is configured."
        : `${DOCUMENT_ENCRYPTION_KEY_ENV} must be 64 hex chars, 32 raw bytes encoded as base64/base64url, or at least 32 UTF-8 characters.`,
  };
}

export function requireDocumentEncryptionKey(): Buffer {
  const key = getDocumentEncryptionKey();

  if (!key) {
    throw new Error(
      `${DOCUMENT_ENCRYPTION_KEY_ENV} is required before uploading encrypted documents.`,
    );
  }

  return key;
}

export function encryptDocumentBuffer(
  plaintext: Buffer | Uint8Array,
  key = requireDocumentEncryptionKey(),
): EncryptedDocument {
  const input = Buffer.from(plaintext);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(DOCUMENT_ENCRYPTION_ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(input), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext,
    encryptedFileSize: ciphertext.length,
    encryptionAlgorithm: DOCUMENT_ENCRYPTION_ALGORITHM,
    encryptionAuthTag: authTag.toString("base64url"),
    encryptionIv: iv.toString("base64url"),
    encryptionVersion: DOCUMENT_ENCRYPTION_VERSION,
    fileSha256: sha256Hex(input),
    isEncrypted: true,
  };
}

export function decryptDocumentBuffer(
  ciphertext: Buffer | Uint8Array,
  metadata: {
    encryptionAlgorithm: string | null;
    encryptionAuthTag: string | null;
    encryptionIv: string | null;
  },
  key = requireDocumentEncryptionKey(),
): Buffer {
  if (metadata.encryptionAlgorithm !== DOCUMENT_ENCRYPTION_ALGORITHM) {
    throw new Error("Unsupported document encryption algorithm.");
  }

  if (!metadata.encryptionIv || !metadata.encryptionAuthTag) {
    throw new Error("Encrypted document metadata is incomplete.");
  }

  const decipher = createDecipheriv(
    DOCUMENT_ENCRYPTION_ALGORITHM,
    key,
    Buffer.from(metadata.encryptionIv, "base64url"),
  );

  decipher.setAuthTag(Buffer.from(metadata.encryptionAuthTag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext)),
    decipher.final(),
  ]);
}

function tryDecodeBase64Key(raw: string): Buffer | null {
  const normalized = raw.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );

  if (!/^[a-z0-9+/]+={0,2}$/i.test(padded)) {
    return null;
  }

  try {
    const decoded = Buffer.from(padded, "base64");
    return decoded.length === KEY_BYTES ? decoded : null;
  } catch {
    return null;
  }
}
