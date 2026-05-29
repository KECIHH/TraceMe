"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import {
  buildAiNoteDraft,
  buildPromptStorageInput,
  buildSystemPrompt,
  buildUserPrompt,
  createAiProvider,
  findSensitivePromptLabels,
  getAiProviderConfig,
  getAiTaskDefinition,
  isAiTaskType,
  signAiDraft,
  summarizePromptForStorage,
  summarizeResponseForStorage,
  verifyAiDraftSignature,
  type AiPromptFieldValue,
  type AiTaskType,
} from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { isAiEnabledByUserSetting } from "@/server/services/ai/settings";

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
  const validationError = validatePromptInput(fieldValues, additionalInput);

  if (validationError) {
    return { error: validationError, taskType: taskTypeValue };
  }

  const sensitiveLabels = findSensitivePromptLabels(promptStorageInput);

  if (sensitiveLabels.length > 0) {
    return {
      error: `检测到可能包含敏感信息（${sensitiveLabels.join("、")}），请删除后再生成。`,
      taskType: taskTypeValue,
    };
  }

  if (!(await isAiEnabledByUserSetting())) {
    return { error: "AI 功能已关闭。" };
  }

  const config = getAiProviderConfig();

  if (!config.configured) {
    return {
      error:
        config.reason === "AI 功能已关闭"
          ? config.reason
          : "未配置 AI 服务，请在服务端配置 OPENAI_API_KEY 或启用 mock provider。",
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
  const provider = createAiProvider();

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

const MAX_FIELD_LENGTH = 500;
const MAX_ADDITIONAL_PROMPT_LENGTH = 1500;
const MAX_TOTAL_PROMPT_LENGTH = 4000;
const MAX_AI_RESULT_LENGTH = 20000;
