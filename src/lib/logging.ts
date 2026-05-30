const SECRET_KEY_PATTERN =
  /(password|passcode|secret|token|session|cookie|api[_-]?key|authorization|document_encryption_key|encryption_key)/i;

export function redactForLogs(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return value
      .replace(/(sk-[A-Za-z0-9_-]{8,})/g, "[REDACTED_API_KEY]")
      .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]")
      .replace(/(password|token|api_key|key|secret)=([^&\s]+)/gi, "$1=[REDACTED]")
      .slice(0, 500);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redactForLogs(item));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        SECRET_KEY_PATTERN.test(key) ? "[REDACTED]" : redactForLogs(entry),
      ]),
    );
  }

  return String(value);
}

export function logError(event: string, details: Record<string, unknown>) {
  const redactedDetails = redactForLogs(details) as Record<string, unknown>;

  console.error(
    JSON.stringify({
      event,
      level: "error",
      timestamp: new Date().toISOString(),
      ...redactedDetails,
    }),
  );
}
