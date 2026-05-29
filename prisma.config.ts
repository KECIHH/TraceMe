import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node scripts/seed-admin.mjs",
  },
  engine: "classic",
  datasource: {
    url: process.env.DATABASE_URL ?? "file:./dev.db",
  },
});
