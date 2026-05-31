import type {
  ChecklistStatus,
  ItineraryItemStatus,
  ItineraryItemType,
  PlaceType,
  Priority,
} from "@prisma/client";

import { AI_DRAFT_NOTICE, redactSensitivePrompt } from "@/lib/ai";
import {
  dateKey,
  formatTimeInputValue,
  getNearestItineraryDay,
  getTodayDateMatch,
} from "@/lib/itinerary";

export type TodayItem = {
  costEstimate?: { toString(): string } | null;
  endTime: Date | null;
  id: string;
  notes?: string | null;
  place?: { name: string } | null;
  priority: Priority;
  startTime: Date | null;
  status: ItineraryItemStatus;
  title: string;
  transportToNext: string | null;
  type: ItineraryItemType;
};

export type TodayDay<TItem extends TodayItem = TodayItem> = {
  city: string | null;
  date: Date;
  id: string;
  items: TItem[];
  theme: string | null;
  weatherSummary: string | null;
};

export type TodayStatusAction = "complete" | "delay" | "reopen" | "skip";

export type TodayChecklistItem = {
  category: string;
  dueDate: Date | null;
  importance: Priority;
  status: ChecklistStatus;
  title: string;
};

export type TodayExpense = {
  amount: { toString(): string } | number | string;
  category: string;
  currency: string;
  paidAt: Date | null;
  title: string;
};

export type TodayAiContextInput = {
  baseCurrency: string;
  budgetAmount?: { toString(): string } | number | string | null;
  checklist: TodayChecklistItem[];
  day: TodayDay | null;
  expenses: TodayExpense[];
  latestChange: string;
  places: Array<{ name: string; type: PlaceType }>;
  title: string;
  transports: Array<{
    arriveTime: Date | null;
    departTime: Date | null;
    fromName: string;
    mode: string;
    toName: string;
  }>;
};

export type TodayAiContext = {
  budget: {
    baseCurrency: string;
    planned: string | null;
    todaySpent: Array<{ amount: string; category: string; currency: string; title: string }>;
  };
  checklistOpen: Array<{ category: string; importance: Priority; title: string }>;
  date: string | null;
  latestChange: string;
  nextStep: {
    item: {
      endTime: string | null;
      placeName: string | null;
      startTime: string | null;
      status: ItineraryItemStatus;
      title: string;
      transportToNext: string | null;
      type: ItineraryItemType;
    };
    reason: "delayed" | "next-timed" | "remaining";
  } | null;
  places: Array<{ name: string; type: PlaceType }>;
  remainingItems: Array<{
    endTime: string | null;
    startTime: string | null;
    status: ItineraryItemStatus;
    title: string;
    transportToNext: string | null;
    type: ItineraryItemType;
  }>;
  title: string;
  transports: Array<{
    arriveTime: string | null;
    departTime: string | null;
    fromName: string;
    mode: string;
    toName: string;
  }>;
};

export type TodayAdjustmentDraft = {
  kind: "today-adjustment-draft";
  context: TodayAiContext;
  notice: typeof AI_DRAFT_NOTICE;
  schemaVersion: 1;
  suggestions: string[];
};

export const TODAY_QUICK_RECORD_LIMITS = {
  place: 120,
  reminder: 160,
  text: 500,
} as const;

export type TodayQuickRecordValidationInput = {
  amount: string | null;
  noteText: string | null;
  placeName: string | null;
  reminder: string | null;
};

export function resolveTodayExecutionDay<TDay extends TodayDay>(
  now: Date,
  days: TDay[],
): {
  day: TDay | null;
  isExactToday: boolean;
} {
  const exactToday = getTodayDateMatch(now, days);
  const selected =
    exactToday ?? getNearestItineraryDay(now, days);
  const day = selected
    ? days.find((candidate) => candidate.id === selected.id) ?? null
    : null;

  return {
    day,
    isExactToday: Boolean(exactToday && day),
  };
}

export function getNextTodayStep<TItem extends TodayItem>(
  now: Date,
  items: TItem[],
): {
  item: TItem;
  reason: "delayed" | "next-timed" | "remaining";
} | null {
  const activeItems = items
    .filter((item) => item.status !== "DONE" && item.status !== "SKIPPED")
    .sort(compareTodayItems);

  const delayed = activeItems.find((item) => item.status === "DELAYED");
  if (delayed) {
    return { item: delayed, reason: "delayed" };
  }

  const nextTimed = activeItems.find(
    (item) => item.startTime && item.startTime.getTime() >= now.getTime(),
  );
  if (nextTimed) {
    return { item: nextTimed, reason: "next-timed" };
  }

  const remaining = activeItems[0];
  return remaining ? { item: remaining, reason: "remaining" } : null;
}

export function transitionTodayItemStatus(
  _currentStatus: ItineraryItemStatus,
  action: TodayStatusAction,
): ItineraryItemStatus {
  switch (action) {
    case "complete":
      return "DONE";
    case "delay":
      return "DELAYED";
    case "reopen":
      return "PLANNED";
    case "skip":
      return "SKIPPED";
  }
}

export function summarizeTodayForOffline({
  checklist,
  day,
  expenses,
  now,
}: {
  checklist: TodayChecklistItem[];
  day: TodayDay | null;
  expenses: TodayExpense[];
  now: Date;
}) {
  const nextStep = day ? getNextTodayStep(now, day.items) : null;
  const openChecklist = checklist
    .filter((item) => item.status === "TODO")
    .slice(0, 8)
    .map((item) => ({
      category: item.category,
      importance: item.importance,
      title: item.title,
    }));

  return {
    checklistOpen: openChecklist,
    date: day ? dateKey(day.date) : null,
    nextStep: nextStep
      ? {
          reason: nextStep.reason,
          startTime: formatNullableTime(nextStep.item.startTime),
          title: nextStep.item.title,
          transportToNext: nextStep.item.transportToNext,
          type: nextStep.item.type,
        }
      : null,
    spentToday: expenses.map((expense) => ({
      amount: expense.amount.toString(),
      category: expense.category,
      currency: expense.currency,
      title: expense.title,
    })),
  };
}

export function minimizeTodayContextForAi(
  input: TodayAiContextInput,
): TodayAiContext {
  const nextStep = input.day ? getNextTodayStep(new Date(), input.day.items) : null;

  return {
    budget: {
      baseCurrency: input.baseCurrency,
      planned: input.budgetAmount ? input.budgetAmount.toString() : null,
      todaySpent: input.expenses.slice(0, 12).map((expense) => ({
        amount: expense.amount.toString(),
        category: expense.category,
        currency: expense.currency,
        title: redactSensitivePrompt(expense.title),
      })),
    },
    checklistOpen: input.checklist
      .filter((item) => item.status === "TODO")
      .slice(0, 12)
      .map((item) => ({
        category: redactSensitivePrompt(item.category),
        importance: item.importance,
        title: redactSensitivePrompt(item.title),
      })),
    date: input.day ? dateKey(input.day.date) : null,
    latestChange: redactSensitivePrompt(input.latestChange).slice(0, 500),
    nextStep: nextStep
      ? {
          item: {
            endTime: formatNullableTime(nextStep.item.endTime),
            placeName: nextStep.item.place
              ? redactSensitivePrompt(nextStep.item.place.name)
              : null,
            startTime: formatNullableTime(nextStep.item.startTime),
            status: nextStep.item.status,
            title: redactSensitivePrompt(nextStep.item.title),
            transportToNext: nextStep.item.transportToNext
              ? redactSensitivePrompt(nextStep.item.transportToNext)
              : null,
            type: nextStep.item.type,
          },
          reason: nextStep.reason,
        }
      : null,
    places: input.places.slice(0, 12).map((place) => ({
      name: redactSensitivePrompt(place.name),
      type: place.type,
    })),
    remainingItems:
      input.day?.items
        .filter((item) => item.status !== "DONE" && item.status !== "SKIPPED")
        .slice(0, 12)
        .map((item) => ({
          endTime: formatNullableTime(item.endTime),
          startTime: formatNullableTime(item.startTime),
          status: item.status,
          title: redactSensitivePrompt(item.title),
          transportToNext: item.transportToNext
            ? redactSensitivePrompt(item.transportToNext)
            : null,
          type: item.type,
        })) ?? [],
    title: redactSensitivePrompt(input.title),
    transports: input.transports.slice(0, 8).map((transport) => ({
      arriveTime: formatNullableTime(transport.arriveTime),
      departTime: formatNullableTime(transport.departTime),
      fromName: redactSensitivePrompt(transport.fromName),
      mode: transport.mode,
      toName: redactSensitivePrompt(transport.toName),
    })),
  };
}

export function filterTodayAiContextInput(
  input: TodayAiContextInput,
  now = new Date(),
): TodayAiContextInput {
  const targetDateKey = input.day ? dateKey(input.day.date) : dateKey(now);
  const todayPlaceNames = new Set(
    input.day?.items
      .map((item) => item.place?.name)
      .filter((name): name is string => Boolean(name)) ?? [],
  );

  return {
    ...input,
    expenses: input.expenses.filter((expense) =>
      expense.paidAt ? dateKey(expense.paidAt) === targetDateKey : false,
    ),
    places:
      todayPlaceNames.size > 0
        ? input.places.filter((place) => todayPlaceNames.has(place.name))
        : [],
    transports: input.transports.filter((transport) =>
      [transport.departTime, transport.arriveTime].some(
        (date) => date && dateKey(date) === targetDateKey,
      ),
    ),
  };
}

export function validateTodayQuickRecordInput(
  input: TodayQuickRecordValidationInput,
): string | null {
  if (!input.noteText && !input.amount && !input.placeName && !input.reminder) {
    return "请至少记录文字、金额、地点或提醒中的一项。";
  }

  if (input.noteText && input.noteText.length > TODAY_QUICK_RECORD_LIMITS.text) {
    return `文字备注不能超过 ${TODAY_QUICK_RECORD_LIMITS.text} 个字符。`;
  }

  if (input.placeName && input.placeName.length > TODAY_QUICK_RECORD_LIMITS.place) {
    return `临时地点不能超过 ${TODAY_QUICK_RECORD_LIMITS.place} 个字符。`;
  }

  if (input.reminder && input.reminder.length > TODAY_QUICK_RECORD_LIMITS.reminder) {
    return `提醒不能超过 ${TODAY_QUICK_RECORD_LIMITS.reminder} 个字符。`;
  }

  return null;
}

export function buildTodayAdjustmentPrompt(context: TodayAiContext): string {
  return [
    "TRACE_ME_TODAY_EXECUTION_ADJUSTMENT",
    "请根据最小化的今日行程上下文，给出旅行中可执行的调整建议。",
    "不要直接覆盖原计划；建议必须进入草稿或确认流。",
    "不要索要或复述证件号、订单号、手机号、API key、文件内容等敏感信息。",
    "如果涉及票价、营业时间、班次、天气或政策，请标注需要人工核验。",
    JSON.stringify(context, null, 2),
  ].join("\n");
}

export function buildLocalTodayAdjustmentDraft(
  context: TodayAiContext,
): TodayAdjustmentDraft {
  const suggestions = [
    context.nextStep
      ? `优先处理下一步：${context.nextStep.item.title}。如现场变化较大，先确认交通和营业状态。`
      : "今天暂无待执行行程，可以把临时记录整理为笔记或支出。",
    context.latestChange
      ? `针对变化：${context.latestChange}。建议保留原计划，先创建替代安排草稿。`
      : "暂未记录变化。建议只做低风险调整，不删除原行程。",
    context.budget.todaySpent.length > 0
      ? "今日已有支出记录，后续建议优先选择可控预算的交通和餐饮。"
      : "今日暂无支出记录，建议在临时消费后立即补记金额。",
  ];

  return {
    context,
    kind: "today-adjustment-draft",
    notice: AI_DRAFT_NOTICE,
    schemaVersion: 1,
    suggestions,
  };
}

export function formatTodayAdjustmentDraftText(
  title: string,
  draft: TodayAdjustmentDraft,
): string {
  return [
    AI_DRAFT_NOTICE,
    "",
    `# ${title}`,
    "",
    ...draft.suggestions.map((suggestion) => `- ${suggestion}`),
    "",
    "原计划不会被直接覆盖；请在确认后再手动应用调整。",
  ].join("\n");
}

function compareTodayItems(left: TodayItem, right: TodayItem): number {
  const leftTime = left.startTime?.getTime() ?? Number.POSITIVE_INFINITY;
  const rightTime = right.startTime?.getTime() ?? Number.POSITIVE_INFINITY;

  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  return left.title.localeCompare(right.title, "zh-CN");
}

function formatNullableTime(date: Date | null): string | null {
  return date ? formatTimeInputValue(date) : null;
}
