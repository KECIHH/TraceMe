import { prisma } from "@/lib/prisma";

export const AI_ENABLED_SETTING_KEY = "ai.enabled";

export async function isAiEnabledByUserSetting(): Promise<boolean> {
  const setting = await prisma.appSetting.findUnique({
    where: { key: AI_ENABLED_SETTING_KEY },
  });

  return setting?.value !== "false";
}

export async function setAiEnabledByUserSetting(enabled: boolean) {
  return prisma.appSetting.upsert({
    create: { key: AI_ENABLED_SETTING_KEY, value: String(enabled) },
    update: { value: String(enabled) },
    where: { key: AI_ENABLED_SETTING_KEY },
  });
}
