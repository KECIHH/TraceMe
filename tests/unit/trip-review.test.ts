import { describe, expect, it } from "vitest";

import {
  applyAiPlanPersonalization,
  buildStructuredPlanPrompt,
  defaultAiPlanInput,
  generateMockAiPlan,
  type AiPlanInput,
} from "@/lib/ai-plan";
import {
  buildTripReviewAiInput,
  canSaveFinalTripReview,
  exportTripReviewMarkdown,
  extractPreferencesFromReview,
  generateTripReviewDraft,
  summarizePreferencesForAiPlan,
} from "@/lib/trip-review";

const tripSource = {
  baseCurrency: "CNY",
  budgetAmount: "5000",
  endDate: new Date("2026-05-03T00:00:00.000Z"),
  expenses: [
    { amount: "1200", currency: "CNY" },
    { amount: "800", currency: "CNY" },
  ],
  homeCity: "上海",
  itineraryDays: [
    {
      city: "杭州",
      date: new Date("2026-05-01T00:00:00.000Z"),
      items: [{ status: "DONE" }, { status: "SKIPPED" }, { status: "PLANNED" }],
      theme: "西湖慢游",
      title: "Day 1",
    },
  ],
  mainDestination: "杭州",
  notes: [
    {
      content:
        "龙井村适合慢逛。手机号 13812345678，订单号 ABCD123456，附件路径 C:/secret/passport.pdf。",
      tags: ["慢旅行", "电话：13812345678"],
      title: "复盘笔记 护照：E12345678",
    },
  ],
  startDate: new Date("2026-05-01T00:00:00.000Z"),
  title: "杭州三日",
};

const nextPlanInput: AiPlanInput = {
  ...defaultAiPlanInput,
  budgetAmount: "3000",
  destination: "苏州",
  endDate: "2026-06-03",
  homeCity: "上海",
  pace: "balanced",
  people: "2",
  startDate: "2026-06-01",
};

describe("trip review knowledge base", () => {
  it("allows final reviews only after a trip is completed", () => {
    expect(canSaveFinalTripReview("COMPLETED")).toBe(true);
    expect(canSaveFinalTripReview("TRAVELING")).toBe(false);
    expect(canSaveFinalTripReview("PLANNING")).toBe(false);
  });

  it("generates a trip review draft from minimized trip context", async () => {
    const input = buildTripReviewAiInput(tripSource, {
      actualCostAmount: "2000",
      actualPace: "relaxed",
      recommendations: ["龙井村值得慢逛"],
      warnings: ["周末不要跨区转场太多"],
    });

    const result = await generateTripReviewDraft(input, {});

    expect(result.provider).toBe("mock");
    expect(result.draft.actualCostAmount).toBe("2000");
    expect(result.draft.actualPace).toBe("relaxed");
    expect(result.draft.summary).toContain("杭州三日复盘");
    expect(result.draft.recommendations).toContain("龙井村值得慢逛");
  });

  it("extracts private planning preferences from confirmed review", () => {
    const preferences = extractPreferencesFromReview({
      actualCostAmount: "5200",
      actualPace: "relaxed",
      nextTimeAdvice: "喜欢慢节奏，不喜欢转场过多，预算要控制。",
      recommendations: ["美食街体验很好"],
      stayTags: [{ name: "酒店", tags: ["安静", "安全"] }],
      transportTags: [{ name: "高铁", tags: ["少换乘"] }],
      warnings: ["热门景点排队太久"],
    });

    expect(preferences.map((item) => item.key)).toEqual(
      expect.arrayContaining([
        "pace.relaxed",
        "transport.fewer_transfers",
        "budget.sensitive",
        "stay.quiet_safe",
      ]),
    );
  });

  it("redacts and minimizes AI review input", () => {
    const input = buildTripReviewAiInput(tripSource, {
      actualCostAmount: "2000",
      recommendations: ["电话：13812345678"],
    });
    const serialized = JSON.stringify(input);

    expect(serialized).not.toContain("13812345678");
    expect(serialized).not.toContain("ABCD123456");
    expect(serialized).not.toContain("E12345678");
    expect(serialized).not.toContain("passport.pdf");
    expect(serialized).not.toContain("filePath");
    expect(input.notes[0].contentSnippet.length).toBeLessThanOrEqual(180);
  });

  it("exports review Markdown without hidden sensitive fields", () => {
    const markdown = exportTripReviewMarkdown({
      actualCostAmount: "5200",
      actualCostCurrency: "CNY",
      actualPace: "relaxed",
      createdAt: new Date("2026-05-05T00:00:00.000Z"),
      nextTimeAdvice: "下次继续慢节奏，订单号 ABCD123456 不应外露。",
      recommendations: ["龙井村值得再去"],
      trip: {
        endDate: new Date("2026-05-03T00:00:00.000Z"),
        mainDestination: "杭州",
        startDate: new Date("2026-05-01T00:00:00.000Z"),
        title: "杭州三日",
      },
      warnings: ["避开周末高峰"],
    });

    expect(markdown).toContain("# 杭州三日复盘");
    expect(markdown).toContain("## 推荐");
    expect(markdown).not.toContain("aiDraftJson");
    expect(markdown).not.toContain("createdById");
    expect(markdown).not.toContain("ABCD123456");
    expect(markdown).toContain("编号已脱敏");
  });

  it("adds private preference summary to future AI planning", () => {
    const summary = summarizePreferencesForAiPlan([
      {
        evidenceCount: 2,
        key: "pace.relaxed",
        label: "喜欢慢节奏",
        weight: 5,
      },
      {
        evidenceCount: 1,
        key: "transport.fewer_transfers",
        label: "不喜欢转场过多",
        weight: 3,
      },
      {
        evidenceCount: 1,
        key: "budget.sensitive",
        label: "预算敏感",
        weight: 2,
      },
    ]);
    const prompt = buildStructuredPlanPrompt(nextPlanInput, {
      preferenceSummary: summary,
    });
    const personalized = applyAiPlanPersonalization(nextPlanInput, {
      preferenceSummary: summary,
    });
    const plan = generateMockAiPlan(personalized);

    expect(prompt).toContain("用户个人旅行偏好");
    expect(prompt).toContain("喜欢慢节奏");
    expect(personalized.pace).toBe("relaxed");
    expect(personalized.transportPreferences).toContain("少换乘");
    expect(personalized.stayPreferences).toContain("预算优先");
    expect(plan.trip.theme).toContain("慢旅行");
  });
});
