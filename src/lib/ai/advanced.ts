import { AI_DRAFT_NOTICE, redactSensitivePrompt } from "@/lib/ai";

export type AdvancedAiTaskType =
  | "itinerary-optimization"
  | "route-suggestion"
  | "checklist-completion"
  | "budget-risk"
  | "conflict-explanation"
  | "trip-review";

export type AdvancedAiTaskDefinition = {
  id: AdvancedAiTaskType;
  label: string;
  promptHint: string;
};

export type AiPromptTemplates = Record<AdvancedAiTaskType, string>;

export type MinimizedTripContext = {
  budgets: Array<{ amount: string; category: string }>;
  checklistItems: Array<{ category: string; status: string; title: string }>;
  destinations: Array<{
    arrivalDate?: string;
    country?: string;
    departureDate?: string;
    name: string;
    region?: string;
  }>;
  expenses: Array<{
    amount: string;
    category: string;
    currency: string;
    paidAt?: string;
    title: string;
  }>;
  itineraryDays: Array<{
    city?: string;
    date: string;
    items: Array<{
      durationMin?: number;
      endTime?: string;
      startTime?: string;
      title: string;
      transportToNext?: string;
      type: string;
    }>;
    title?: string;
  }>;
  places: Array<{
    estimatedCost?: string;
    estimatedDurationMin?: number;
    name: string;
    priority: string;
    type: string;
  }>;
  routePlans: Array<{
    fromName: string;
    selectedOptionId?: string;
    title: string;
    toName: string;
  }>;
  transportOptions: Array<{
    arriveTime?: string;
    departTime?: string;
    doorToDoorMinutes?: number;
    fromName: string;
    mode: string;
    price?: string;
    status: string;
    toName: string;
    transferCount?: number;
  }>;
  trip: {
    baseCurrency: string;
    budgetAmount?: string;
    endDate?: string;
    homeCity?: string;
    mainDestination?: string;
    startDate?: string;
    status: string;
    title: string;
  };
  weather: Array<{
    condition?: string;
    date: string;
    locationName: string;
    temperatureMax?: number;
    temperatureMin?: number;
  }>;
};

export type StructuredAiDraftContent = {
  budgetRisks?: Array<{ category: string; reason: string; severity: "low" | "medium" | "high" }>;
  checklistItems?: Array<{
    category: string;
    importance?: "LOW" | "MEDIUM" | "HIGH";
    notes?: string;
    quantity?: number;
    title: string;
  }>;
  findings: string[];
  notice: string;
  routeOptions?: Array<{ cons: string[]; name: string; pros: string[]; reminder: string }>;
  suggestions: string[];
  summary: string;
  taskType: AdvancedAiTaskType;
};

export type AiDraftRecordForApply = {
  contentJson: unknown;
  contentText: string;
  id: string;
  status: string;
  title: string;
  tripId: string;
  type: string;
};

export const AI_ADVANCED_TASKS: AdvancedAiTaskDefinition[] = [
  {
    id: "itinerary-optimization",
    label: "行程优化",
    promptHint: "检查是否过密、时间冲突、路线绕路，并给出调整建议。",
  },
  {
    id: "route-suggestion",
    label: "路线建议",
    promptHint: "基于已录入交通方案解释优缺点，不编造实时票价和班次。",
  },
  {
    id: "checklist-completion",
    label: "清单补全",
    promptHint: "根据目的地、天气、天数、出行类型补充准备清单。",
  },
  {
    id: "budget-risk",
    label: "预算风险",
    promptHint: "检查预算不足、支出占比异常和节省建议。",
  },
  {
    id: "conflict-explanation",
    label: "冲突检测解释",
    promptHint: "解释时间、路线、预订状态和预算冲突，给出人工处理建议。",
  },
  {
    id: "trip-review",
    label: "旅行复盘",
    promptHint: "根据实际行程和支出生成总结，标记推荐和避雷。",
  },
];

export const DEFAULT_AI_PROMPT_TEMPLATES: AiPromptTemplates = {
  "budget-risk":
    "你是谨慎的旅行预算分析助手。只使用输入中的预算和支出数据，指出明显不足、异常占比和可执行节省建议。",
  "checklist-completion":
    "你是旅行出发清单助手。根据目的地、天气、天数和出行类型补齐遗漏物品，输出可由用户确认后加入清单的项目。",
  "conflict-explanation":
    "你是旅行冲突解释助手。解释时间、路线、预订状态和预算冲突，不直接修改正式行程。",
  "itinerary-optimization":
    "你是旅行行程优化助手。检查行程是否过密、时间是否冲突、路线是否绕路，并给出保守调整建议。",
  "route-suggestion":
    "你是旅行路线建议助手。只比较用户已录入交通方案的优缺点，不编造实时票价、班次或余票。",
  "trip-review":
    "你是旅行复盘助手。根据实际行程和支出总结体验，标记推荐、避雷和下次优化点。",
};

export function isAdvancedAiTaskType(value: string): value is AdvancedAiTaskType {
  return AI_ADVANCED_TASKS.some((task) => task.id === value);
}

export function getAdvancedAiTaskDefinition(
  taskType: AdvancedAiTaskType,
): AdvancedAiTaskDefinition {
  return AI_ADVANCED_TASKS.find((task) => task.id === taskType) ?? AI_ADVANCED_TASKS[0];
}

export function mergePromptTemplates(input: unknown): AiPromptTemplates {
  if (typeof input !== "object" || input === null) {
    return { ...DEFAULT_AI_PROMPT_TEMPLATES };
  }

  const record = input as Record<string, unknown>;

  return Object.fromEntries(
    AI_ADVANCED_TASKS.map((task) => {
      const value = record[task.id];
      return [
        task.id,
        typeof value === "string" && value.trim()
          ? value.trim().slice(0, 2000)
          : DEFAULT_AI_PROMPT_TEMPLATES[task.id],
      ];
    }),
  ) as AiPromptTemplates;
}

export function buildAdvancedAiPrompt(input: {
  context: MinimizedTripContext;
  taskType: AdvancedAiTaskType;
  template: string;
}): string {
  const task = getAdvancedAiTaskDefinition(input.taskType);

  return [
    input.template,
    "",
    `任务：${task.label}`,
    task.promptHint,
    "",
    "安全要求：",
    "- 只使用下方最小化旅行数据。",
    "- 不要要求、推断或输出身份证、护照、手机号、订单号等敏感信息。",
    "- 不要使用或索要上传文件内容。",
    "- 所有建议必须是 AI 草稿，需人工核验。",
    "- 结构化 JSON 必须包含 notice、summary、findings、suggestions。",
    "",
    "最小化旅行数据 JSON：",
    JSON.stringify(input.context),
  ].join("\n");
}

export function minimizeTripForAi(trip: {
  baseCurrency: string;
  budgetAmount?: { toString(): string } | number | string | null;
  categoryBudgets?: Array<{ amount: { toString(): string } | number | string; category: string }>;
  checklistItems?: Array<{ category: string; status: string; title: string }>;
  destinations?: Array<{
    arrivalDate?: Date | null;
    country?: string | null;
    departureDate?: Date | null;
    name: string;
    region?: string | null;
  }>;
  endDate?: Date | null;
  expenses?: Array<{
    amount: { toString(): string } | number | string;
    category: string;
    currency: string;
    paidAt?: Date | null;
    title: string;
  }>;
  homeCity?: string | null;
  itineraryDays?: Array<{
    city?: string | null;
    date: Date;
    items?: Array<{
      durationMin?: number | null;
      endTime?: Date | null;
      startTime?: Date | null;
      title: string;
      transportToNext?: string | null;
      type: string;
    }>;
    title?: string | null;
  }>;
  mainDestination?: string | null;
  places?: Array<{
    estimatedCost?: { toString(): string } | number | string | null;
    estimatedDurationMin?: number | null;
    name: string;
    priority: string;
    type: string;
  }>;
  routePlans?: Array<{
    fromName: string;
    selectedOptionId?: string | null;
    title: string;
    toName: string;
  }>;
  startDate?: Date | null;
  status: string;
  title: string;
  transports?: Array<{
    arriveTime?: Date | null;
    departTime?: Date | null;
    doorToDoorMinutes?: number | null;
    fromName: string;
    mode: string;
    price?: { toString(): string } | number | string | null;
    status: string;
    toName: string;
    transferCount?: number | null;
  }>;
  weatherSnapshots?: Array<{
    condition?: string | null;
    date: Date;
    locationName: string;
    temperatureMax?: number | null;
    temperatureMin?: number | null;
  }>;
}): MinimizedTripContext {
  return {
    budgets: (trip.categoryBudgets ?? []).map((budget) => ({
      amount: String(budget.amount),
      category: cleanText(budget.category),
    })),
    checklistItems: (trip.checklistItems ?? []).map((item) => ({
      category: cleanText(item.category),
      status: item.status,
      title: cleanText(item.title),
    })),
    destinations: (trip.destinations ?? []).map((destination) => ({
      arrivalDate: toDateText(destination.arrivalDate),
      country: cleanOptionalText(destination.country),
      departureDate: toDateText(destination.departureDate),
      name: cleanText(destination.name),
      region: cleanOptionalText(destination.region),
    })),
    expenses: (trip.expenses ?? []).map((expense) => ({
      amount: String(expense.amount),
      category: cleanText(expense.category),
      currency: cleanText(expense.currency),
      paidAt: toDateText(expense.paidAt),
      title: cleanText(expense.title),
    })),
    itineraryDays: (trip.itineraryDays ?? []).map((day) => ({
      city: cleanOptionalText(day.city),
      date: toDateText(day.date) ?? "",
      items: (day.items ?? []).map((item) => ({
        durationMin: item.durationMin ?? undefined,
        endTime: toTimeText(item.endTime),
        startTime: toTimeText(item.startTime),
        title: cleanText(item.title),
        transportToNext: cleanOptionalText(item.transportToNext),
        type: item.type,
      })),
      title: cleanOptionalText(day.title),
    })),
    places: (trip.places ?? []).map((place) => ({
      estimatedCost: place.estimatedCost ? String(place.estimatedCost) : undefined,
      estimatedDurationMin: place.estimatedDurationMin ?? undefined,
      name: cleanText(place.name),
      priority: place.priority,
      type: place.type,
    })),
    routePlans: (trip.routePlans ?? []).map((route) => ({
      fromName: cleanText(route.fromName),
      selectedOptionId: route.selectedOptionId ?? undefined,
      title: cleanText(route.title),
      toName: cleanText(route.toName),
    })),
    transportOptions: (trip.transports ?? []).map((transport) => ({
      arriveTime: toTimeText(transport.arriveTime),
      departTime: toTimeText(transport.departTime),
      doorToDoorMinutes: transport.doorToDoorMinutes ?? undefined,
      fromName: cleanText(transport.fromName),
      mode: transport.mode,
      price: transport.price ? String(transport.price) : undefined,
      status: transport.status,
      toName: cleanText(transport.toName),
      transferCount: transport.transferCount ?? undefined,
    })),
    trip: {
      baseCurrency: trip.baseCurrency,
      budgetAmount: trip.budgetAmount ? String(trip.budgetAmount) : undefined,
      endDate: toDateText(trip.endDate),
      homeCity: cleanOptionalText(trip.homeCity),
      mainDestination: cleanOptionalText(trip.mainDestination),
      startDate: toDateText(trip.startDate),
      status: trip.status,
      title: cleanText(trip.title),
    },
    weather: (trip.weatherSnapshots ?? []).map((weather) => ({
      condition: cleanOptionalText(weather.condition),
      date: toDateText(weather.date) ?? "",
      locationName: cleanText(weather.locationName),
      temperatureMax: weather.temperatureMax ?? undefined,
      temperatureMin: weather.temperatureMin ?? undefined,
    })),
  };
}

export function createMockStructuredDraft(
  taskType: AdvancedAiTaskType,
  context: MinimizedTripContext,
): StructuredAiDraftContent {
  const destination =
    context.trip.mainDestination || context.destinations[0]?.name || "本次目的地";
  const dayCount = Math.max(context.itineraryDays.length, 1);
  const base: StructuredAiDraftContent = {
    findings: [
      `${destination} 行程共有 ${dayCount} 天，以下建议只基于已录入数据。`,
    ],
    notice: AI_DRAFT_NOTICE,
    suggestions: ["请在官方渠道核验营业时间、票价、班次、预订规则和当地政策。"],
    summary: "AI 已生成结构化草稿，需人工核验后再应用。",
    taskType,
  };

  if (taskType === "checklist-completion") {
    return {
      ...base,
      checklistItems: [
        {
          category: "证件",
          importance: "HIGH",
          notes: "仅提醒携带，不记录证件号码。",
          quantity: 1,
          title: "证件原件与脱敏复印件",
        },
        {
          category: "电子设备",
          importance: "MEDIUM",
          quantity: 1,
          title: "充电器与移动电源",
        },
        {
          category: "药品",
          importance: "MEDIUM",
          notes: context.weather.some((item) => item.condition?.includes("雨"))
            ? "天气可能有雨，注意防潮。"
            : "按个人健康情况准备常用药。",
          quantity: 1,
          title: "常用药与创可贴",
        },
      ],
      findings: [...base.findings, "已避开身份证号、护照号、订单号等敏感字段。"],
      summary: "发现清单可补充证件、电子设备和常用药等基础项目。",
    };
  }

  if (taskType === "route-suggestion") {
    return {
      ...base,
      routeOptions: context.transportOptions.slice(0, 5).map((option) => ({
        cons: [
          option.transferCount && option.transferCount > 0
            ? `需换乘 ${option.transferCount} 次`
            : "实时班次和票价需自行核验",
        ],
        name: `${option.fromName} 到 ${option.toName} ${option.mode}`,
        pros: [
          option.doorToDoorMinutes
            ? `已录入门到门约 ${option.doorToDoorMinutes} 分钟`
            : "可作为候选方案比较",
        ],
        reminder: "不编造实时票价、班次或余票，请以官方渠道为准。",
      })),
      summary: "已根据录入的交通方案生成优缺点对比。",
    };
  }

  if (taskType === "budget-risk") {
    return {
      ...base,
      budgetRisks: buildBudgetRisks(context),
      findings: [
        ...base.findings,
        `当前已录入 ${context.expenses.length} 笔支出和 ${context.budgets.length} 个分类预算。`,
      ],
      suggestions: [
        ...base.suggestions,
        "优先核对交通和住宿两类固定成本，保留 10%-15% 机动预算。",
      ],
      summary: "已生成预算不足和分类占比异常提醒。",
    };
  }

  if (taskType === "trip-review") {
    return {
      ...base,
      findings: [
        ...base.findings,
        "推荐：保留实际体验好、交通顺的地点。",
        "避雷：记录排队过长、交通不便或预算超出明显的安排。",
      ],
      summary: "已根据实际行程和支出生成复盘草稿。",
    };
  }

  return {
    ...base,
    findings: [
      ...base.findings,
      "若同一天连续项目间隔不足，建议删减或移动低优先级项目。",
      "若跨城或远距离移动集中在同一天，建议拆分住宿或调整顺序。",
    ],
    suggestions: [
      ...base.suggestions,
      "先确认必去项目，再把可选项目移动到机动时段。",
      "对交通时间未知的段落，先补录门到门时间再决策。",
    ],
    summary:
      taskType === "conflict-explanation"
        ? "已生成冲突解释草稿，不会直接覆盖正式行程。"
        : "已生成行程优化草稿，不会直接覆盖正式行程。",
  };
}

export function parseStructuredAiDraft(
  taskType: AdvancedAiTaskType,
  rawText: string,
): StructuredAiDraftContent {
  const jsonText = stripJsonFence(rawText);
  const parsed = JSON.parse(jsonText) as Partial<StructuredAiDraftContent>;

  return normalizeStructuredDraft(taskType, parsed);
}

export function normalizeStructuredDraft(
  taskType: AdvancedAiTaskType,
  parsed: Partial<StructuredAiDraftContent>,
): StructuredAiDraftContent {
  return {
    budgetRisks: Array.isArray(parsed.budgetRisks)
      ? parsed.budgetRisks
          .map(normalizeBudgetRisk)
          .filter((risk): risk is NonNullable<ReturnType<typeof normalizeBudgetRisk>> => Boolean(risk))
      : undefined,
    checklistItems: Array.isArray(parsed.checklistItems)
      ? parsed.checklistItems
          .map(normalizeChecklistDraftItem)
          .filter((item): item is NonNullable<ReturnType<typeof normalizeChecklistDraftItem>> => Boolean(item))
      : undefined,
    findings: normalizeStringArray(parsed.findings),
    notice: AI_DRAFT_NOTICE,
    routeOptions: Array.isArray(parsed.routeOptions)
      ? parsed.routeOptions
          .map(normalizeRouteOption)
          .filter((option): option is NonNullable<ReturnType<typeof normalizeRouteOption>> => Boolean(option))
      : undefined,
    suggestions: normalizeStringArray(parsed.suggestions),
    summary:
      typeof parsed.summary === "string" && parsed.summary.trim()
        ? cleanText(parsed.summary)
        : "AI 已生成结构化草稿，需人工核验。",
    taskType,
  };
}

export function buildAiDraftText(
  title: string,
  content: StructuredAiDraftContent,
): string {
  const lines = [
    AI_DRAFT_NOTICE,
    "",
    `# ${title}`,
    "",
    `## 摘要`,
    content.summary,
    "",
    "## 发现",
    ...content.findings.map((item) => `- ${item}`),
    "",
    "## 建议",
    ...content.suggestions.map((item) => `- ${item}`),
  ];

  if (content.checklistItems?.length) {
    lines.push("", "## 待确认清单项");
    lines.push(
      ...content.checklistItems.map(
        (item) => `- [${item.category}] ${item.title} x${item.quantity ?? 1}`,
      ),
    );
  }

  if (content.routeOptions?.length) {
    lines.push("", "## 路线方案");
    for (const option of content.routeOptions) {
      lines.push(`- ${option.name}：优点 ${option.pros.join("、")}；注意 ${option.cons.join("、")}。${option.reminder}`);
    }
  }

  if (content.budgetRisks?.length) {
    lines.push("", "## 预算风险");
    lines.push(
      ...content.budgetRisks.map(
        (risk) => `- ${risk.category}：${risk.reason}（${risk.severity}）`,
      ),
    );
  }

  return lines.join("\n");
}

export async function applyAiDraftToTrip(
  tx: AiDraftApplyClient,
  draft: AiDraftRecordForApply,
): Promise<{ checklistItemsCreated: number; noteCreated: boolean }> {
  if (draft.status !== "draft") {
    throw new Error("AI 草稿不是待应用状态。");
  }

  if (!isRecord(draft.contentJson)) {
    throw new Error("AI 草稿结构无效，无法应用。");
  }

  const structured = normalizeStructuredDraft(
    isAdvancedAiTaskType(draft.type) ? draft.type : "itinerary-optimization",
    draft.contentJson,
  );
  let checklistItemsCreated = 0;
  let noteCreated = false;

  if (draft.type === "checklist-completion") {
    if (!structured.checklistItems?.length) {
      throw new Error("清单草稿没有可应用的清单项。");
    }

    const existingItems = await tx.checklistItem.findMany({
      select: { category: true, title: true },
      where: { tripId: draft.tripId },
    });
    const existingKeys = new Set(
      existingItems.map((item) => `${item.category}:${item.title}`),
    );
    const itemsToCreate = structured.checklistItems.filter(
      (item) => !existingKeys.has(`${item.category}:${item.title}`),
    );

    if (itemsToCreate.length === 0) {
      throw new Error("清单草稿中的项目已存在，没有新的可应用项。");
    }

    await tx.checklistItem.createMany({
      data: itemsToCreate.map((item) => ({
        category: item.category,
        importance: item.importance ?? "MEDIUM",
        notes: item.notes ?? AI_DRAFT_NOTICE,
        quantity: Math.max(item.quantity ?? 1, 1),
        title: item.title,
        tripId: draft.tripId,
      })),
    });
    checklistItemsCreated = itemsToCreate.length;
  } else {
    await tx.note.create({
      data: {
        content: draft.contentText.includes(AI_DRAFT_NOTICE)
          ? draft.contentText
          : `${AI_DRAFT_NOTICE}\n\n${draft.contentText}`,
        tags: ["AI草稿", draft.type],
        title: draft.title,
        tripId: draft.tripId,
      },
    });
    noteCreated = true;
  }

  await tx.aiDraft.update({
    data: { status: "applied" },
    where: { id: draft.id },
  });

  return { checklistItemsCreated, noteCreated };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type AiDraftApplyClient = {
  aiDraft: {
    update(args: { data: { status: "applied" }; where: { id: string } }): Promise<unknown>;
  };
  checklistItem: {
    createMany(args: {
      data: Array<{
        category: string;
        importance: "LOW" | "MEDIUM" | "HIGH";
        notes: string;
        quantity: number;
        title: string;
        tripId: string;
      }>;
    }): Promise<unknown>;
    findMany(args: {
      select: { category: true; title: true };
      where: { tripId: string };
    }): Promise<Array<{ category: string; title: string }>>;
  };
  note: {
    create(args: {
      data: {
        content: string;
        tags: string[];
        title: string;
        tripId: string;
      };
    }): Promise<unknown>;
  };
};

function buildBudgetRisks(
  context: MinimizedTripContext,
): NonNullable<StructuredAiDraftContent["budgetRisks"]> {
  const totalBudget = Number(context.trip.budgetAmount ?? 0);
  const totalExpense = context.expenses.reduce(
    (sum, expense) => sum + Number(expense.amount || 0),
    0,
  );
  const risks: StructuredAiDraftContent["budgetRisks"] = [];

  if (totalBudget > 0 && totalExpense > totalBudget * 0.9) {
    risks.push({
      category: "总预算",
      reason: "已录入支出接近或超过总预算，建议保留机动资金。",
      severity: "high",
    });
  }

  const byCategory = new Map<string, number>();
  for (const expense of context.expenses) {
    byCategory.set(
      expense.category,
      (byCategory.get(expense.category) ?? 0) + Number(expense.amount || 0),
    );
  }

  for (const [category, amount] of byCategory) {
    if (totalExpense > 0 && amount / totalExpense > 0.6) {
      risks.push({
        category,
        reason: "该分类占已录入支出超过 60%，需要确认是否合理。",
        severity: "medium",
      });
    }
  }

  return risks.length
    ? risks
    : [
        {
          category: "预算",
          reason: "暂未发现明显异常，但仍建议核对未录入的交通和住宿固定成本。",
          severity: "low",
        },
      ];
}

function normalizeChecklistDraftItem(
  value: unknown,
): NonNullable<StructuredAiDraftContent["checklistItems"]>[number] | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const title = typeof record.title === "string" ? cleanText(record.title) : "";

  if (!title) {
    return null;
  }

  const importance = record.importance;

  return {
    category:
      typeof record.category === "string" && record.category.trim()
        ? cleanText(record.category).slice(0, 30)
        : "其他",
    importance:
      importance === "LOW" || importance === "MEDIUM" || importance === "HIGH"
        ? importance
        : "MEDIUM",
    notes:
      typeof record.notes === "string" && record.notes.trim()
        ? cleanText(record.notes).slice(0, 500)
        : undefined,
    quantity:
      typeof record.quantity === "number" && Number.isFinite(record.quantity)
        ? Math.max(Math.trunc(record.quantity), 1)
        : 1,
    title: title.slice(0, 100),
  };
}

function normalizeBudgetRisk(
  value: unknown,
): NonNullable<StructuredAiDraftContent["budgetRisks"]>[number] | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const severity = record.severity;

  return {
    category:
      typeof record.category === "string" && record.category.trim()
        ? cleanText(record.category).slice(0, 40)
        : "预算",
    reason:
      typeof record.reason === "string" && record.reason.trim()
        ? cleanText(record.reason).slice(0, 300)
        : "需要人工核验预算风险。",
    severity:
      severity === "low" || severity === "medium" || severity === "high"
        ? severity
        : "medium",
  };
}

function normalizeRouteOption(
  value: unknown,
): NonNullable<StructuredAiDraftContent["routeOptions"]>[number] | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const name = typeof record.name === "string" ? cleanText(record.name) : "";

  if (!name) {
    return null;
  }

  return {
    cons: normalizeStringArray(record.cons),
    name: name.slice(0, 120),
    pros: normalizeStringArray(record.pros),
    reminder:
      typeof record.reminder === "string" && record.reminder.trim()
        ? cleanText(record.reminder).slice(0, 300)
        : "请以官方渠道核验实时票价和班次。",
  };
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return ["AI 草稿需人工核验后再使用。"];
  }

  const normalized = value
    .map((item) => (typeof item === "string" ? cleanText(item) : ""))
    .filter(Boolean)
    .slice(0, 12);

  return normalized.length ? normalized : ["AI 草稿需人工核验后再使用。"];
}

function cleanText(value: string): string {
  return redactSensitivePrompt(value).replace(/\s+/g, " ").trim();
}

function cleanOptionalText(value?: string | null): string | undefined {
  return value ? cleanText(value) : undefined;
}

function toDateText(value?: Date | null): string | undefined {
  return value ? value.toISOString().slice(0, 10) : undefined;
}

function toTimeText(value?: Date | null): string | undefined {
  return value ? value.toISOString() : undefined;
}

function stripJsonFence(rawText: string): string {
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

  return fenced?.[1] ?? trimmed;
}
