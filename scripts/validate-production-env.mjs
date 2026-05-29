const DEFAULT_SESSION_SECRET = "replace-with-a-long-random-secret";
const DEFAULT_ADMIN_PASSWORD = "change-me-before-use";
const MIN_SESSION_SECRET_LENGTH = 32;
const MIN_INITIAL_ADMIN_PASSWORD_LENGTH = 12;

const errors = validateProductionEnvironment(process.env);

if (errors.length > 0) {
  console.error("Invalid production environment:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Production environment looks valid.");

function validateProductionEnvironment(env) {
  const errors = [];

  requireValue(errors, env, "DATABASE_URL");
  requireUrl(errors, env, "APP_BASE_URL");
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

  const initialAdminPassword = requireValue(
    errors,
    env,
    "INITIAL_ADMIN_PASSWORD",
  );
  if (initialAdminPassword) {
    if (initialAdminPassword.length < MIN_INITIAL_ADMIN_PASSWORD_LENGTH) {
      errors.push(
        `INITIAL_ADMIN_PASSWORD must be at least ${MIN_INITIAL_ADMIN_PASSWORD_LENGTH} characters.`,
      );
    }
    if (initialAdminPassword === DEFAULT_ADMIN_PASSWORD) {
      errors.push("INITIAL_ADMIN_PASSWORD must not use the example value.");
    }
  }

  return errors;
}

function requireValue(errors, env, key) {
  const value = env[key]?.trim();

  if (!value) {
    errors.push(`${key} is required.`);
    return null;
  }

  return value;
}

function requireUrl(errors, env, key) {
  const value = requireValue(errors, env, key);

  if (!value) {
    return;
  }

  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) {
      errors.push(`${key} must use http or https.`);
    }
  } catch {
    errors.push(`${key} must be a valid URL.`);
  }
}
