"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import {
  applyAiPlanDraft,
  formDataToAiPlanInput,
  generateStructuredTripPlan,
  normalizeAiPlanInput,
  sanitizeAiPlanInput,
  structuredPlanToJson,
  validateAiPlanInput,
  type AiPlanInput,
} from "@/lib/ai-plan";
import { prisma } from "@/lib/prisma";

import type { AiPlanActionState } from "./action-state";

export async function createAiPlanDraftAction(
  _previousState: AiPlanActionState,
  formData: FormData,
): Promise<AiPlanActionState> {
  await requireUser();

  const values = formDataToAiPlanInput(formData);
  const validation = validateAiPlanInput(values);

  if (!validation.ok) {
    return {
      errors: validation.errors,
      message: "请修正 AI 规划输入中的问题。",
      values: validation.values,
    };
  }

  let draftId: string;

  try {
    const result = await generateStructuredTripPlan(validation.values);
    const draft = await prisma.aiPlanDraft.create({
      data: {
        draftJson: structuredPlanToJson(result.plan),
        inputJson: sanitizeAiPlanInput(validation.values),
        model: result.model,
        provider: result.provider,
        status: "draft",
      },
      select: { id: true },
    });
    draftId = draft.id;
  } catch (error) {
    return {
      errors: {},
      message:
        error instanceof Error
          ? error.message
          : "AI 生成失败，请稍后重试或使用 mock provider。",
      values: validation.values,
    };
  }

  revalidatePath("/trips/ai-plan");
  redirect(`/trips/ai-plan?draftId=${draftId}`);
}

export async function applyAiPlanDraftAction(draftId: string) {
  await requireUser();

  const draft = await prisma.aiPlanDraft.findUnique({
    where: { id: draftId },
  });

  if (!draft) {
    redirect("/trips/ai-plan?error=草稿不存在或已被删除");
  }

  let tripId: string;

  try {
    tripId = await prisma.$transaction((tx) => applyAiPlanDraft(tx, draft));

    revalidatePath("/dashboard");
    revalidatePath("/trips");
    revalidatePath(`/trips/${tripId}`);
  } catch (error) {
    await prisma.aiPlanDraft.update({
      data: {
        errorMessage:
          error instanceof Error ? error.message : "草稿写入正式数据失败。",
        status: "failed",
      },
      where: { id: draftId },
    });
    redirect(`/trips/ai-plan?draftId=${draftId}&error=草稿写入失败，请重新生成`);
  }

  redirect(`/trips/${tripId}`);
}

export async function regenerateAiPlanDraftAction(draftId: string) {
  await requireUser();

  const draft = await prisma.aiPlanDraft.findUnique({
    where: { id: draftId },
  });

  if (!draft) {
    redirect("/trips/ai-plan?error=草稿不存在或已被删除");
  }

  const values = jsonToAiPlanInput(draft.inputJson);
  const validation = validateAiPlanInput(values);

  if (!validation.ok) {
    redirect(`/trips/ai-plan?draftId=${draftId}&edit=1&error=原始输入需要修正`);
  }

  try {
    const result = await generateStructuredTripPlan(validation.values);
    await prisma.aiPlanDraft.update({
      data: {
        draftJson: structuredPlanToJson(result.plan),
        errorMessage: null,
        inputJson: sanitizeAiPlanInput(validation.values),
        model: result.model,
        provider: result.provider,
        status: "draft",
      },
      where: { id: draftId },
    });
  } catch (error) {
    await prisma.aiPlanDraft.update({
      data: {
        errorMessage:
          error instanceof Error ? error.message : "AI 重新生成失败。",
        status: "failed",
      },
      where: { id: draftId },
    });
  }

  revalidatePath("/trips/ai-plan");
  redirect(`/trips/ai-plan?draftId=${draftId}`);
}

export async function discardAiPlanDraftAction(draftId: string) {
  await requireUser();

  await prisma.aiPlanDraft.update({
    data: { status: "discarded" },
    where: { id: draftId },
  });

  revalidatePath("/trips/ai-plan");
  redirect("/trips/ai-plan?message=AI 草稿已丢弃");
}

function jsonToAiPlanInput(value: unknown): AiPlanInput {
  if (!isRecord(value)) {
    return normalizeAiPlanInput({
      avoid: "",
      budgetAmount: "",
      companions: "",
      destination: "",
      endDate: "",
      homeCity: "",
      mustVisit: "",
      pace: "balanced",
      people: "",
      preferences: [],
      startDate: "",
      stayPreferences: [],
      transportPreferences: [],
    });
  }

  return normalizeAiPlanInput({
    avoid: stringValue(value.avoid),
    budgetAmount: stringValue(value.budgetAmount),
    companions: stringValue(value.companions),
    destination: stringValue(value.destination),
    endDate: stringValue(value.endDate),
    homeCity: stringValue(value.homeCity),
    mustVisit: stringValue(value.mustVisit),
    pace: stringValue(value.pace) as AiPlanInput["pace"],
    people: stringValue(value.people),
    preferences: stringArray(value.preferences),
    startDate: stringValue(value.startDate),
    stayPreferences: stringArray(value.stayPreferences),
    transportPreferences: stringArray(value.transportPreferences),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
