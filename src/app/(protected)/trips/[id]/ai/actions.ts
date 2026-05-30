"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import {
  buildAiNoteDraft,
  buildPromptStorageInput,
  buildSystemPrompt,
  buildUserPrompt,
  createConfiguredAiProvider,
  findSensitivePromptLabels,
  getAiTaskDefinition,
  isAiTaskType,
  signAiDraft,
  summarizePromptForStorage,
  summarizeResponseForStorage,
  verifyAiDraftSignature,
  type AiPromptFieldValue,
  type AiTaskType,
} from "@/lib/ai";
import {
  applyAiDraftToTrip,
  buildAdvancedAiPrompt,
  buildAiDraftText,
  createMockStructuredDraft,
  getAdvancedAiTaskDefinition,
  isAdvancedAiTaskType,
  minimizeTripForAi,
  parseStructuredAiDraft,
  type AdvancedAiTaskType,
} from "@/lib/ai/advanced";
import { prisma } from "@/lib/prisma";
import { resolveAiProviderConfig } from "@/server/services/ai/provider-config";
import {
  getAiPromptTemplates,
  isAiEnabledByUserSetting,
} from "@/server/services/ai/settings";

export type AiDraftActionState = {
  conversationId?: string;
  error?: string;
  result?: string;
  resultSignature?: string;
  taskLabel?: string;
  taskType?: AiTaskType;
};

export type SaveAiNoteActionState = {
  error?: string;
  message?: string;
  noteId?: string;
};

export async function generateAdvancedAiDraftAction(
  tripId: string,
  formData: FormData,
) {
  const taskTypeValue = formValue(formData, "advancedTaskType");

  if (!isAdvancedAiTaskType(taskTypeValue)) {
    redirectWithAiMessage(tripId, "error", "请选择有效的高级 AI 任务。");
  }

  if (!(await isAiEnabledByUserSetting())) {
    redirectWithAiMessage(tripId, "error", "AI 功能已关闭。");
  }

  const providerConfig = await resolveAiProviderConfig();

  if (!providerConfig.apiKeyConfigured) {
    redirectWithAiMessage(
      tripId,
      "error",
      "未配置 AI 服务，请在设置中配置 provider 或启用 mock provider。",
    );
  }

  const trip = await requireTripWithAiContext(tripId);
  const task = getAdvancedAiTaskDefinition(taskTypeValue);
  const promptTemplates = await getAiPromptTemplates();
  const context = minimizeTripForAi(trip);
  const userPrompt = buildAdvancedAiPrompt({
    context,
    taskType: taskTypeValue,
    template: promptTemplates[taskTypeValue],
  });
  let structured: ReturnType<typeof createMockStructuredDraft>;

  try {
    structured =
      providerConfig.provider === "mock"
        ? createMockStructuredDraft(taskTypeValue, context)
        : await generateStructuredDraftWithProvider(
            taskTypeValue,
            task.label,
            userPrompt,
            providerConfig,
          );
  } catch (error) {
    console.error("Advanced AI draft generation failed.", {
      message: error instanceof Error ? error.message : "Unknown error",
      provider: providerConfig.provider,
      taskType: taskTypeValue,
    });
    redirectWithAiMessage(
      tripId,
      "error",
      "AI 结构化草稿生成失败，请检查 provider 配置后重试。",
    );
  }

  const title = `${task.label} - ${formatDate(new Date())}`;
  const contentText = buildAiDraftText(title, structured);

  await prisma.aiDraft.create({
    data: {
      contentJson: structured,
      contentText,
      title,
      tripId,
      type: taskTypeValue,
    },
  });

  revalidatePath(`/trips/${tripId}/ai`);
  redirectWithAiMessage(tripId, "message", "AI 结构化草稿已生成，请预览后再应用。");
}

export async function applyAdvancedAiDraftAction(tripId: string, draftId: string) {
  await requireTrip(tripId);
  const draft = await prisma.aiDraft.findFirst({
    where: { id: draftId, tripId },
  });

  if (!draft) {
    redirectWithAiMessage(tripId, "error", "AI 草稿不存在或已删除。");
  }

  let result: Awaited<ReturnType<typeof applyAiDraftToTrip>>;

  try {
    result = await prisma.$transaction((tx) =>
      applyAiDraftToTrip(tx, draft),
    );
  } catch (error) {
    redirectWithAiMessage(
      tripId,
      "error",
      error instanceof Error ? error.message : "AI 草稿应用失败。",
    );
  }

  revalidatePath(`/trips/${tripId}/ai`);
  revalidatePath(`/trips/${tripId}/checklist`);
  revalidatePath(`/trips/${tripId}/notes`);
  revalidatePath(`/trips/${tripId}`);
  redirectWithAiMessage(
    tripId,
    "message",
    result.checklistItemsCreated > 0
      ? `已应用清单草稿，新增 ${result.checklistItemsCreated} 个清单项。`
      : "AI 草稿已应用。",
  );
}

export async function dismissAdvancedAiDraftAction(tripId: string, draftId: string) {
  await requireTrip(tripId);
  await prisma.aiDraft.updateMany({
    data: { status: "dismissed" },
    where: { id: draftId, tripId, status: "draft" },
  });

  revalidatePath(`/trips/${tripId}/ai`);
  redirectWithAiMessage(tripId, "message", "AI 草稿已删除。");
}

export async function generateAiDraftAction(
  tripId: string,
  _previousState: AiDraftActionState,
  formData: FormData,
): Promise<AiDraftActionState> {
  const trip = await requireTrip(tripId);
  const taskTypeValue = formValue(formData, "taskType");

  if (!isAiTaskType(taskTypeValue)) {
    return { error: "请选择有效的 AI 任务类型。" };
  }

  const task = getAiTaskDefinition(taskTypeValue);
  const fieldValues = extractTaskFieldValues(task, formData);
  const additionalInput = formValue(formData, "additionalPrompt").trim();
  const promptStorageInput = buildPromptStorageInput({
    additionalInput,
    fieldValues,
  });
  const sensitiveScanInput = buildSensitiveScanInput(fieldValues, additionalInput);
  const validationError = validatePromptInput(fieldValues, additionalInput);

  if (validationError) {
    return { error: validationError, taskType: taskTypeValue };
  }

  const sensitiveLabels = findSensitivePromptLabels(sensitiveScanInput);

  if (sensitiveLabels.length > 0) {
    return {
      error: `检测到可能包含敏感信息（${sensitiveLabels.join("、")}），请删除后再生成。`,
      taskType: taskTypeValue,
    };
  }

  if (!(await isAiEnabledByUserSetting())) {
    return { error: "AI 功能已关闭。" };
  }

  const persistedConfig = await resolveAiProviderConfig();
  const config = {
    apiKey: persistedConfig.apiKey,
    configured: persistedConfig.apiKeyConfigured,
    model: persistedConfig.model,
    provider: persistedConfig.provider,
  };

  if (!config.configured) {
    return {
      error: "未配置 AI 服务，请在服务端配置 OPENAI_API_KEY、页面配置 API Key 或启用 mock provider。",
      taskType: taskTypeValue,
    };
  }

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt({
    additionalInput,
    fieldValues,
    taskType: taskTypeValue,
    trip: {
      baseCurrency: trip.baseCurrency,
      budgetAmount: trip.budgetAmount?.toString(),
      endDate: trip.endDate,
      homeCity: trip.homeCity,
      mainDestination: trip.mainDestination,
      startDate: trip.startDate,
      title: trip.title,
    },
  });
  const provider = createConfiguredAiProvider(config);

  try {
    const result = await provider.generateText({
      systemPrompt,
      task,
      userPrompt,
    });
    const conversation = await prisma.aiConversation.create({
      data: {
        promptRedacted: summarizePromptForStorage(
          taskTypeValue,
          promptStorageInput,
        ),
        purpose: taskTypeValue,
        responseSummary: summarizeResponseForStorage(result),
        title: task.label,
        tripId,
      },
    });

    revalidatePath(`/trips/${tripId}/ai`);

    return {
      conversationId: conversation.id,
      result,
      resultSignature: signAiDraft({
        content: result,
        conversationId: conversation.id,
        taskType: taskTypeValue,
        tripId,
      }),
      taskLabel: task.label,
      taskType: taskTypeValue,
    };
  } catch (error) {
    console.error("AI generation failed.", {
      message: error instanceof Error ? error.message : "Unknown error",
      provider: provider.name,
      taskType: taskTypeValue,
    });

    return {
      error: "AI 服务暂时不可用，请稍后重试。",
      taskLabel: task.label,
      taskType: taskTypeValue,
    };
  }
}

export async function saveAiDraftAsNoteAction(
  tripId: string,
  _previousState: SaveAiNoteActionState,
  formData: FormData,
): Promise<SaveAiNoteActionState> {
  await requireTrip(tripId);

  const taskTypeValue = formValue(formData, "taskType");
  const conversationId = formValue(formData, "conversationId");
  const content = formValue(formData, "content").trim();
  const signature = formValue(formData, "signature");

  if (!isAiTaskType(taskTypeValue)) {
    return { error: "无法识别 AI 任务类型，未保存笔记。" };
  }

  if (!conversationId) {
    return { error: "缺少 AI 生成记录，未保存笔记。" };
  }

  if (!content) {
    return { error: "没有可保存的 AI 草稿内容。" };
  }

  if (content.length > MAX_AI_RESULT_LENGTH) {
    return { error: `AI 草稿内容不能超过 ${MAX_AI_RESULT_LENGTH} 个字符。` };
  }

  const conversation = await prisma.aiConversation.findFirst({
    select: { id: true, purpose: true },
    where: { id: conversationId, tripId },
  });

  if (!conversation || conversation.purpose !== taskTypeValue) {
    return { error: "AI 生成记录不属于当前旅行，未保存笔记。" };
  }

  if (
    !verifyAiDraftSignature({
      content,
      conversationId,
      signature,
      taskType: taskTypeValue,
      tripId,
    })
  ) {
    return { error: "AI 草稿内容校验失败，未保存笔记。" };
  }

  const noteDraft = buildAiNoteDraft({
    responseText: content,
    taskType: taskTypeValue,
  });
  const note = await prisma.note.create({
    data: {
      content: noteDraft.content,
      tags: noteDraft.tags,
      title: noteDraft.title,
      tripId,
    },
  });

  revalidatePath(`/trips/${tripId}/ai`);
  revalidatePath(`/trips/${tripId}/notes`);
  revalidatePath(`/trips/${tripId}`);

  return {
    message: "已保存为笔记。",
    noteId: note.id,
  };
}

async function requireTrip(tripId: string) {
  await requireUser();
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });

  if (!trip) {
    notFound();
  }

  return trip;
}

async function requireTripWithAiContext(tripId: string) {
  await requireUser();
  const trip = await prisma.trip.findUnique({
    include: {
      categoryBudgets: true,
      checklistItems: true,
      destinations: true,
      expenses: true,
      itineraryDays: {
        include: {
          items: {
            orderBy: [{ sortOrder: "asc" }, { startTime: "asc" }],
          },
        },
        orderBy: { date: "asc" },
      },
      places: true,
      routePlans: true,
      transports: true,
      weatherSnapshots: {
        orderBy: { date: "asc" },
        take: 14,
      },
    },
    where: { id: tripId },
  });

  if (!trip) {
    notFound();
  }

  return trip;
}

function formValue(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

function extractTaskFieldValues(
  task: ReturnType<typeof getAiTaskDefinition>,
  formData: FormData,
): AiPromptFieldValue[] {
  return task.fields.map((field) => ({
    label: field.label,
    value: formValue(formData, `field-${field.key}`).trim(),
  }));
}

function validatePromptInput(
  fieldValues: AiPromptFieldValue[],
  additionalInput: string,
): string | null {
  const hasStructuredInput = fieldValues.some((field) => field.value);

  if (!hasStructuredInput && !additionalInput) {
    return "请至少填写一个任务字段或补充需求。";
  }

  const oversizedField = fieldValues.find(
    (field) => field.value.length > MAX_FIELD_LENGTH,
  );

  if (oversizedField) {
    return `${oversizedField.label}不能超过 ${MAX_FIELD_LENGTH} 个字符。`;
  }

  if (additionalInput.length > MAX_ADDITIONAL_PROMPT_LENGTH) {
    return `补充需求不能超过 ${MAX_ADDITIONAL_PROMPT_LENGTH} 个字符。`;
  }

  const totalLength =
    fieldValues.reduce((sum, field) => sum + field.value.length, 0) +
    additionalInput.length;

  if (totalLength > MAX_TOTAL_PROMPT_LENGTH) {
    return `本次需求总长度不能超过 ${MAX_TOTAL_PROMPT_LENGTH} 个字符。`;
  }

  return null;
}

function buildSensitiveScanInput(
  fieldValues: AiPromptFieldValue[],
  additionalInput: string,
): string {
  return [
    ...fieldValues.map((field) => `${field.label}: ${field.value}`),
    additionalInput,
  ].join("\n");
}

const MAX_FIELD_LENGTH = 500;
const MAX_ADDITIONAL_PROMPT_LENGTH = 1500;
const MAX_TOTAL_PROMPT_LENGTH = 4000;
const MAX_AI_RESULT_LENGTH = 20000;

async function generateStructuredDraftWithProvider(
  taskType: AdvancedAiTaskType,
  taskLabel: string,
  userPrompt: string,
  config: {
    apiKey?: string;
    model: string;
    provider: "mock" | "openai";
  },
) {
  const provider = createConfiguredAiProvider({
    apiKey: config.apiKey,
    configured: true,
    model: config.model,
    provider: config.provider,
  });
  const rawText = await provider.generateText({
    includeDraftNotice: false,
    maxOutputTokens: 2200,
    systemPrompt: [
      "你是旅行规划助手。",
      "输出必须是中文。",
      "不要编造确定事实，不确定时写明需要人工核验。",
      "不要索要或处理身份证、护照、银行卡、订单号、保险单号、手机号等敏感信息。",
      "本次必须只返回 JSON，不要返回 Markdown，不要添加 JSON 以外的说明文字。",
      "JSON 字段：notice、summary、findings、suggestions，可选 checklistItems、routeOptions、budgetRisks。",
    ].join("\n"),
    task: {
      fields: [],
      id: "travel-notes",
      label: taskLabel,
      outputSections: ["JSON 结构化建议"],
      placeholder: "",
    },
    userPrompt,
  });

  return parseStructuredAiDraft(taskType, rawText);
}

function redirectWithAiMessage(
  tripId: string,
  key: "error" | "message",
  message: string,
): never {
  redirect(`/trips/${tripId}/ai?${key}=${encodeURIComponent(message)}`);
}

function formatDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
