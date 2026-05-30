import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { metadata } from "../../src/app/layout";
import { securityHeaders } from "../../next.config";

const root = process.cwd();

function readProjectFile(filePath: string) {
  return readFileSync(path.join(root, filePath), "utf8");
}

describe("private deployment configuration", () => {
  it("keeps Docker Compose bound to localhost with persistent data volumes", () => {
    const compose = readProjectFile("docker-compose.yml");

    expect(compose).toContain("travel-planner:");
    expect(compose).toContain("image: ${TRACEME_IMAGE:-ghcr.io/kecihh/traceme:main}");
    expect(compose).toContain("ALPINE_REPOSITORY_MIRROR:");
    expect(compose).toContain("BUILD_NODE_OPTIONS:");
    expect(compose).toContain("NPM_CONFIG_REGISTRY:");
    expect(compose).toContain(
      '"${TRACEME_BIND:-127.0.0.1}:${TRACEME_PORT:-3000}:3000"',
    );
    expect(compose).not.toContain('"0.0.0.0:3000:3000"');
    expect(compose).toContain("DATABASE_URL: file:/app/prisma/data/traceme.db");
    expect(compose).not.toContain("DATABASE_URL: ${DATABASE_URL");
    expect(compose).toContain("APP_BASE_URL: ${APP_BASE_URL:?");
    expect(compose).toContain("DOCUMENT_ENCRYPTION_KEY: ${DOCUMENT_ENCRYPTION_KEY:-}");
    expect(compose).not.toContain("DOCUMENT_ENCRYPTION_KEY: ${DOCUMENT_ENCRYPTION_KEY:?");
    expect(compose).toContain(
      "DOCUMENT_ENCRYPTION_KEY_FILE: /app/storage/secrets/document-encryption-key",
    );
    expect(compose).toContain("sqlite-data:/app/prisma/data");
    expect(compose).toContain("uploads-data:/app/storage/uploads");
    expect(compose).toContain("backups-data:/app/storage/backups");
    expect(compose).toContain("secrets-data:/app/storage/secrets");
    expect(compose).not.toContain("env_file:");
    expect(compose).toContain("seed-admin:");
    expect(compose).toContain("profiles:");

    const travelPlannerService = compose
      .split("  travel-planner:")[1]
      ?.split("  seed-admin:")[0];
    expect(travelPlannerService).toBeDefined();
    expect(travelPlannerService).not.toContain("INITIAL_ADMIN_PASSWORD");
  });

  it("excludes secrets and private files from the Docker build context", () => {
    const dockerignore = readProjectFile(".dockerignore");

    expect(dockerignore).toContain(".env");
    expect(dockerignore).toContain("storage/uploads/*");
    expect(dockerignore).toContain("storage/backups/*");
    expect(dockerignore).toContain("storage/secrets/*");
  });

  it("starts the container with migration deploy but does not auto-seed", () => {
    const dockerfile = readProjectFile("Dockerfile");
    const startScript = readProjectFile("scripts/start-production.mjs");

    expect(startScript.indexOf("ensureDocumentEncryptionKey")).toBeLessThan(
      startScript.indexOf("scripts/validate-production-env.mjs"),
    );
    expect(startScript).toContain("scripts/validate-production-env.mjs");
    expect(startScript).toContain('"migrate", "deploy"');
    expect(startScript).not.toContain("seed-admin");
    expect(dockerfile).toContain("USER nextjs");
    expect(dockerfile).toContain("EXPOSE 3000");
    expect(dockerfile).toContain("ARG BUILD_NODE_OPTIONS");
    expect(dockerfile).toContain("npm prune --omit=dev");
    expect(dockerfile).toContain("scripts/ensure-production-secrets.mjs");
    expect(dockerfile).toContain("scripts/validate-production-env.mjs");
    expect(dockerfile).toContain("scripts/start-production.mjs");
    expect(dockerfile).toContain('CMD ["node", "scripts/start-production.mjs"]');
    expect(dockerfile).not.toContain("COPY --from=builder /app/scripts ./scripts");
  });

  it("includes one-command bootstrap scripts for server and Windows installs", () => {
    const linuxBootstrap = readProjectFile("scripts/bootstrap-linux.sh");
    const windowsBootstrap = readProjectFile("scripts/bootstrap-windows.ps1");

    expect(linuxBootstrap).toContain("https://github.com/KECIHH/TraceMe.git");
    expect(linuxBootstrap).toContain("TRACEME_IMAGE:-ghcr.io/kecihh/traceme:main");
    expect(linuxBootstrap).toContain("docker compose up -d --no-build");
    expect(linuxBootstrap).toContain("ensure_swap");
    expect(linuxBootstrap).toContain("DOCKER_BUILDKIT=0 COMPOSE_DOCKER_CLI_BUILD=0");
    expect(linuxBootstrap).toContain("timeout \"$BUILD_ATTEMPT_TIMEOUT\" docker compose build travel-planner");
    expect(linuxBootstrap).not.toContain("timeout \"$BUILD_ATTEMPT_TIMEOUT\" docker_compose");
    expect(linuxBootstrap).toContain("docker_compose run --rm seed-admin");
    expect(linuxBootstrap).toContain("TRACEME_BIND:-127.0.0.1");
    expect(linuxBootstrap).toContain("Updated APP_BASE_URL in $env_file.");
    expect(linuxBootstrap).toContain("Invalid APP_BASE_URL in $INSTALL_DIR/.env");
    expect(linuxBootstrap).toContain("ensure_document_encryption_key_ready \".env\"");
    expect(linuxBootstrap).toContain("Generated DOCUMENT_ENCRYPTION_KEY in $env_file");
    expect(linuxBootstrap).not.toContain('DOCUMENT_ENCRYPTION_KEY="${DOCUMENT_ENCRYPTION_KEY:-}"');

    expect(windowsBootstrap).toContain("https://github.com/KECIHH/TraceMe.git");
    expect(windowsBootstrap).toContain("ghcr.io/kecihh/traceme:main");
    expect(windowsBootstrap).toContain("docker compose up -d --no-build");
    expect(windowsBootstrap).toContain("docker compose up -d --build");
    expect(windowsBootstrap).toContain("docker compose run --rm seed-admin");
    expect(windowsBootstrap).toContain('"127.0.0.1"');
    expect(windowsBootstrap).toContain("Updated APP_BASE_URL in $Path.");
    expect(windowsBootstrap).toContain("Invalid APP_BASE_URL in $InstallDir\\.env");
    expect(windowsBootstrap).toContain('Ensure-DocumentEncryptionKeyReady -Path ".env"');
    expect(windowsBootstrap).toContain("Generated DOCUMENT_ENCRYPTION_KEY in $Path");
    expect(windowsBootstrap).not.toContain(
      '$documentEncryptionKey = if ($env:DOCUMENT_ENCRYPTION_KEY) { $env:DOCUMENT_ENCRYPTION_KEY } else { "" }',
    );
  });
});

describe("security headers", () => {
  it("sets basic hardening headers for all routes", () => {
    expect(securityHeaders).toEqual(
      expect.arrayContaining([
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=()",
        },
        {
          key: "Content-Security-Policy",
          value: expect.stringContaining("frame-ancestors 'none'"),
        },
      ]),
    );
  });
});

describe("robots and indexing policy", () => {
  it("blocks search engines by default", () => {
    const robots = readProjectFile("public/robots.txt");

    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Disallow: /");
  });

  it("marks pages as noindex by default", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
