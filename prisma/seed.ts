import { PrismaClient } from "@prisma/client";

import { hashPassword } from "../src/lib/auth/password";

const prisma = new PrismaClient();

async function main() {
  const username = process.env.INITIAL_ADMIN_USERNAME;
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  const shouldResetPassword = process.env.RESET_ADMIN_PASSWORD === "true";

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

  console.log(`Seed complete: admin user "${username}" is ready.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
