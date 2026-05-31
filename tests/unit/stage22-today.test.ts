import { describe, expect, it } from "vitest";

import {
  buildLocalTodayAdjustmentDraft,
  buildTodayAdjustmentPrompt,
  filterTodayAiContextInput,
  getNextTodayStep,
  minimizeTodayContextForAi,
  resolveTodayExecutionDay,
  summarizeTodayForOffline,
  transitionTodayItemStatus,
  validateTodayQuickRecordInput,
  type TodayDay,
  type TodayItem,
} from "@/lib/today";

function item(overrides: Partial<TodayItem> = {}): TodayItem {
  return {
    costEstimate: null,
    endTime: null,
    id: overrides.id ?? "item",
    notes: overrides.notes ?? null,
    place: overrides.place ?? null,
    priority: overrides.priority ?? "MEDIUM",
    startTime: overrides.startTime ?? null,
    status: overrides.status ?? "PLANNED",
    title: overrides.title ?? "行程项",
    transportToNext: overrides.transportToNext ?? null,
    type: overrides.type ?? "CUSTOM",
  };
}

function day(date: Date, overrides: Partial<TodayDay> = {}): TodayDay {
  return {
    city: overrides.city ?? "杭州",
    date,
    id: overrides.id ?? date.toISOString(),
    items: overrides.items ?? [],
    theme: overrides.theme ?? null,
    weatherSummary: overrides.weatherSummary ?? null,
  };
}

describe("stage 22 today execution helpers", () => {
  it("filters today itinerary by local date and falls back to the nearest day", () => {
    const today = new Date(2026, 5, 1, 10);
    const days = [
      day(new Date(2026, 4, 30), { id: "before" }),
      day(new Date(2026, 5, 1), { id: "today" }),
      day(new Date(2026, 5, 3), { id: "after" }),
    ];

    expect(resolveTodayExecutionDay(today, days)).toMatchObject({
      day: { id: "today" },
      isExactToday: true,
    });
    expect(resolveTodayExecutionDay(new Date(2026, 5, 2), days)).toMatchObject({
      day: { id: "today" },
      isExactToday: false,
    });
  });

  it("keeps today item status transitions explicit", () => {
    expect(transitionTodayItemStatus("PLANNED", "complete")).toBe("DONE");
    expect(transitionTodayItemStatus("PLANNED", "skip")).toBe("SKIPPED");
    expect(transitionTodayItemStatus("PLANNED", "delay")).toBe("DELAYED");
    expect(transitionTodayItemStatus("DELAYED", "reopen")).toBe("PLANNED");
  });

  it("chooses delayed work before ordinary remaining work", () => {
    const next = getNextTodayStep(new Date(2026, 5, 1, 12), [
      item({ id: "done", status: "DONE", title: "已完成" }),
      item({ id: "later", startTime: new Date(2026, 5, 1, 15), title: "下午" }),
      item({ id: "delayed", status: "DELAYED", title: "被延后" }),
    ]);

    expect(next?.reason).toBe("delayed");
    expect(next?.item.id).toBe("delayed");
  });

  it("builds an offline summary for next step, checklist, and spending", () => {
    const summary = summarizeTodayForOffline({
      checklist: [
        {
          category: "旅途中提醒",
          dueDate: null,
          importance: "HIGH",
          status: "TODO",
          title: "取票",
        },
      ],
      day: day(new Date(2026, 5, 1), {
        items: [
          item({
            startTime: new Date(2026, 5, 1, 14),
            title: "去码头",
            transportToNext: "地铁 2 号线",
            type: "TRANSPORT",
          }),
        ],
      }),
      expenses: [
        {
          amount: "32.5",
          category: "交通",
          currency: "CNY",
          paidAt: new Date(2026, 5, 1),
          title: "打车",
        },
      ],
      now: new Date(2026, 5, 1, 10),
    });

    expect(summary.nextStep?.title).toBe("去码头");
    expect(summary.checklistOpen).toHaveLength(1);
    expect(summary.spentToday).toEqual([
      { amount: "32.5", category: "交通", currency: "CNY", title: "打车" },
    ]);
  });

  it("minimizes AI adjustment context and redacts sensitive values", () => {
    const context = minimizeTodayContextForAi({
      baseCurrency: "CNY",
      budgetAmount: "3000",
      checklist: [
        {
          category: "证件",
          dueDate: null,
          importance: "HIGH",
          status: "TODO",
          title: "确认订单号: ABCD123456",
        },
      ],
      day: day(new Date(2026, 5, 1), {
        items: [
          item({
            notes: "不要传给 AI",
            place: { name: "酒店 电话: 13812345678" },
            title: "入住 电话: 13812345678",
          }),
        ],
      }),
      expenses: [
        {
          amount: "88",
          category: "餐饮",
          currency: "CNY",
          paidAt: new Date(2026, 5, 1),
          title: "订单号: SECRET123",
        },
      ],
      latestChange: "手机 13812345678，下午下雨",
      places: [{ name: "护照: E12345678", type: "OTHER" }],
      title: "杭州旅行",
      transports: [],
    });
    const serialized = JSON.stringify(context);

    expect(serialized).not.toContain("13812345678");
    expect(serialized).not.toContain("SECRET123");
    expect(serialized).not.toContain("不要传给 AI");
    expect(buildTodayAdjustmentPrompt(context)).toContain("TRACE_ME_TODAY_EXECUTION_ADJUSTMENT");
    expect(buildLocalTodayAdjustmentDraft(context).kind).toBe("today-adjustment-draft");
  });

  it("keeps AI adjustment context scoped to the execution day", () => {
    const today = new Date(2026, 5, 1, 10);
    const scoped = filterTodayAiContextInput(
      {
        baseCurrency: "CNY",
        budgetAmount: "3000",
        checklist: [],
        day: day(new Date(2026, 5, 1), {
          items: [
            item({
              place: { name: "今日码头" },
              title: "码头集合",
            }),
          ],
        }),
        expenses: [
          {
            amount: "18",
            category: "餐饮",
            currency: "CNY",
            paidAt: new Date(2026, 5, 1, 12),
            title: "今日饮水",
          },
          {
            amount: "600",
            category: "住宿",
            currency: "CNY",
            paidAt: new Date(2026, 5, 2, 12),
            title: "明日酒店",
          },
        ],
        latestChange: "下雨",
        places: [
          { name: "今日码头", type: "ATTRACTION" },
          { name: "明日酒店", type: "HOTEL" },
        ],
        title: "杭州旅行",
        transports: [
          {
            arriveTime: new Date(2026, 5, 1, 9),
            departTime: new Date(2026, 5, 1, 8),
            fromName: "酒店",
            mode: "地铁",
            toName: "今日码头",
          },
          {
            arriveTime: new Date(2026, 5, 2, 9),
            departTime: new Date(2026, 5, 2, 8),
            fromName: "杭州",
            mode: "火车",
            toName: "上海",
          },
        ],
      },
      today,
    );

    expect(scoped.expenses.map((expense) => expense.title)).toEqual(["今日饮水"]);
    expect(scoped.places.map((place) => place.name)).toEqual(["今日码头"]);
    expect(scoped.transports.map((transport) => transport.toName)).toEqual(["今日码头"]);
  });

  it("validates quick records on the server-side shape", () => {
    expect(
      validateTodayQuickRecordInput({
        amount: null,
        noteText: null,
        placeName: null,
        reminder: null,
      }),
    ).toBe("请至少记录文字、金额、地点或提醒中的一项。");
    expect(
      validateTodayQuickRecordInput({
        amount: null,
        noteText: "可以存",
        placeName: "x".repeat(121),
        reminder: null,
      }),
    ).toBe("临时地点不能超过 120 个字符。");
    expect(
      validateTodayQuickRecordInput({
        amount: "18",
        noteText: null,
        placeName: null,
        reminder: null,
      }),
    ).toBeNull();
  });
});
