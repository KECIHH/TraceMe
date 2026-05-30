const DEFAULT_SESSION_SECRET = "replace-with-a-long-random-secret";
const DEFAULT_ADMIN_PASSWORD = "change-me-before-use";
const MIN_SESSION_SECRET_LENGTH = 32;
const MIN_INITIAL_ADMIN_PASSWORD_LENGTH = 12;

const requireInitialAdminPassword = process.argv.includes("--seed");
const errors = validateProductionEnvironment(process.env, {
  requireInitialAdminPassword,
});

if (errors.length > 0) {
  console.error("Invalid production environment:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Production environment looks valid.");

function validateProductionEnvironment(env, options = {}) {
  const errors = [];

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
  validateDocumentEncryptionKey(errors, env);

  validateInitialAdminPassword(
    errors,
    env,
    options.requireInitialAdminPassword,
  );

  return errors;
}

function validateDocumentEncryptionKey(errors, env) {
  const key = env.DOCUMENT_ENCRYPTION_KEY?.trim();

  if (!key) {
    errors.push("DOCUMENT_ENCRYPTION_KEY is required to prevent uploaded files from being stored in plaintext. Generate it once with `openssl rand -base64 32`, save it in the server .env, and keep the same value across updates.");
    return;
  }

  if (!/^[a-f0-9]{64}$/i.test(key) && key.length < 32) {
    errors.push("DOCUMENT_ENCRYPTION_KEY must be 64 hex characters, 32 raw bytes encoded as base64/base64url, or at least 32 UTF-8 characters.");
  }
}

function requireValue(errors, env, key) {
  const value = env[key]?.trim();

  if (!value) {
    errors.push(`${key} is required.`);
    return null;
  }

  return value;
}

function requireAppBaseUrl(errors, env) {
  const value = requireValue(errors, env, "APP_BASE_URL");

  if (!value) {
    return;
  }

  try {
    const url = new URL(value);
    if (url.protocol === "https:") {
      return;
    }

    if (url.protocol === "http:" && isAllowedHttpHost(url.hostname)) {
      return;
    }

    errors.push(
      "APP_BASE_URL must use https for domain access; HTTP is only allowed for IP or loopback testing.",
    );
  } catch {
    errors.push("APP_BASE_URL must be a valid URL.");
  }
}

function isAllowedHttpHost(hostname) {
  const normalized = normalizeHostname(hostname);

  return (
    ["localhost", "127.0.0.1", "::1"].includes(normalized) ||
    isIpv4Address(normalized) ||
    isIpv6Address(normalized)
  );
}

function normalizeHostname(hostname) {
  return hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
}

function isIpv4Address(hostname) {
  const parts = hostname.split(".");

  return (
    parts.length === 4 &&
    parts.every((part) => {
      if (!/^\d{1,3}$/.test(part)) {
        return false;
      }

      const value = Number(part);
      return value >= 0 && value <= 255;
    })
  );
}

function isIpv6Address(hostname) {
  return /^[0-9a-f:]+$/.test(hostname) && hostname.includes(":");
}

function validateInitialAdminPassword(errors, env, required = false) {
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
