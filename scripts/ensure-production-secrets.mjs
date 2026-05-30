import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DOCUMENT_ENCRYPTION_KEY_ENV = "DOCUMENT_ENCRYPTION_KEY";
const DOCUMENT_ENCRYPTION_KEY_FILE_ENV = "DOCUMENT_ENCRYPTION_KEY_FILE";
const DEFAULT_DOCUMENT_ENCRYPTION_KEY_FILE =
  "/app/storage/secrets/document-encryption-key";
const MIN_KEY_LENGTH = 32;

/**
 * @param {Record<string, string | undefined>} [env]
 */
export async function ensureDocumentEncryptionKey(env = process.env) {
  const configuredKey = env[DOCUMENT_ENCRYPTION_KEY_ENV]?.trim();

  if (configuredKey) {
    return {
      generated: false,
      source: "environment",
    };
  }

  const keyFile =
    env[DOCUMENT_ENCRYPTION_KEY_FILE_ENV]?.trim() ||
    DEFAULT_DOCUMENT_ENCRYPTION_KEY_FILE;
  const existingKey = await readExistingKey(keyFile);

  if (existingKey) {
    env[DOCUMENT_ENCRYPTION_KEY_ENV] = existingKey;
    return {
      generated: false,
      keyFile,
      source: "file",
    };
  }

  const generatedKey = randomBytes(MIN_KEY_LENGTH).toString("base64url");
  await mkdir(dirname(keyFile), { recursive: true });

  try {
    await writeFile(keyFile, `${generatedKey}\n`, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (isFileExistsError(error)) {
      const racedKey = await readExistingKey(keyFile);
      if (racedKey) {
        env[DOCUMENT_ENCRYPTION_KEY_ENV] = racedKey;
        return {
          generated: false,
          keyFile,
          source: "file",
        };
      }
    }

    throw error;
  }

  await chmod(keyFile, 0o600).catch(() => undefined);
  env[DOCUMENT_ENCRYPTION_KEY_ENV] = generatedKey;
  console.log(
    "Generated DOCUMENT_ENCRYPTION_KEY in persistent secret storage. Back it up securely; changing it later makes encrypted uploads unreadable.",
  );

  return {
    generated: true,
    keyFile,
    source: "file",
  };
}

async function readExistingKey(keyFile) {
  try {
    await access(keyFile, constants.R_OK);
  } catch {
    return null;
  }

  const key = (await readFile(keyFile, "utf8")).trim();
  return key.length >= MIN_KEY_LENGTH ? key : null;
}

function isFileExistsError(error) {
  return error && typeof error === "object" && error.code === "EEXIST";
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  ensureDocumentEncryptionKey().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
