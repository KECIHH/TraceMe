type LoginAttempt = {
  count: number;
  resetAt: number;
};

const attempts = new Map<string, LoginAttempt>();

export const LOGIN_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
export const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5;

export function checkLoginRateLimit(key: string, now = Date.now()) {
  const current = attempts.get(key);

  if (!current || current.resetAt <= now) {
    return { allowed: true, count: 0, resetAt: now + LOGIN_RATE_LIMIT_WINDOW_MS };
  }

  if (current.count >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS) {
    return { allowed: false, count: current.count, resetAt: current.resetAt };
  }

  return { allowed: true, count: current.count, resetAt: current.resetAt };
}

export function recordFailedLoginAttempt(key: string, now = Date.now()) {
  const current = attempts.get(key);

  if (!current || current.resetAt <= now) {
    const next = { count: 1, resetAt: now + LOGIN_RATE_LIMIT_WINDOW_MS };
    attempts.set(key, next);
    return next;
  }

  current.count += 1;
  attempts.set(key, current);
  return current;
}

export function clearLoginRateLimit(key: string) {
  attempts.delete(key);
}

export function clearLoginRateLimitForTests() {
  attempts.clear();
}
