export type AppEnvironment = Record<string, string | undefined>;

export type EnvironmentValidationResult = {
  ok: boolean;
  errors: string[];
};

export type EnvironmentValidationOptions = {
  requireInitialAdminPassword?: boolean;
};

const DEFAULT_SESSION_SECRET = "replace-with-a-long-random-secret";
const DEFAULT_ADMIN_PASSWORD = "change-me-before-use";
const MIN_SESSION_SECRET_LENGTH = 32;
const MIN_INITIAL_ADMIN_PASSWORD_LENGTH = 12;

export function validateProductionEnvironment(
  env: AppEnvironment = process.env,
  options: EnvironmentValidationOptions = {},
): EnvironmentValidationResult {
  const errors: string[] = [];

  requireValue(errors, env, "DATABASE_URL");
  requireAppBaseUrl(errors, env);
  const nodeEnv = requireValue(errors, env, "NODE_ENV");
  if (nodeEnv && nodeEnv !== "production") {
    errors.push("NODE_ENV must be production for private deployment.");
  }

  const sessionSecret = requireValue(errors, env, "SESSION_SECRET");
  if (sessionSecret) {
    if (sessionSecret.length < MIN_SESSION_SECRET_LENGTH) {
      errors.push(
        `SESSION_SECRET must be at least ${MIN_SESSION_SECRET_LENGTH} characters.`,
      );
    }
    if (sessionSecret === DEFAULT_SESSION_SECRET) {
      errors.push("SESSION_SECRET must not use the example value.");
    }
  }

  requireValue(errors, env, "INITIAL_ADMIN_USERNAME");

  validateInitialAdminPassword(errors, env, options.requireInitialAdminPassword);

  return { ok: errors.length === 0, errors };
}

function requireValue(
  errors: string[],
  env: AppEnvironment,
  key: string,
): string | null {
  const value = env[key]?.trim();

  if (!value) {
    errors.push(`${key} is required.`);
    return null;
  }

  return value;
}

function requireAppBaseUrl(errors: string[], env: AppEnvironment) {
  const value = requireValue(errors, env, "APP_BASE_URL");

  if (!value) {
    return;
  }

  try {
    const url = new URL(value);
    if (url.protocol === "https:") {
      return;
    }

    if (url.protocol === "http:" && isLoopbackHost(url.hostname)) {
      return;
    }

    errors.push(
      "APP_BASE_URL must use https in production, except loopback HTTP for local smoke tests.",
    );
  } catch {
    errors.push("APP_BASE_URL must be a valid URL.");
  }
}

function isLoopbackHost(hostname: string) {
  return ["localhost", "127.0.0.1", "::1"].includes(hostname.toLowerCase());
}

function validateInitialAdminPassword(
  errors: string[],
  env: AppEnvironment,
  required = false,
) {
  const initialAdminPassword = env.INITIAL_ADMIN_PASSWORD?.trim();

  if (!initialAdminPassword) {
    if (required) {
      errors.push("INITIAL_ADMIN_PASSWORD is required when seeding admin.");
    }
    return;
  }

  if (initialAdminPassword.length < MIN_INITIAL_ADMIN_PASSWORD_LENGTH) {
    errors.push(
      `INITIAL_ADMIN_PASSWORD must be at least ${MIN_INITIAL_ADMIN_PASSWORD_LENGTH} characters.`,
    );
  }
  if (initialAdminPassword === DEFAULT_ADMIN_PASSWORD) {
    errors.push("INITIAL_ADMIN_PASSWORD must not use the example value.");
  }
}
