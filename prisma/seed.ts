import { PrismaClient } from "@prisma/client";

import { hashPassword } from "../src/lib/auth/password";

const prisma = new PrismaClient();

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

  const adminUser = existingUser
    ? await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        displayName: existingUser.displayName ?? "TraceMe Admin",
        role: "ADMIN",
        ...(shouldResetPassword ? { passwordHash: hashPassword(password) } : {}),
      },
    })
    : await prisma.user.create({
      data: {
        username,
        passwordHash: hashPassword(password),
        displayName: "TraceMe Admin",
        role: "ADMIN",
      },
    });

  const tripsWithoutOwner = await prisma.trip.findMany({
    select: { id: true },
    where: {
      members: { none: { role: "OWNER" } },
    },
  });

  for (const trip of tripsWithoutOwner) {
    await prisma.tripMember.upsert({
      create: {
        canDownloadSensitiveDocuments: true,
        role: "OWNER",
        tripId: trip.id,
        userId: adminUser.id,
      },
      update: {
        canDownloadSensitiveDocuments: true,
        role: "OWNER",
      },
      where: { tripId_userId: { tripId: trip.id, userId: adminUser.id } },
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

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
