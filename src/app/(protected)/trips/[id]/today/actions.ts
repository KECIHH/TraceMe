"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { AI_DRAFT_NOTICE, createConfiguredAiProvider } from "@/lib/ai";
import {
  isValidCurrencyCode,
  isValidOptionalNonNegativeAmount,
  normalizeExpenseCategory,
} from "@/lib/budget";
import { requireTripAccess } from "@/lib/collaboration";
import { dateKey, isItineraryStatus } from "@/lib/itinerary";
import { prisma } from "@/lib/prisma";
import { parseDateInput } from "@/lib/trip-management";
import {
  buildLocalTodayAdjustmentDraft,
  buildTodayAdjustmentPrompt,
  filterTodayAiContextInput,
  formatTodayAdjustmentDraftText,
  minimizeTodayContextForAi,
  resolveTodayExecutionDay,
  validateTodayQuickRecordInput,
} from "@/lib/today";
import { resolveAiProviderConfig } from "@/server/services/ai/provider-config";
import { isAiEnabledByUserSetting } from "@/server/services/ai/settings";

const TODAY_PATH_SEGMENT = "today";

export async function createTodayQuickRecordAction(
  tripId: string,
  formData: FormData,
) {
  await requireTrip(tripId);
  const redirectPath = todayPath(tripId);
  const noteText = optionalText(formData, "recordText");
  const amount = optionalText(formData, "recordAmount");
  const placeName = optionalText(formData, "recordPlace");
  const reminder = optionalText(formData, "recordReminder");
  const currency = (optionalText(formData, "recordCurrency") ?? "CNY").toUpperCase();

  const validationError = validateTodayQuickRecordInput({
    amount,
    noteText,
    placeName,
    reminder,
  });

  if (validationError) {
    redirectWithMessage(redirectPath, "error", validationError);
  }

  if (amount && !isValidOptionalNonNegativeAmount(amount)) {
    redirectWithMessage(redirectPath, "error", "金额不能小于 0。");
  }

  if (amount && !isValidCurrencyCode(currency)) {
    redirectWithMessage(redirectPath, "error", "货币必须是 3 位字母代码，例如 CNY。");
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    let placeId: string | undefined;

    if (placeName) {
      const place = await tx.place.create({
        data: {
          name: placeName,
          notes: noteText,
          priority: "MEDIUM",
          sourceName: "今日执行模式",
          tags: ["旅行中", "临时地点"],
          tripId,
          type: "OTHER",
        },
        select: { id: true },
      });
      placeId = place.id;
    }

    if (amount) {
      await tx.expense.create({
        data: {
          amount,
          category: normalizeExpenseCategory(formValue(formData, "recordCategory")),
          currency,
          notes: noteText,
          paidAt: now,
          relatedPlaceId: placeId,
          title: noteText?.slice(0, 40) || placeName || "旅行中快速支出",
          tripId,
        },
      });
    }

    if (noteText) {
      await tx.note.create({
        data: {
          content: [
            noteText,
            placeName ? `地点：${placeName}` : null,
            amount ? `金额：${currency} ${amount}` : null,
            reminder ? `提醒：${reminder}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
          tags: ["旅行中", "快速记录"],
          title: `旅行中记录 - ${dateKey(now)}`,
          tripId,
        },
      });
    }

    if (reminder) {
      await tx.checklistItem.create({
        data: {
          category: "旅途中提醒",
          dueDate: parseDateInput(formValue(formData, "recordReminderDate")),
          importance: "HIGH",
          notes: noteText,
          title: reminder,
          tripId,
        },
      });
    }
  });

  revalidateToday(tripId);
  redirectWithMessage(redirectPath, "message", "快速记录已保存。");
}

export async function updateTodayItemStatusAction(
  tripId: string,
  itemId: string,
  status: string,
) {
  await requireTrip(tripId);
  const redirectPath = todayPath(tripId);

  if (!isItineraryStatus(status)) {
    redirectWithMessage(redirectPath, "error", "行程状态无效。");
  }

  const result = await prisma.itineraryItem.updateMany({
    data: { status },
    where: { id: itemId, tripId },
  });

  if (result.count === 0) {
    redirectWithMessage(redirectPath, "error", "行程项不存在或已被删除。");
  }

  revalidateToday(tripId);
  redirect(redirectPath);
}

export async function generateTodayAdjustmentDraftAction(
  tripId: string,
  formData: FormData,
) {
  await requireTrip(tripId);
  const redirectPath = todayPath(tripId);
  const latestChange = requiredText(formData, "todayChange");

  if (!latestChange) {
    redirectWithMessage(redirectPath, "error", "请先写下今天发生的变化。");
  }

  if (latestChange.length > 500) {
    redirectWithMessage(redirectPath, "error", "变化说明不能超过 500 个字符。");
  }

  if (!(await isAiEnabledByUserSetting())) {
    redirectWithMessage(redirectPath, "error", "AI 功能已关闭。");
  }

  const providerConfig = await resolveAiProviderConfig();
  if (!providerConfig.apiKeyConfigured) {
    redirectWithMessage(
      redirectPath,
      "error",
      "未配置 AI 服务，请在设置中配置 provider 或启用 mock provider。",
    );
  }

  const trip = await loadTodayAiTrip(tripId, latestChange);
  const context = minimizeTodayContextForAi(filterTodayAiContextInput(trip));
  const localDraft = buildLocalTodayAdjustmentDraft(context);
  const provider = createConfiguredAiProvider({
    apiKey: providerConfig.apiKey,
    configured: providerConfig.apiKeyConfigured,
    model: providerConfig.model,
    provider: providerConfig.provider,
  });
  let aiText = "";

  try {
    aiText = await provider.generateText({
      includeDraftNotice: false,
      maxOutputTokens: 1200,
      systemPrompt: [
        "你是 TraceMe 的旅行中执行助手。",
        "输出必须是中文，建议要短、可执行、适合手机上快速阅读。",
        "不要直接覆盖原计划；所有变更都必须作为草稿等待用户确认。",
        "涉及实时信息时必须提醒人工核验。",
      ].join("\n"),
      task: {
        fields: [],
        id: "travel-notes",
        label: "今日行程调整建议",
        outputSections: ["下一步", "可选调整", "需要核验"],
        placeholder: "",
      },
      userPrompt: buildTodayAdjustmentPrompt(context),
    });
  } catch (error) {
    console.error("Today AI adjustment failed.", {
      message: error instanceof Error ? error.message : "Unknown error",
      provider: provider.name,
    });
    redirectWithMessage(redirectPath, "error", "AI 调整建议生成失败，请稍后重试。");
  }

  const title = `今日调整建议 - ${dateKey(new Date())}`;
  const contentText = [
    formatTodayAdjustmentDraftText(title, localDraft),
    "",
    "## AI 补充建议",
    aiText || AI_DRAFT_NOTICE,
  ].join("\n");

  await prisma.aiDraft.create({
    data: {
      contentJson: {
        ...localDraft,
        aiText,
        model: providerConfig.model,
        provider: providerConfig.provider,
      },
      contentText,
      title,
      tripId,
      type: "today-adjustment",
    },
  });

  revalidateToday(tripId);
  revalidatePath(`/trips/${tripId}/ai`);
  redirectWithMessage(redirectPath, "message", "AI 调整草稿已生成，原计划未被覆盖。");
}

async function requireTrip(tripId: string) {
  await requireTripAccess(tripId, "edit");
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });

  if (!trip) {
    notFound();
  }

  return trip;
}

async function loadTodayAiTrip(tripId: string, latestChange: string) {
  const trip = await prisma.trip.findUnique({
    include: {
      checklistItems: {
        orderBy: [{ dueDate: "asc" }, { importance: "desc" }, { createdAt: "desc" }],
        take: 30,
      },
      expenses: {
        orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
        take: 20,
      },
      itineraryDays: {
        include: {
          items: {
            include: { place: { select: { name: true } } },
            orderBy: [{ sortOrder: "asc" }, { startTime: "asc" }, { createdAt: "asc" }],
          },
        },
        orderBy: { date: "asc" },
      },
      places: {
        orderBy: [{ updatedAt: "desc" }],
        select: { name: true, type: true },
        take: 30,
      },
      transports: {
        orderBy: [{ departTime: "asc" }, { createdAt: "desc" }],
        take: 20,
      },
    },
    where: { id: tripId },
  });

  if (!trip) {
    notFound();
  }

  const { day } = resolveTodayExecutionDay(new Date(), trip.itineraryDays);

  return {
    baseCurrency: trip.baseCurrency,
    budgetAmount: trip.budgetAmount,
    checklist: trip.checklistItems,
    day,
    expenses: trip.expenses,
    latestChange,
    places: trip.places,
    title: trip.title,
    transports: trip.transports,
  };
}

function todayPath(tripId: string): string {
  return `/trips/${tripId}/${TODAY_PATH_SEGMENT}`;
}

function revalidateToday(tripId: string) {
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/budget`);
  revalidatePath(`/trips/${tripId}/checklist`);
  revalidatePath(`/trips/${tripId}/notes`);
  revalidatePath(`/trips/${tripId}/places`);
  revalidatePath(todayPath(tripId));
}

function requiredText(formData: FormData, key: string): string {
  return formValue(formData, key).trim();
}

function optionalText(formData: FormData, key: string): string | null {
  const value = requiredText(formData, key);
  return value ? value : null;
}

function formValue(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

function redirectWithMessage(
  path: string,
  key: "error" | "message",
  message: string,
): never {
  redirect(`${path}?${key}=${encodeURIComponent(message)}`);
}
