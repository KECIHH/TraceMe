import { prisma } from "@/lib/prisma";
import {
  DEFAULT_AI_PROMPT_TEMPLATES,
  mergePromptTemplates,
  type AiPromptTemplates,
} from "@/lib/ai/advanced";

export const AI_ENABLED_SETTING_KEY = "ai.enabled";
export const AI_PROMPT_TEMPLATES_SETTING_KEY = "ai.promptTemplates";

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

export async function getAiPromptTemplates(): Promise<AiPromptTemplates> {
  const setting = await prisma.appSetting.findUnique({
    where: { key: AI_PROMPT_TEMPLATES_SETTING_KEY },
  });

  if (!setting) {
    return { ...DEFAULT_AI_PROMPT_TEMPLATES };
  }

  try {
    return mergePromptTemplates(JSON.parse(setting.value));
  } catch {
    return { ...DEFAULT_AI_PROMPT_TEMPLATES };
  }
}

export async function setAiPromptTemplates(templates: AiPromptTemplates) {
  return prisma.appSetting.upsert({
    create: {
      key: AI_PROMPT_TEMPLATES_SETTING_KEY,
      value: JSON.stringify(templates),
    },
    update: { value: JSON.stringify(templates) },
    where: { key: AI_PROMPT_TEMPLATES_SETTING_KEY },
  });
}
