import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();

run("node", ["scripts/validate-production-env.mjs"]);
run("node", ["scripts/ensure-sqlite-db.mjs"]);
run("npx", ["prisma", "migrate", "deploy"]);

await import(pathToFileURL(path.join(root, "server.js")));

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
