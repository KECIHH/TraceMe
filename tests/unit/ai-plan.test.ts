import { describe, expect, it } from "vitest";

import {
  applyAiPlanDraft,
  buildChecklist,
  calculateTripDays,
  defaultAiPlanInput,
  generateMockAiPlan,
  parseAiPlanJson,
  splitBudget,
  validateAiPlanInput,
  validateStructuredTripPlan,
  type AiPlanInput,
} from "@/lib/ai-plan";

const validInput: AiPlanInput = {
  ...defaultAiPlanInput,
  budgetAmount: "9000",
  companions: "情侣",
  destination: "成都",
  endDate: "2026-10-03",
  homeCity: "上海",
  mustVisit: "宽窄巷子, 武侯祠",
  pace: "balanced",
  people: "2",
  preferences: ["美食", "历史"],
  startDate: "2026-10-01",
  stayPreferences: ["交通方便"],
  transportPreferences: ["高铁", "少换乘"],
};

describe("AI plan core", () => {
  it("validates required AI planning input", () => {
    const result = validateAiPlanInput({
      ...validInput,
      destination: "",
      endDate: "2026-09-30",
      homeCity: "",
      people: "0",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.destination).toBe("请填写目的地。");
      expect(result.errors.homeCity).toBe("请填写出发城市。");
      expect(result.errors.endDate).toBe("返回日期不能早于出发日期。");
      expect(result.errors.people).toBe("出行人数必须是正整数。");
    }
  });

  it("converts a date range to the correct itinerary day count", () => {
    expect(
      calculateTripDays(new Date(2026, 9, 1), new Date(2026, 9, 3)),
    ).toBe(3);
  });

  it("validates the structured AI JSON schema", () => {
    const plan = generateMockAiPlan(validInput);
    expect(validateStructuredTripPlan(plan).ok).toBe(true);
    expect(
      validateStructuredTripPlan({
        ...plan,
        itineraryDays: [{ ...plan.itineraryDays[0], items: [] }],
      }),
    ).toMatchObject({ ok: false });
  });

  it("parses JSON returned by an AI provider", () => {
    const plan = generateMockAiPlan(validInput);

    expect(parseAiPlanJson(`\`\`\`json\n${JSON.stringify(plan)}\n\`\`\``)).toMatchObject({
      trip: { mainDestination: "成都" },
    });
    expect(() => parseAiPlanJson("not json")).toThrow("不是可解析的 JSON");
  });

  it("generates a complete mock plan", () => {
    const plan = generateMockAiPlan(validInput);

    expect(plan.itineraryDays).toHaveLength(3);
    expect(plan.itineraryDays.every((day) => day.items.length >= 2)).toBe(true);
    expect(plan.places.some((place) => place.name.includes("宽窄巷子"))).toBe(true);
    expect(plan.transportOptions[0].notes).toContain("官方渠道");
    expect(plan.notes[0].content).toContain("AI 草稿");
  });

  it("converts a draft into Trip module data", async () => {
    const plan = generateMockAiPlan(validInput);
    const fake = createFakeTransaction();

    const tripId = await applyAiPlanDraft(fake.tx, {
      draftJson: plan,
      id: "draft-1",
      inputJson: validInput,
      status: "draft",
    });

    expect(tripId).toBe("trip-1");
    expect(fake.created.trip[0].title).toBe("成都3日 AI 旅行计划");
    expect(fake.created.destination).toHaveLength(1);
    expect(fake.created.itineraryDay).toHaveLength(3);
    expect(fake.created.itineraryItem.length).toBeGreaterThanOrEqual(6);
    expect(fake.created.place.length).toBeGreaterThanOrEqual(5);
    expect(fake.created.checklistItem.length).toBeGreaterThanOrEqual(7);
    expect(fake.created.categoryBudget.length).toBeGreaterThan(0);
    expect(fake.created.expense.length).toBeGreaterThan(0);
    expect(fake.created.transportOption.length).toBeGreaterThan(0);
    expect(fake.created.note.length).toBeGreaterThan(0);
    expect(fake.updatedDraft).toMatchObject({ status: "applied", tripId: "trip-1" });
  });

  it("does not create partial records when draft validation fails before transaction writes", async () => {
    const fake = createFakeTransaction();

    await expect(
      applyAiPlanDraft(fake.tx, {
        draftJson: null,
        id: "draft-1",
        inputJson: validInput,
        status: "draft",
      }),
    ).rejects.toThrow("AI 草稿结构无效");

    expect(fake.created.trip).toHaveLength(0);
    expect(fake.created.destination).toHaveLength(0);
  });

  it("detects sensitive information before AI calls", () => {
    const result = validateAiPlanInput({
      ...validInput,
      mustVisit: "手机号 13812345678",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.sensitive).toContain("检测到可能包含敏感信息");
    }
  });

  it("splits a total budget across categories", () => {
    const budget = splitBudget(10_000);
    const total = budget.reduce((sum, item) => sum + item.amount, 0);

    expect(total).toBe(10_000);
    expect(budget.map((item) => item.category)).toContain("交通");
    expect(budget.map((item) => item.category)).toContain("住宿");
  });

  it("generates checklist items based on travel type", () => {
    const checklist = buildChecklist(
      {
        ...validInput,
        companions: "亲子，带老人",
        preferences: ["亲子"],
        transportPreferences: ["自驾"],
      },
      new Date(2026, 9, 1),
    );

    expect(checklist.map((item) => item.category)).toContain("儿童用品");
    expect(checklist.map((item) => item.category)).toContain("老人用品");
    expect(checklist.map((item) => item.category)).toContain("自驾游");
  });
});

function createFakeTransaction() {
  type CreatedRecord = Record<string, unknown>;
  type CreateArgs = { data: CreatedRecord };

  const created = {
    categoryBudget: [] as CreatedRecord[],
    checklistItem: [] as CreatedRecord[],
    destination: [] as CreatedRecord[],
    expense: [] as CreatedRecord[],
    itineraryDay: [] as CreatedRecord[],
    itineraryItem: [] as CreatedRecord[],
    note: [] as CreatedRecord[],
    place: [] as CreatedRecord[],
    routePlan: [] as CreatedRecord[],
    transportOption: [] as CreatedRecord[],
    trip: [] as CreatedRecord[],
  };
  let updatedDraft: unknown = null;
  let id = 0;
  const nextId = (prefix: string) => `${prefix}-${++id}`;

  const tx = {
    aiPlanDraft: {
      update: async ({ data }: { data: unknown }) => {
        updatedDraft = data;
        return data;
      },
    },
    categoryBudget: {
      create: async ({ data }: CreateArgs) => {
        created.categoryBudget.push(data);
        return { id: nextId("budget"), ...data };
      },
    },
    checklistItem: {
      create: async ({ data }: CreateArgs) => {
        created.checklistItem.push(data);
        return { id: nextId("checklist"), ...data };
      },
    },
    destination: {
      create: async ({ data }: CreateArgs) => {
        created.destination.push(data);
        return { id: "destination-1" };
      },
    },
    expense: {
      create: async ({ data }: CreateArgs) => {
        created.expense.push(data);
        return { id: nextId("expense"), ...data };
      },
    },
    itineraryDay: {
      create: async ({ data }: CreateArgs) => {
        created.itineraryDay.push(data);
        return { id: `day-${created.itineraryDay.length}` };
      },
    },
    itineraryItem: {
      create: async ({ data }: CreateArgs) => {
        created.itineraryItem.push(data);
        return { id: nextId("item"), ...data };
      },
    },
    note: {
      create: async ({ data }: CreateArgs) => {
        created.note.push(data);
        return { id: nextId("note"), ...data };
      },
    },
    place: {
      create: async ({ data }: CreateArgs) => {
        created.place.push(data);
        return { id: `place-${created.place.length}`, name: String(data.name) };
      },
    },
    routePlan: {
      create: async ({ data }: CreateArgs) => {
        created.routePlan.push(data);
        return { id: "route-plan-1" };
      },
    },
    transportOption: {
      create: async ({ data }: CreateArgs) => {
        created.transportOption.push(data);
        return { id: nextId("transport"), ...data };
      },
    },
    trip: {
      create: async ({ data }: CreateArgs) => {
        created.trip.push(data);
        return { id: "trip-1" };
      },
    },
  };

  return {
    created,
    get updatedDraft() {
      return updatedDraft;
    },
    tx: tx as unknown as Parameters<typeof applyAiPlanDraft>[0],
  };
}
