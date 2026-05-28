import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, KEY_LENGTH).toString("hex");

  return `scrypt:${salt}:${derivedKey}`;
}

export function verifyPassword(password: string, passwordHash: string): boolean {
  const [algorithm, salt, key] = passwordHash.split(":");

  if (algorithm !== "scrypt" || !salt || !key) {
    return false;
  }

  const expected = Buffer.from(key, "hex");
  const actual = scryptSync(password, salt, expected.length);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
