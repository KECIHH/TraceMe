import { randomBytes, scryptSync } from "node:crypto";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const KEY_LENGTH = 64;

async function main() {
  const username = process.env.INITIAL_ADMIN_USERNAME;
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  const shouldResetPassword = process.env.RESET_ADMIN_PASSWORD === "true";
  const shouldResetAiEnabled = process.env.RESET_AI_ENABLED === "true";

  if (!username || !password) {
    throw new Error(
      "INITIAL_ADMIN_USERNAME and INITIAL_ADMIN_PASSWORD must be set before seeding.",
    );
  }

  const existingUser = await prisma.user.findUnique({ where: { username } });

  if (existingUser) {
    await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        displayName: existingUser.displayName ?? "TraceMe Admin",
        role: "ADMIN",
        ...(shouldResetPassword ? { passwordHash: hashPassword(password) } : {}),
      },
    });
  } else {
    await prisma.user.create({
      data: {
        username,
        passwordHash: hashPassword(password),
        displayName: "TraceMe Admin",
        role: "ADMIN",
      },
    });
  }

  await prisma.appSetting.upsert({
    where: { key: "app.name" },
    update: { value: "TraceMe" },
    create: { key: "app.name", value: "TraceMe" },
  });

  const aiEnabledSetting = await prisma.appSetting.findUnique({
    where: { key: "ai.enabled" },
  });

  if (shouldResetAiEnabled && aiEnabledSetting) {
    await prisma.appSetting.update({
      where: { key: "ai.enabled" },
      data: { value: "true" },
    });
  } else if (!aiEnabledSetting) {
    await prisma.appSetting.create({
      data: { key: "ai.enabled", value: "true" },
    });
  }

  console.log(`Seed complete: admin user "${username}" is ready.`);
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, KEY_LENGTH).toString("hex");

  return `scrypt:${salt}:${derivedKey}`;
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
