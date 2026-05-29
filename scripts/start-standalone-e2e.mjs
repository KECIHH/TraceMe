import path from "node:path";
import { pathToFileURL } from "node:url";

process.env.TRACEME_PROJECT_ROOT = process.cwd();

await import(pathToFileURL(path.join(process.cwd(), ".next", "standalone", "server.js")));
