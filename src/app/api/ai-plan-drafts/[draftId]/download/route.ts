import { NextResponse } from "next/server";

import {
  coerceAiPlanWorkspace,
  getSelectedAiPlanOption,
  type AiPlanOption,
  type StructuredTripPlan,
} from "@/lib/ai-plan";
import { requireUser } from "@/lib/auth/session";
import { formatMoney } from "@/lib/budget";
import { prisma } from "@/lib/prisma";

type AiPlanDraftDownloadRouteProps = {
  params: Promise<{ draftId: string }>;
};

export async function GET(
  request: Request,
  { params }: AiPlanDraftDownloadRouteProps,
) {
  const user = await requireUser();

  const { draftId } = await params;
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "md";
  const disposition =
    url.searchParams.get("disposition") === "inline" ? "inline" : "attachment";

  const draft = await prisma.aiPlanDraft.findFirst({
    where: { createdById: user.id, id: draftId },
  });

  if (!draft) {
    return NextResponse.json({ error: "AI plan draft not found." }, { status: 404 });
  }

  const workspace = coerceAiPlanWorkspace(draft.draftJson);
  if (!workspace) {
    return NextResponse.json({ error: "Invalid AI plan draft." }, { status: 422 });
  }

  const selected = getSelectedAiPlanOption(workspace);
  const fileBaseName = generateSafeFileBaseName(selected.plan.trip.title);

  if (format === "json") {
    return fileResponse(JSON.stringify({ selectedOptionId: selected.id, workspace }, null, 2), {
      contentDisposition: disposition,
      contentType: "application/json; charset=utf-8",
      fileName: `${fileBaseName}.json`,
    });
  }

  return fileResponse(generateAiPlanMarkdown(selected), {
    contentDisposition: disposition,
    contentType: "text/markdown; charset=utf-8",
    fileName: `${fileBaseName}.md`,
  });
}

function generateAiPlanMarkdown(option: AiPlanOption): string {
  const plan = option.plan;

  return [
    `# ${plan.trip.title}`,
    "",
    "> AI 草稿：确认前不会写入正式 Trip 数据。票价、营业时间、预约、签证和政策信息均需通过官方渠道人工核验。",
    "",
    "## 方案评分",
    "",
    `- 综合评分：${option.score.overall}`,
    `- 轻松度：${option.score.ease}`,
    `- 预算匹配度：${option.score.budgetMatch}`,
    `- 路线合理性：${option.score.routeRationality}`,
    `- 亲子/老人友好度：${option.score.familyElderFriendly}`,
    "",
    "## 摘要",
    "",
    `- 出发：${plan.trip.homeCity}`,
    `- 目的地：${plan.trip.mainDestination}`,
    `- 日期：${plan.trip.startDate} 至 ${plan.trip.endDate}`,
    `- 预算估算：${formatMoney(plan.budget.totalAmount, plan.budget.currency)}`,
    `- 主题：${plan.trip.theme}`,
    "",
    plan.trip.description,
    "",
    "## 每日行程",
    "",
    ...formatItinerary(plan),
    "## 交通建议",
    "",
    ...plan.transportOptions.map(
      (item) =>
        `- ${item.mode}：${item.fromName} -> ${item.toName}。${item.notes}`,
    ),
    "",
    "## 预算估算",
    "",
    ...plan.categoryBudgets.map(
      (item) =>
        `- ${item.category}：${formatMoney(item.amount, plan.budget.currency)}。${item.notes ?? "AI 估算，非实时价格。"}`,
    ),
    "",
    "## 准备清单",
    "",
    ...plan.checklistItems.map(
      (item) =>
        `- [ ] ${item.title}（${item.category} / ${item.importance}）${item.notes ? `：${item.notes}` : ""}`,
    ),
    "",
    "## 风险提醒",
    "",
    ...(plan.riskReminders ?? []).map((item) => `- ${item}`),
    ...plan.verificationChecklist.map((item) => `- ${item}`),
    "",
  ].join("\n");
}

function formatItinerary(plan: StructuredTripPlan): string[] {
  return plan.itineraryDays.flatMap((day, index) => [
    `### Day ${index + 1} ${day.title}`,
    "",
    `- 日期：${day.date}`,
    `- 城市：${day.city}`,
    `- 主题：${day.theme}`,
    "",
    ...day.items.map(
      (item) =>
        `- ${item.startTime ?? "--:--"}-${item.endTime ?? "--:--"} ${item.title}：${item.notes ?? "需人工核验。"}`,
    ),
    "",
  ]);
}

function fileResponse(
  body: string,
  {
    contentDisposition,
    contentType,
    fileName,
  }: {
    contentDisposition: "attachment" | "inline";
    contentType: string;
    fileName: string;
  },
) {
  return new Response(body, {
    headers: {
      "Content-Disposition": `${contentDisposition}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function generateSafeFileBaseName(value: string): string {
  const normalized = value
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || "ai-plan-draft";
}
