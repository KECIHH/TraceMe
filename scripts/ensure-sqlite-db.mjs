import { closeSync, mkdirSync, openSync } from "node:fs";
import path from "node:path";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl?.startsWith("file:")) {
  process.exit(0);
}

const sqlitePath = databaseUrl.slice("file:".length);
const resolvedPath = path.isAbsolute(sqlitePath)
  ? sqlitePath
  : path.resolve(process.cwd(), "prisma", sqlitePath);

mkdirSync(path.dirname(resolvedPath), { recursive: true });
closeSync(openSync(resolvedPath, "a"));
