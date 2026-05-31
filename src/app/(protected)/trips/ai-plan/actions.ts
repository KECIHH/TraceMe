"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import {
  aiPlanWorkspaceToJson,
  appendAiPlanRegenerationVersion,
  applyAiPlanDraft,
  coerceAiPlanWorkspace,
  formDataToAiPlanInput,
  generateAiPlanWorkspace,
  normalizeAiPlanInput,
  reviseAiPlanWorkspace,
  rollbackAiPlanWorkspace,
  sanitizeAiPlanInput,
  selectAiPlanOption,
  validateAiPlanInput,
  type AiPlanInput,
} from "@/lib/ai-plan";
import { prisma } from "@/lib/prisma";
import { summarizePreferencesForAiPlan } from "@/lib/trip-review";

import type { AiPlanActionState } from "./action-state";

export async function createAiPlanDraftAction(
  _previousState: AiPlanActionState,
  formData: FormData,
): Promise<AiPlanActionState> {
  const user = await requireUser();

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
    const preferenceSummary = await loadPreferenceSummary(user.id);
    const result = await generateAiPlanWorkspace(validation.values, process.env, {
      preferenceSummary,
    });
    const draft = await prisma.aiPlanDraft.create({
      data: {
        createdById: user.id,
        draftJson: aiPlanWorkspaceToJson(result.workspace),
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
  redirectToAiPlan({ draftId });
}

export async function applyAiPlanDraftAction(draftId: string) {
  const user = await requireUser();

  const draft = await findOwnedAiPlanDraft(draftId, user.id);

  if (!draft) {
    redirectToAiPlan({ error: "草稿不存在或已被删除" });
  }

  let tripId: string;

  try {
    tripId = await prisma.$transaction(async (tx) => {
      const appliedTripId = await applyAiPlanDraft(tx, draft);

      await tx.tripMember.upsert({
        create: {
          canDownloadSensitiveDocuments: true,
          role: "OWNER",
          tripId: appliedTripId,
          userId: user.id,
        },
        update: {
          canDownloadSensitiveDocuments: true,
          role: "OWNER",
        },
        where: { tripId_userId: { tripId: appliedTripId, userId: user.id } },
      });

      return appliedTripId;
    });

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
    redirectToAiPlan({ draftId, error: "草稿写入失败，请重新生成" });
  }

  redirect(`/trips/${tripId}`);
}

export async function regenerateAiPlanDraftAction(draftId: string) {
  const user = await requireUser();

  const draft = await findOwnedAiPlanDraft(draftId, user.id);

  if (!draft) {
    redirectToAiPlan({ error: "草稿不存在或已被删除" });
  }

  const values = jsonToAiPlanInput(draft.inputJson);
  const validation = validateAiPlanInput(values);

  if (!validation.ok) {
    redirectToAiPlan({ draftId, edit: 1, error: "原始输入需要修正" });
  }

  try {
    const preferenceSummary = await loadPreferenceSummary(user.id);
    const result = await generateAiPlanWorkspace(validation.values, process.env, {
      preferenceSummary,
    });
    const previousWorkspace = coerceAiPlanWorkspace(draft.draftJson);
    const nextWorkspace = previousWorkspace
      ? appendAiPlanRegenerationVersion(previousWorkspace, result.workspace)
      : result.workspace;

    await prisma.aiPlanDraft.update({
      data: {
        draftJson: aiPlanWorkspaceToJson(nextWorkspace),
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
  redirectToAiPlan({ draftId });
}

export async function selectAiPlanOptionAction(
  draftId: string,
  formData: FormData,
) {
  const user = await requireUser();

  const optionId = String(formData.get("optionId") ?? "");
  const draft = await findOwnedAiPlanDraft(draftId, user.id);

  if (!draft || draft.status !== "draft") {
    redirectToAiPlan({ error: "草稿不存在或当前不可修改" });
  }

  const workspace = coerceAiPlanWorkspace(draft.draftJson);
  if (!workspace) {
    redirectToAiPlan({ draftId, error: "AI 草稿结构无效" });
  }

  try {
    const nextWorkspace = selectAiPlanOption(workspace, optionId);
    await prisma.aiPlanDraft.update({
      data: {
        draftJson: aiPlanWorkspaceToJson(nextWorkspace),
        errorMessage: null,
      },
      where: { id: draftId },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "选择方案失败。";
    redirectToAiPlan({ draftId, error: message });
  }

  revalidatePath("/trips/ai-plan");
  redirectToAiPlan({ draftId, message: "已选择 AI 方案" });
}

export async function reviseAiPlanDraftAction(
  draftId: string,
  formData: FormData,
) {
  const user = await requireUser();

  const changeRequest = String(formData.get("changeRequest") ?? "");
  const draft = await findOwnedAiPlanDraft(draftId, user.id);

  if (!draft || draft.status !== "draft") {
    redirectToAiPlan({ error: "草稿不存在或当前不可修改" });
  }

  const workspace = coerceAiPlanWorkspace(draft.draftJson);
  if (!workspace) {
    redirectToAiPlan({ draftId, error: "AI 草稿结构无效" });
  }

  try {
    const nextWorkspace = reviseAiPlanWorkspace(workspace, changeRequest);
    await prisma.aiPlanDraft.update({
      data: {
        draftJson: aiPlanWorkspaceToJson(nextWorkspace),
        errorMessage: null,
      },
      where: { id: draftId },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "调整草稿失败。";
    redirectToAiPlan({ draftId, error: message });
  }

  revalidatePath("/trips/ai-plan");
  redirectToAiPlan({ draftId, message: "AI 草稿已按追问调整" });
}

export async function rollbackAiPlanDraftAction(
  draftId: string,
  formData: FormData,
) {
  const user = await requireUser();

  const versionId = String(formData.get("versionId") ?? "");
  const draft = await findOwnedAiPlanDraft(draftId, user.id);

  if (!draft || draft.status !== "draft") {
    redirectToAiPlan({ error: "草稿不存在或当前不可修改" });
  }

  const workspace = coerceAiPlanWorkspace(draft.draftJson);
  if (!workspace) {
    redirectToAiPlan({ draftId, error: "AI 草稿结构无效" });
  }

  try {
    const nextWorkspace = rollbackAiPlanWorkspace(workspace, versionId);
    await prisma.aiPlanDraft.update({
      data: {
        draftJson: aiPlanWorkspaceToJson(nextWorkspace),
        errorMessage: null,
      },
      where: { id: draftId },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "回滚版本失败。";
    redirectToAiPlan({ draftId, error: message });
  }

  revalidatePath("/trips/ai-plan");
  redirectToAiPlan({ draftId, message: "已回滚到所选 AI 版本" });
}

export async function discardAiPlanDraftAction(draftId: string) {
  const user = await requireUser();

  const result = await prisma.aiPlanDraft.updateMany({
    data: { status: "discarded" },
    where: { createdById: user.id, id: draftId },
  });

  if (result.count === 0) {
    redirectToAiPlan({ error: "草稿不存在或当前不可修改" });
  }

  revalidatePath("/trips/ai-plan");
  redirectToAiPlan({ message: "AI 草稿已丢弃" });
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
      travelGoal: "",
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
    travelGoal: stringValue(value.travelGoal),
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

async function findOwnedAiPlanDraft(draftId: string, userId: string) {
  return prisma.aiPlanDraft.findFirst({
    where: {
      createdById: userId,
      id: draftId,
    },
  });
}

async function loadPreferenceSummary(userId: string): Promise<string> {
  const preferences = await prisma.travelPreference.findMany({
    orderBy: [{ weight: "desc" }, { evidenceCount: "desc" }, { updatedAt: "desc" }],
    select: {
      evidenceCount: true,
      key: true,
      label: true,
      weight: true,
    },
    take: 8,
    where: { userId, visibility: "private" },
  });

  return summarizePreferencesForAiPlan(preferences);
}

function redirectToAiPlan(
  params: Record<string, boolean | number | string | null | undefined> = {},
): never {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") {
      searchParams.set(key, String(value));
    }
  }

  const query = searchParams.toString();
  redirect(query ? `/trips/ai-plan?${query}` : "/trips/ai-plan");
}
