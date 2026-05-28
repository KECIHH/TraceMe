type DownloadAttempt = {
  count: number;
  resetAt: number;
};

const attempts = new Map<string, DownloadAttempt>();

export const DOCUMENT_DOWNLOAD_RATE_LIMIT_WINDOW_MS = 60 * 1000;
export const DOCUMENT_DOWNLOAD_RATE_LIMIT_MAX_REQUESTS = 30;

export function checkDocumentDownloadRateLimit(key: string, now = Date.now()) {
  removeExpiredAttempts(now);

  const current = attempts.get(key);

  if (!current || current.resetAt <= now) {
    const resetAt = now + DOCUMENT_DOWNLOAD_RATE_LIMIT_WINDOW_MS;
    attempts.set(key, { count: 1, resetAt });
    return { allowed: true, resetAt };
  }

  if (current.count >= DOCUMENT_DOWNLOAD_RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, resetAt: current.resetAt };
  }

  current.count += 1;
  attempts.set(key, current);
  return { allowed: true, resetAt: current.resetAt };
}

export function clearDocumentDownloadRateLimitForTests() {
  attempts.clear();
}

function removeExpiredAttempts(now: number) {
  for (const [key, attempt] of attempts) {
    if (attempt.resetAt <= now) {
      attempts.delete(key);
    }
  }
}
