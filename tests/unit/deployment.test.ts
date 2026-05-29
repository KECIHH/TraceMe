import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { securityHeaders } from "../../next.config";

const root = process.cwd();

function readProjectFile(filePath: string) {
  return readFileSync(path.join(root, filePath), "utf8");
}

describe("private deployment configuration", () => {
  it("keeps Docker Compose bound to localhost with persistent data volumes", () => {
    const compose = readProjectFile("docker-compose.yml");

    expect(compose).toContain("travel-planner:");
    expect(compose).toContain('"127.0.0.1:3000:3000"');
    expect(compose).not.toContain('"0.0.0.0:3000:3000"');
    expect(compose).toContain("DATABASE_URL: file:/app/prisma/data/traceme.db");
    expect(compose).not.toContain("DATABASE_URL: ${DATABASE_URL");
    expect(compose).toContain("sqlite-data:/app/prisma/data");
    expect(compose).toContain("uploads-data:/app/storage/uploads");
    expect(compose).toContain("backups-data:/app/storage/backups");
    expect(compose).toContain("env_file:");
  });

  it("excludes secrets and private files from the Docker build context", () => {
    const dockerignore = readProjectFile(".dockerignore");

    expect(dockerignore).toContain(".env");
    expect(dockerignore).toContain("storage/uploads/*");
    expect(dockerignore).toContain("storage/backups/*");
  });

  it("starts the container with migration deploy but does not auto-seed", () => {
    const dockerfile = readProjectFile("Dockerfile");
    const commandLine = dockerfile
      .split(/\r?\n/)
      .find((line) => line.startsWith("CMD ")) ?? "";

    expect(commandLine).toContain("prisma migrate deploy");
    expect(commandLine).not.toContain("seed-admin");
    expect(dockerfile).toContain("USER nextjs");
    expect(dockerfile).toContain("EXPOSE 3000");
    expect(dockerfile).toContain("scripts/validate-production-env.mjs");
    expect(dockerfile).not.toContain("COPY --from=builder /app/scripts ./scripts");
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
      ]),
    );
  });
});
