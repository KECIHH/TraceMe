import { describe, expect, it } from "vitest";

import {
  applyAiPlanDraft,
  appendAiPlanRegenerationVersion,
  buildAiPlanChangePreview,
  buildChecklist,
  calculateTripDays,
  defaultAiPlanInput,
  generateAiPlanWorkspace,
  generateMockAiPlan,
  getSelectedAiPlanOption,
  normalizeAiPlanInput,
  parseAiPlanJson,
  reviseAiPlanWorkspace,
  rollbackAiPlanWorkspace,
  sanitizeAiPlanInput,
  scoreStructuredTripPlan,
  selectAiPlanOption,
  splitBudget,
  validateAiPlanInput,
  validateAiPlanWorkspace,
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

  it("normalizes AI planning input before generation", () => {
    const result = normalizeAiPlanInput({
      ...validInput,
      destination: "  成都  ",
      pace: "fast" as AiPlanInput["pace"],
      preferences: ["美食", "美食", "不存在"],
      stayPreferences: ["交通方便", "不存在"],
      transportPreferences: ["高铁", "少换乘", "飞船"],
      travelGoal: "  带父母轻松吃逛  ",
    });

    expect(result.destination).toBe("成都");
    expect(result.pace).toBe("balanced");
    expect(result.preferences).toEqual(["美食"]);
    expect(result.stayPreferences).toEqual(["交通方便"]);
    expect(result.transportPreferences).toEqual(["高铁", "少换乘"]);
    expect(result.travelGoal).toBe("带父母轻松吃逛");
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

  it("redacts sensitive information before saving AI input", () => {
    const sanitized = sanitizeAiPlanInput({
      ...validInput,
      mustVisit: "护照：E12345678",
      travelGoal: "电话：13812345678，订单号 ABCD123456",
    });

    expect(sanitized.mustVisit).not.toContain("E12345678");
    expect(sanitized.travelGoal).not.toContain("13812345678");
    expect(sanitized.travelGoal).not.toContain("ABCD123456");
    expect(sanitized.mustVisit).toContain("已脱敏");
    expect(sanitized.travelGoal).toContain("已脱敏");
  });

  it("scores plan options by budget, ease, route, and family friendliness", () => {
    const plan = generateMockAiPlan(validInput);
    const score = scoreStructuredTripPlan(plan, validInput);
    const overBudgetScore = scoreStructuredTripPlan(
      {
        ...plan,
        budget: {
          ...plan.budget,
          totalAmount: Number(validInput.budgetAmount) * 2,
        },
        trip: {
          ...plan.trip,
          budgetAmount: Number(validInput.budgetAmount) * 2,
        },
      },
      validInput,
    );

    expect(score.overall).toBeGreaterThan(0);
    expect(score.overall).toBeLessThanOrEqual(100);
    expect(score.reasons).toHaveLength(3);
    expect(overBudgetScore.budgetMatch).toBeLessThan(score.budgetMatch);
  });

  it("creates comparable AI options with change preview counts", async () => {
    const result = await generateAiPlanWorkspace(
      {
        ...validInput,
        travelGoal: "带父母轻松吃逛，尽量少排队",
      },
      {},
    );

    const validation = validateAiPlanWorkspace(result.workspace);
    expect(result.provider).toBe("mock");
    expect(validation.ok).toBe(true);
    expect(result.workspace.options).toHaveLength(3);
    expect(result.workspace.versions).toHaveLength(1);

    const preview = buildAiPlanChangePreview(
      getSelectedAiPlanOption(result.workspace).plan,
    );
    expect(preview.trips).toBe(1);
    expect(preview.itineraryDays).toBe(3);
    expect(preview.itineraryItems).toBeGreaterThanOrEqual(6);
  });

  it("converts the selected AI workspace option into Trip module data", async () => {
    const { workspace } = await generateAiPlanWorkspace(validInput, {});
    const targetOption = workspace.options.find(
      (option) => option.id !== workspace.selectedOptionId,
    );
    expect(targetOption).toBeDefined();

    const selectedWorkspace = selectAiPlanOption(workspace, targetOption!.id);
    const selectedPlan = getSelectedAiPlanOption(selectedWorkspace).plan;
    const fake = createFakeTransaction();

    const tripId = await applyAiPlanDraft(fake.tx, {
      draftJson: selectedWorkspace as Parameters<typeof applyAiPlanDraft>[1]["draftJson"],
      id: "draft-1",
      inputJson: validInput,
      status: "draft",
    });

    expect(tripId).toBe("trip-1");
    expect(fake.created.trip[0].title).toBe(selectedPlan.trip.title);
    expect(fake.created.itineraryDay).toHaveLength(selectedPlan.itineraryDays.length);
    expect(fake.created.note.length).toBeGreaterThanOrEqual(selectedPlan.notes.length);
    expect(fake.updatedDraft).toMatchObject({ status: "applied", tripId: "trip-1" });
  });

  it("keeps version history for selection, revision, and rollback", async () => {
    const { workspace } = await generateAiPlanWorkspace(validInput, {});
    const targetOption = workspace.options.find(
      (option) => option.id !== workspace.selectedOptionId,
    );
    expect(targetOption).toBeDefined();

    const selected = selectAiPlanOption(workspace, targetOption!.id);
    const revised = reviseAiPlanWorkspace(
      selected,
      "第二天更轻松一点，预算便宜一点，交通少换乘。",
    );
    const restored = rollbackAiPlanWorkspace(revised, revised.versions[0].id);

    expect(selected.versions).toHaveLength(2);
    expect(revised.versions).toHaveLength(3);
    expect(revised.versions.at(-1)?.changeRequest).toContain("第二天");
    expect(getSelectedAiPlanOption(revised).plan.trip.title).toContain("已调整");
    expect(restored.selectedOptionId).toBe(revised.versions[0].optionId);
    expect(restored.versions).toHaveLength(4);
  });

  it("preserves version history when a draft is regenerated", async () => {
    const first = await generateAiPlanWorkspace(validInput, {});
    const revised = reviseAiPlanWorkspace(
      first.workspace,
      "第二天更轻松一点，预算便宜一点。",
    );
    const next = await generateAiPlanWorkspace(
      {
        ...validInput,
        travelGoal: "重新生成一个更轻松的版本",
      },
      {},
    );

    const regenerated = appendAiPlanRegenerationVersion(
      revised,
      next.workspace,
    );

    expect(regenerated.versions).toHaveLength(revised.versions.length + 1);
    expect(regenerated.versions.at(-1)?.changeRequest).toBe("重新生成 AI 方案");
    expect(regenerated.selectedOptionId).toBe(next.workspace.selectedOptionId);
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
