type LoginAttempt = {
  count: number;
  resetAt: number;
};

const attempts = new Map<string, LoginAttempt>();

const WINDOW_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

export function checkLoginRateLimit(key: string, now = Date.now()) {
  const current = attempts.get(key);

  if (!current || current.resetAt <= now) {
    const resetAt = now + WINDOW_MS;
    attempts.set(key, { count: 1, resetAt });
    return { allowed: true, resetAt };
  }

  if (current.count >= MAX_ATTEMPTS) {
    return { allowed: false, resetAt: current.resetAt };
  }

  current.count += 1;
  attempts.set(key, current);
  return { allowed: true, resetAt: current.resetAt };
}

export function clearLoginRateLimitForTests() {
  attempts.clear();
}
