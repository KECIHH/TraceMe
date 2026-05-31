import { NextResponse } from "next/server";

import { AI_DRAFT_NOTICE, createConfiguredAiProvider } from "@/lib/ai";
import { requireUser } from "@/lib/auth/session";
import { getTripAccessForUser } from "@/lib/collaboration";
import { dateKey } from "@/lib/itinerary";
import { prisma } from "@/lib/prisma";
import {
  buildLocalTodayAdjustmentDraft,
  buildTodayAdjustmentPrompt,
  filterTodayAiContextInput,
  formatTodayAdjustmentDraftText,
  minimizeTodayContextForAi,
  resolveTodayExecutionDay,
} from "@/lib/today";
import { resolveAiProviderConfig } from "@/server/services/ai/provider-config";
import { isAiEnabledByUserSetting } from "@/server/services/ai/settings";

type RouteContext = {
  params: Promise<{ tripId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const user = await requireUser();
  const { tripId } = await context.params;
  const access = await getTripAccessForUser(tripId, user.id);

  if (!access?.canEdit) {
    return NextResponse.json({ error: "Trip not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as
    | { todayChange?: unknown }
    | null;
  const latestChange =
    typeof body?.todayChange === "string" ? body.todayChange.trim() : "";

  if (!latestChange) {
    return NextResponse.json({ error: "请先写下今天发生的变化。" }, { status: 400 });
  }

  if (latestChange.length > 500) {
    return NextResponse.json(
      { error: "变化说明不能超过 500 个字符。" },
      { status: 400 },
    );
  }

  if (!(await isAiEnabledByUserSetting())) {
    return NextResponse.json({ error: "AI 功能已关闭。" }, { status: 400 });
  }

  const providerConfig = await resolveAiProviderConfig();
  if (!providerConfig.apiKeyConfigured) {
    return NextResponse.json(
      { error: "未配置 AI 服务，请在设置中配置 provider 或启用 mock provider。" },
      { status: 400 },
    );
  }

  const trip = await loadTodayAiTrip(tripId, latestChange);
  const contextForAi = minimizeTodayContextForAi(filterTodayAiContextInput(trip));
  const localDraft = buildLocalTodayAdjustmentDraft(contextForAi);
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
      userPrompt: buildTodayAdjustmentPrompt(contextForAi),
    });
  } catch (error) {
    console.error("Today AI adjustment failed.", {
      message: error instanceof Error ? error.message : "Unknown error",
      provider: provider.name,
    });

    return NextResponse.json(
      { error: "AI 调整建议生成失败，请稍后重试。" },
      { status: 502 },
    );
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

  return NextResponse.json({ message: "AI 调整草稿已生成，原计划未被覆盖。" });
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
    return {
      baseCurrency: "CNY",
      budgetAmount: null,
      checklist: [],
      day: null,
      expenses: [],
      latestChange,
      places: [],
      title: "",
      transports: [],
    };
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
