import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const standaloneDir = path.join(root, ".next", "standalone");
const standaloneNextDir = path.join(standaloneDir, ".next");
const sourceStaticDir = path.join(root, ".next", "static");
const targetStaticDir = path.join(standaloneNextDir, "static");
const publicDir = path.join(root, "public");
const targetPublicDir = path.join(standaloneDir, "public");

if (!existsSync(standaloneDir)) {
  throw new Error("Standalone build is missing. Run `npm run build` first.");
}

if (!existsSync(sourceStaticDir)) {
  throw new Error("Next static assets are missing. Run `npm run build` first.");
}

mkdirSync(standaloneNextDir, { recursive: true });
rmSync(targetStaticDir, { force: true, recursive: true });
cpSync(sourceStaticDir, targetStaticDir, { recursive: true });

if (existsSync(publicDir)) {
  rmSync(targetPublicDir, { force: true, recursive: true });
  cpSync(publicDir, targetPublicDir, { recursive: true });
}
