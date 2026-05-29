import { Prisma } from "@prisma/client";
import type {
  ItineraryItemType,
  PlaceType,
  Priority,
  TransportMode,
} from "@prisma/client";

import {
  AI_DRAFT_NOTICE,
  buildSystemPrompt,
  createAiProvider,
  findSensitivePromptLabels,
  getAiProviderConfig,
  redactSensitivePrompt,
  type AiGenerateRequest,
} from "@/lib/ai";
import { BUDGET_CATEGORIES, normalizeExpenseCategory } from "@/lib/budget";
import { combineDateAndTime, generateDateRange } from "@/lib/itinerary";
import { parseDateInput } from "@/lib/trip-management";

export const AI_PLAN_TASK_ID = "structured-trip-plan";
export const AI_PLAN_SCHEMA_VERSION = 1;
export const AI_PLAN_SENSITIVE_MESSAGE =
  "检测到可能包含敏感信息。请删除身份证、护照、手机号、订单号等内容后再生成。";

export type AiPlanInput = {
  avoid: string;
  budgetAmount: string;
  companions: string;
  destination: string;
  endDate: string;
  homeCity: string;
  mustVisit: string;
  pace: "relaxed" | "balanced" | "packed" | "";
  people: string;
  preferences: string[];
  startDate: string;
  stayPreferences: string[];
  transportPreferences: string[];
};

export type AiPlanValidationResult =
  | { errors: Partial<Record<keyof AiPlanInput | "sensitive", string>>; ok: false; values: AiPlanInput }
  | { ok: true; values: AiPlanInput };

export type StructuredTripPlan = {
  budget: {
    currency: string;
    isRoughEstimate: boolean;
    notes: string;
    totalAmount: number;
  };
  categoryBudgets: Array<{
    amount: number;
    category: string;
    notes?: string;
  }>;
  checklistItems: Array<{
    category: string;
    dueDate?: string;
    importance: Priority;
    notes?: string;
    quantity?: number;
    title: string;
  }>;
  destination: {
    countryOrRegion?: string;
    name: string;
    notes: string;
    stayDays: number;
  };
  expenses: Array<{
    amount: number;
    category: string;
    currency: string;
    notes?: string;
    title: string;
  }>;
  itineraryDays: Array<{
    city: string;
    date: string;
    items: Array<{
      costEstimate?: number;
      durationMin?: number;
      endTime?: string;
      notes?: string;
      placeName?: string;
      priority: Priority;
      sortOrder: number;
      startTime?: string;
      title: string;
      type: ItineraryItemType;
    }>;
    notes: string;
    theme: string;
    title: string;
  }>;
  notes: Array<{
    content: string;
    tags: string[];
    title: string;
  }>;
  places: Array<{
    estimatedCost?: number;
    estimatedDurationMin?: number;
    name: string;
    notes?: string;
    priority: Priority;
    reason: string;
    tags: string[];
    type: PlaceType;
  }>;
  schemaVersion: number;
  transportOptions: Array<{
    estimatedCost?: number;
    estimatedMinutes?: number;
    fromName: string;
    mode: TransportMode;
    notes: string;
    toName: string;
    transferCount?: number;
  }>;
  trip: {
    baseCurrency: string;
    budgetAmount?: number;
    description: string;
    endDate: string;
    homeCity: string;
    mainDestination: string;
    startDate: string;
    theme: string;
    title: string;
  };
  verificationChecklist: string[];
};

export const defaultAiPlanInput: AiPlanInput = {
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
};

export const AI_PLAN_PREFERENCE_OPTIONS = [
  "亲子",
  "美食",
  "自然",
  "历史",
  "购物",
  "摄影",
  "慢旅行",
];

export const AI_PLAN_TRANSPORT_OPTIONS = [
  "高铁",
  "飞机",
  "公共交通",
  "自驾",
  "少换乘",
];

export const AI_PLAN_STAY_OPTIONS = ["交通方便", "安静", "预算优先"];

const paceLabelMap: Record<Exclude<AiPlanInput["pace"], "">, string> = {
  balanced: "适中",
  packed: "紧凑",
  relaxed: "轻松",
};

const itineraryItemTypeValues: ItineraryItemType[] = [
  "ATTRACTION",
  "DINING",
  "TRANSPORT",
  "LODGING",
  "SHOPPING",
  "REST",
  "CUSTOM",
];

const placeTypeValues: PlaceType[] = [
  "ATTRACTION",
  "RESTAURANT",
  "HOTEL",
  "STATION",
  "AIRPORT",
  "STORE",
  "HOSPITAL",
  "EMBASSY",
  "EMERGENCY",
  "TRANSPORT",
  "SHOPPING",
  "ACTIVITY",
  "OTHER",
];

const priorityValues: Priority[] = ["LOW", "MEDIUM", "HIGH", "AVOID"];

const transportModeValues: TransportMode[] = [
  "WALK",
  "BIKE",
  "TAXI",
  "RIDESHARE",
  "BUS",
  "COACH",
  "METRO",
  "TRAIN",
  "FLIGHT",
  "FERRY",
  "CAR",
  "OTHER",
];

export function formDataToAiPlanInput(formData: FormData): AiPlanInput {
  return {
    avoid: formValue(formData, "avoid"),
    budgetAmount: formValue(formData, "budgetAmount"),
    companions: formValue(formData, "companions"),
    destination: formValue(formData, "destination"),
    endDate: formValue(formData, "endDate"),
    homeCity: formValue(formData, "homeCity"),
    mustVisit: formValue(formData, "mustVisit"),
    pace: parsePace(formValue(formData, "pace")),
    people: formValue(formData, "people"),
    preferences: formData.getAll("preferences").map(String),
    startDate: formValue(formData, "startDate"),
    stayPreferences: formData.getAll("stayPreferences").map(String),
    transportPreferences: formData.getAll("transportPreferences").map(String),
  };
}

export function validateAiPlanInput(values: AiPlanInput): AiPlanValidationResult {
  const normalized = normalizeAiPlanInput(values);
  const errors: Partial<Record<keyof AiPlanInput | "sensitive", string>> = {};

  if (!normalized.destination) {
    errors.destination = "请填写目的地。";
  }

  if (!normalized.homeCity) {
    errors.homeCity = "请填写出发城市。";
  }

  const startDate = parseDateInput(normalized.startDate);
  const endDate = parseDateInput(normalized.endDate);

  if (!normalized.startDate || !startDate) {
    errors.startDate = "请输入有效的出发日期。";
  }

  if (!normalized.endDate || !endDate) {
    errors.endDate = "请输入有效的返回日期。";
  }

  if (startDate && endDate && endDate < startDate) {
    errors.endDate = "返回日期不能早于出发日期。";
  }

  if (startDate && endDate && calculateTripDays(startDate, endDate) > 30) {
    errors.endDate = "AI 规划暂时支持 30 天以内的旅行。";
  }

  if (normalized.people && !isPositiveInteger(normalized.people)) {
    errors.people = "出行人数必须是正整数。";
  }

  if (normalized.budgetAmount && !isNonNegativeNumber(normalized.budgetAmount)) {
    errors.budgetAmount = "预算不能小于 0。";
  }

  const sensitiveLabels = findSensitivePromptLabels(inputToPromptText(normalized));
  if (sensitiveLabels.length > 0) {
    errors.sensitive = `${AI_PLAN_SENSITIVE_MESSAGE} 检测到：${sensitiveLabels.join("、")}。`;
  }

  return Object.keys(errors).length > 0
    ? { errors, ok: false, values: normalized }
    : { ok: true, values: normalized };
}

export function normalizeAiPlanInput(values: AiPlanInput): AiPlanInput {
  return {
    avoid: values.avoid.trim(),
    budgetAmount: values.budgetAmount.trim(),
    companions: values.companions.trim(),
    destination: values.destination.trim(),
    endDate: values.endDate.trim(),
    homeCity: values.homeCity.trim(),
    mustVisit: values.mustVisit.trim(),
    pace: parsePace(values.pace),
    people: values.people.trim(),
    preferences: normalizeSelectedValues(
      values.preferences,
      AI_PLAN_PREFERENCE_OPTIONS,
    ),
    startDate: values.startDate.trim(),
    stayPreferences: normalizeSelectedValues(
      values.stayPreferences,
      AI_PLAN_STAY_OPTIONS,
    ),
    transportPreferences: normalizeSelectedValues(
      values.transportPreferences,
      AI_PLAN_TRANSPORT_OPTIONS,
    ),
  };
}

export function calculateTripDays(startDate: Date, endDate: Date): number {
  return generateDateRange(startDate, endDate).length;
}

export function buildStructuredPlanPrompt(input: AiPlanInput): string {
  const safeInput = sanitizeAiPlanInput(input);
  const dayCount = calculateTripDays(
    parseDateInput(safeInput.startDate) ?? new Date(),
    parseDateInput(safeInput.endDate) ?? new Date(),
  );

  return [
    "TRACE_ME_STRUCTURED_TRIP_PLAN_JSON",
    "请根据以下输入生成一份结构化旅行计划草稿，只返回 JSON，不要返回 Markdown，不要使用代码块。",
    "不要编造实时票价、实时班次、航班号、车次、酒店实时库存或天气实况。",
    "不确定的信息写入“不确定，需确认”。所有票价、班次、营业时间、预约、政策均提醒用户查询官方渠道。",
    `旅行天数必须正好为 ${dayCount} 天，每天 2-4 个 itineraryItems。`,
    "JSON 顶层字段必须匹配：schemaVersion, trip, destination, itineraryDays, places, transportOptions, checklistItems, categoryBudgets, expenses, notes, budget, verificationChecklist。",
    "枚举只能使用英文值：ItineraryItemType=ATTRACTION/DINING/TRANSPORT/LODGING/SHOPPING/REST/CUSTOM; PlaceType=ATTRACTION/RESTAURANT/HOTEL/STATION/AIRPORT/STORE/HOSPITAL/EMERGENCY/TRANSPORT/SHOPPING/ACTIVITY/OTHER; Priority=LOW/MEDIUM/HIGH/AVOID; TransportMode=WALK/BIKE/TAXI/BUS/COACH/METRO/TRAIN/FLIGHT/FERRY/CAR/OTHER。",
    "时间使用 HH:mm，日期使用 YYYY-MM-DD，金额使用数字，货币默认 CNY。",
    "用户输入 JSON：",
    JSON.stringify(safeInput, null, 2),
  ].join("\n");
}

export async function generateStructuredTripPlan(
  input: AiPlanInput,
  env: Record<string, string | undefined> = process.env,
): Promise<{
  model: string;
  plan: StructuredTripPlan;
  provider: "mock" | "openai";
}> {
  const config = getAiProviderConfig(env);

  if (!config.configured || config.provider === "mock") {
    return {
      model: "mock-travel-plan",
      plan: generateMockAiPlan(input),
      provider: "mock",
    };
  }

  const provider = createAiProvider(env);
  const request: AiGenerateRequest = {
    maxOutputTokens: 6000,
    systemPrompt: [
      buildSystemPrompt(),
      "你现在是 TraceMe 的结构化旅行计划生成器。",
      "你必须只返回可解析 JSON，不得返回 Markdown。",
      "不得接收、索要或回显文件内容、密码、session、API Key、环境变量。",
    ].join("\n"),
    task: {
      fields: [],
      id: "itinerary-draft",
      label: "AI 结构化旅行计划",
      outputSections: [],
      placeholder: "",
    },
    userPrompt: buildStructuredPlanPrompt(input),
  };
  const responseText = await provider.generateText(request);

  return {
    model: config.model,
    plan: parseAiPlanJson(responseText),
    provider: "openai",
  };
}

export function generateMockAiPlan(values: AiPlanInput): StructuredTripPlan {
  const input = normalizeAiPlanInput(values);
  const startDate = parseDateInput(input.startDate);
  const endDate = parseDateInput(input.endDate);

  if (!startDate || !endDate) {
    throw new Error("mock plan requires a valid date range");
  }

  const dates = generateDateRange(startDate, endDate);
  const dayCount = dates.length;
  const people = Number(input.people || "2");
  const totalBudget = input.budgetAmount
    ? Number(input.budgetAmount)
    : estimateDefaultBudget(dayCount, people, input.destination);
  const categories = splitBudget(totalBudget);
  const destination = input.destination;
  const paceText = input.pace ? paceLabelMap[input.pace] : "适中";
  const preferenceText =
    input.preferences.length > 0 ? input.preferences.join("、") : "城市漫步与当地体验";
  const mustVisit = splitFreeText(input.mustVisit);
  const avoidText = input.avoid || "未填写";

  const places = buildMockPlaces(destination, input);
  const dailyTemplates = buildDailyTemplates(destination, input, mustVisit);

  return {
    budget: {
      currency: "CNY",
      isRoughEstimate: !input.budgetAmount,
      notes: input.budgetAmount
        ? "已按用户填写总预算做分类拆分，仍需结合实时价格核验。"
        : "用户未填写预算，以下为粗略估算，需按实际消费能力调整。",
      totalAmount: totalBudget,
    },
    categoryBudgets: categories.map((item) => ({
      amount: item.amount,
      category: item.category,
      notes: "AI 分类预算建议，非实时价格。",
    })),
    checklistItems: buildChecklist(input, startDate),
    destination: {
      countryOrRegion: "不确定，需确认",
      name: destination,
      notes: `建议停留 ${dayCount} 天。围绕${preferenceText}安排，避开事项：${avoidText}。`,
      stayDays: dayCount,
    },
    expenses: categories.map((item) => ({
      amount: item.amount,
      category: item.category,
      currency: "CNY",
      notes: "AI 估算项，用于预算预览，不代表已实际支付。",
      title: `AI 估算：${item.category}`,
    })),
    itineraryDays: dates.map((date, index) => {
      const template = dailyTemplates[index % dailyTemplates.length];
      const dateText = formatDate(date);
      const items = template.items.map((item, itemIndex) => ({
        ...item,
        costEstimate: scaleCost(item.costEstimate ?? 0, totalBudget, dayCount),
        placeName: item.placeName ?? places[itemIndex % places.length]?.name,
        sortOrder: itemIndex + 1,
      }));

      return {
        city: destination,
        date: dateText,
        items,
        notes: `AI 草稿。当天节奏为${paceText}，请核验开放时间、预约要求、交通耗时与天气。`,
        theme: template.theme,
        title: `Day ${index + 1} ${template.theme}`,
      };
    }),
    notes: [
      {
        content: [
          AI_DRAFT_NOTICE,
          "本计划未接入实时票务、酒店、地图路线或天气 API。",
          "请逐项核验营业时间、门票、预约、交通班次、政策变化和安全风险。",
          `出行偏好：${preferenceText}；节奏：${paceText}；同行人：${input.companions || "未填写"}。`,
        ].join("\n"),
        tags: ["AI草稿", "人工核验"],
        title: "AI 旅行计划核验说明",
      },
    ],
    places,
    schemaVersion: AI_PLAN_SCHEMA_VERSION,
    transportOptions: buildMockTransportOptions(input),
    trip: {
      baseCurrency: "CNY",
      budgetAmount: totalBudget,
      description: `${AI_DRAFT_NOTICE} 以${preferenceText}为主题，${input.homeCity}出发，${dayCount}天${destination}旅行草稿。`,
      endDate: input.endDate,
      homeCity: input.homeCity,
      mainDestination: destination,
      startDate: input.startDate,
      theme: `${preferenceText} / ${paceText}`,
      title: `${destination}${dayCount}日 AI 旅行计划`,
    },
    verificationChecklist: [
      "查询官方交通渠道确认班次、时刻和价格。",
      "查询景区、餐厅、场馆官方渠道确认营业时间、预约和门票。",
      "确认住宿区域安全性、通勤时间和实际库存。",
      "出行前核验天气、证件、保险、签证或当地政策。",
    ],
  };
}

export function parseAiPlanJson(text: string): StructuredTripPlan {
  const jsonText = extractJsonText(text);
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("AI 返回内容不是可解析的 JSON，请重新生成。");
  }

  const validation = validateStructuredTripPlan(parsed);
  if (!validation.ok) {
    throw new Error(`AI JSON 结构不符合要求：${validation.errors.join("；")}`);
  }

  return validation.plan;
}

export function validateStructuredTripPlan(
  value: unknown,
): { errors: string[]; ok: false } | { ok: true; plan: StructuredTripPlan } {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return { errors: ["顶层必须是对象"], ok: false };
  }

  const plan = value as StructuredTripPlan;

  if (plan.schemaVersion !== AI_PLAN_SCHEMA_VERSION) {
    errors.push("schemaVersion 必须为 1");
  }

  if (!isRecord(plan.trip)) {
    errors.push("缺少 trip");
  } else {
    requireString(plan.trip.title, "trip.title", errors);
    requireString(plan.trip.description, "trip.description", errors);
    requireString(plan.trip.mainDestination, "trip.mainDestination", errors);
    requireString(plan.trip.homeCity, "trip.homeCity", errors);
    requireValidDate(plan.trip.startDate, "trip.startDate", errors);
    requireValidDate(plan.trip.endDate, "trip.endDate", errors);
  }

  if (!isRecord(plan.destination)) {
    errors.push("缺少 destination");
  } else {
    requireString(plan.destination.name, "destination.name", errors);
    requireString(plan.destination.notes, "destination.notes", errors);
  }

  if (!Array.isArray(plan.itineraryDays) || plan.itineraryDays.length === 0) {
    errors.push("itineraryDays 至少需要 1 天");
  } else {
    for (const [dayIndex, day] of plan.itineraryDays.entries()) {
      requireValidDate(day.date, `itineraryDays[${dayIndex}].date`, errors);
      if (!Array.isArray(day.items) || day.items.length < 2 || day.items.length > 4) {
        errors.push(`itineraryDays[${dayIndex}].items 必须有 2-4 项`);
      } else {
        for (const [itemIndex, item] of day.items.entries()) {
          requireString(
            item.title,
            `itineraryDays[${dayIndex}].items[${itemIndex}].title`,
            errors,
          );
          if (!itineraryItemTypeValues.includes(item.type)) {
            errors.push(`itineraryDays[${dayIndex}].items[${itemIndex}].type 无效`);
          }
          if (!priorityValues.includes(item.priority)) {
            errors.push(
              `itineraryDays[${dayIndex}].items[${itemIndex}].priority 无效`,
            );
          }
        }
      }
    }
  }

  validateArray(plan.places, "places", errors);
  validateArray(plan.transportOptions, "transportOptions", errors);
  validateArray(plan.checklistItems, "checklistItems", errors);
  validateArray(plan.categoryBudgets, "categoryBudgets", errors);
  validateArray(plan.notes, "notes", errors);

  if (Array.isArray(plan.places)) {
    for (const [index, place] of plan.places.entries()) {
      requireString(place.name, `places[${index}].name`, errors);
      if (!placeTypeValues.includes(place.type)) {
        errors.push(`places[${index}].type 无效`);
      }
      if (!priorityValues.includes(place.priority)) {
        errors.push(`places[${index}].priority 无效`);
      }
    }
  }

  if (Array.isArray(plan.transportOptions)) {
    for (const [index, option] of plan.transportOptions.entries()) {
      requireString(option.fromName, `transportOptions[${index}].fromName`, errors);
      requireString(option.toName, `transportOptions[${index}].toName`, errors);
      if (!transportModeValues.includes(option.mode)) {
        errors.push(`transportOptions[${index}].mode 无效`);
      }
    }
  }

  if (plan.trip?.startDate && plan.trip?.endDate && Array.isArray(plan.itineraryDays)) {
    const start = parseDateInput(plan.trip.startDate);
    const end = parseDateInput(plan.trip.endDate);
    if (start && end) {
      const expectedDays = calculateTripDays(start, end);
      if (plan.itineraryDays.length !== expectedDays) {
        errors.push(`行程天数应为 ${expectedDays} 天`);
      }
    }
  }

  return errors.length > 0 ? { errors, ok: false } : { ok: true, plan };
}

export function sanitizeAiPlanInput(input: AiPlanInput): AiPlanInput {
  const normalized = normalizeAiPlanInput(input);
  return {
    ...normalized,
    avoid: redactSensitivePrompt(normalized.avoid),
    companions: redactSensitivePrompt(normalized.companions),
    mustVisit: redactSensitivePrompt(normalized.mustVisit),
  };
}

export function structuredPlanToJson(plan: StructuredTripPlan): Prisma.InputJsonObject {
  return plan as unknown as Prisma.InputJsonObject;
}

export async function applyAiPlanDraft(
  tx: Prisma.TransactionClient,
  draft: {
    draftJson: Prisma.JsonValue | null;
    id: string;
    inputJson: Prisma.JsonValue;
    status: string;
  },
): Promise<string> {
  if (draft.status !== "draft") {
    throw new Error("该 AI 草稿已处理，不能重复写入。");
  }

  const validation = validateStructuredTripPlan(draft.draftJson);
  if (!validation.ok) {
    throw new Error(`AI 草稿结构无效：${validation.errors.join("；")}`);
  }

  const plan = validation.plan;
  const startDate = parseDateInput(plan.trip.startDate);
  const endDate = parseDateInput(plan.trip.endDate);

  if (!startDate || !endDate) {
    throw new Error("AI 草稿缺少有效旅行日期。");
  }

  const trip = await tx.trip.create({
    data: {
      baseCurrency: plan.trip.baseCurrency || "CNY",
      budgetAmount: numberOrNull(plan.trip.budgetAmount),
      description: plan.trip.description,
      endDate,
      homeCity: plan.trip.homeCity,
      mainDestination: plan.trip.mainDestination,
      startDate,
      status: "PLANNING",
      title: plan.trip.title,
    },
    select: { id: true },
  });

  const destination = await tx.destination.create({
    data: {
      arrivalDate: startDate,
      country: plan.destination.countryOrRegion || null,
      departureDate: endDate,
      name: plan.destination.name,
      notes: plan.destination.notes,
      tripId: trip.id,
    },
    select: { id: true },
  });

  const placeIdByName = new Map<string, string>();

  for (const place of plan.places) {
    const created = await tx.place.create({
      data: {
        destinationId: destination.id,
        estimatedCost: numberOrNull(place.estimatedCost),
        estimatedDurationMin: integerOrNull(place.estimatedDurationMin),
        name: place.name,
        notes: [place.reason, place.notes, "AI 草稿，需人工核验。"]
          .filter(Boolean)
          .join("\n"),
        priority: place.priority,
        tags: place.tags,
        tripId: trip.id,
        type: place.type,
      },
      select: { id: true, name: true },
    });
    placeIdByName.set(created.name, created.id);
  }

  for (const day of plan.itineraryDays) {
    const date = parseDateInput(day.date);

    if (!date) {
      throw new Error(`行程日期无效：${day.date}`);
    }

    const createdDay = await tx.itineraryDay.create({
      data: {
        city: day.city,
        date,
        notes: day.notes,
        theme: day.theme,
        title: day.title,
        tripId: trip.id,
      },
      select: { id: true },
    });

    for (const item of day.items) {
      await tx.itineraryItem.create({
        data: {
          bookingStatus: "TODO",
          costEstimate: numberOrNull(item.costEstimate),
          dayId: createdDay.id,
          durationMin: integerOrNull(item.durationMin),
          endTime: item.endTime ? combineDateAndTime(date, item.endTime) : null,
          notes: item.notes ?? "AI 草稿，需人工核验。",
          placeId: item.placeName ? placeIdByName.get(item.placeName) ?? null : null,
          priority: item.priority,
          sortOrder: item.sortOrder,
          startTime: item.startTime ? combineDateAndTime(date, item.startTime) : null,
          title: item.title,
          tripId: trip.id,
          type: item.type,
        },
      });
    }
  }

  const routePlan = await tx.routePlan.create({
    data: {
      departDate: startDate,
      fromName: plan.trip.homeCity,
      notes: "AI 生成交通方案仅为建议，不含实时班次、车次、航班号或实时价格。",
      title: "AI 推荐交通方案",
      toName: plan.trip.mainDestination,
      tripId: trip.id,
      weights: Prisma.JsonNull,
    },
    select: { id: true },
  });

  for (const option of plan.transportOptions) {
    await tx.transportOption.create({
      data: {
        currency: "CNY",
        doorToDoorMinutes: integerOrNull(option.estimatedMinutes),
        fromName: option.fromName,
        mode: option.mode,
        notes: option.notes,
        price: numberOrNull(option.estimatedCost),
        routePlanId: routePlan.id,
        toName: option.toName,
        transferCount: integerOrNull(option.transferCount),
        tripId: trip.id,
      },
    });
  }

  for (const item of plan.checklistItems) {
    await tx.checklistItem.create({
      data: {
        category: item.category,
        dueDate: item.dueDate ? parseDateInput(item.dueDate) : null,
        importance: item.importance,
        notes: item.notes ?? null,
        quantity: Math.max(integerOrNull(item.quantity) ?? 1, 1),
        title: item.title,
        tripId: trip.id,
      },
    });
  }

  for (const budget of dedupeCategoryBudgets(plan.categoryBudgets)) {
    await tx.categoryBudget.create({
      data: {
        amount: budget.amount,
        category: normalizeExpenseCategory(budget.category),
        tripId: trip.id,
      },
    });
  }

  for (const expense of plan.expenses) {
    await tx.expense.create({
      data: {
        amount: expense.amount,
        category: normalizeExpenseCategory(expense.category),
        currency: expense.currency || "CNY",
        notes: expense.notes ?? "AI 预算估算，不代表实际支出。",
        title: expense.title,
        tripId: trip.id,
      },
    });
  }

  for (const note of plan.notes) {
    await tx.note.create({
      data: {
        content: note.content.includes(AI_DRAFT_NOTICE)
          ? note.content
          : `${AI_DRAFT_NOTICE}\n\n${note.content}`,
        tags: note.tags,
        title: note.title,
        tripId: trip.id,
      },
    });
  }

  await tx.note.create({
    data: {
      content: [
        AI_DRAFT_NOTICE,
        "人工核验清单：",
        ...plan.verificationChecklist.map((item) => `- ${item}`),
      ].join("\n"),
      tags: ["AI草稿", "核验清单"],
      title: "AI 生成内容免责声明与核验清单",
      tripId: trip.id,
    },
  });

  await tx.aiPlanDraft.update({
    data: {
      status: "applied",
      tripId: trip.id,
    },
    where: { id: draft.id },
  });

  return trip.id;
}

export function inputToPromptText(input: AiPlanInput): string {
  return [
    input.destination,
    input.homeCity,
    input.people,
    input.budgetAmount,
    input.companions,
    input.mustVisit,
    input.avoid,
    input.preferences.join(" "),
    input.transportPreferences.join(" "),
    input.stayPreferences.join(" "),
  ].join("\n");
}

function buildMockPlaces(destination: string, input: AiPlanInput): StructuredTripPlan["places"] {
  const mustVisit = splitFreeText(input.mustVisit);
  const attractionNames =
    mustVisit.length > 0
      ? mustVisit.slice(0, 3)
      : [`${destination}代表性景区`, `${destination}老城街区`, `${destination}城市公园`];

  return [
    ...attractionNames.map((name, index) => ({
      estimatedCost: 80 + index * 30,
      estimatedDurationMin: 120,
      name,
      notes: "请查询官方开放时间、预约要求和门票信息。",
      priority: index === 0 ? ("HIGH" as Priority) : ("MEDIUM" as Priority),
      reason: `符合${input.preferences.join("、") || "目的地初访"}偏好，适合作为行程锚点。`,
      tags: ["景点", "需核验"],
      type: "ATTRACTION" as PlaceType,
    })),
    {
      estimatedCost: 120,
      estimatedDurationMin: 90,
      name: `${destination}本地美食区域`,
      notes: "餐厅排队、营业时间和预约情况需现场或官方渠道确认。",
      priority: "MEDIUM",
      reason: "集中体验当地特色餐饮，便于按预算灵活选择。",
      tags: ["美食", "餐饮"],
      type: "RESTAURANT",
    },
    {
      estimatedCost: 0,
      estimatedDurationMin: 0,
      name: `${destination}交通便利住宿区域`,
      notes: "不代表酒店实时库存或价格，请在订房平台核验。",
      priority: "MEDIUM",
      reason: input.stayPreferences.includes("安静")
        ? "兼顾交通与夜间休息。"
        : "便于连接景点和交通枢纽。",
      tags: ["住宿区域", "需核验"],
      type: "HOTEL",
    },
    {
      estimatedCost: 0,
      estimatedDurationMin: 30,
      name: `${destination}主要交通枢纽`,
      notes: "具体站点、机场、换乘方式需按实际票务确认。",
      priority: "MEDIUM",
      reason: "用于规划抵达、返程和市内换乘。",
      tags: ["交通", "枢纽"],
      type: "TRANSPORT",
    },
    {
      estimatedCost: 0,
      estimatedDurationMin: 30,
      name: `${destination}应急服务点`,
      notes: "请出发前补充最近医院、领事保护或报警电话等真实信息。",
      priority: "LOW",
      reason: "保留应急信息入口。",
      tags: ["应急", "需确认"],
      type: "EMERGENCY",
    },
  ];
}

function buildDailyTemplates(
  destination: string,
  input: AiPlanInput,
  mustVisit: string[],
): Array<{ items: StructuredTripPlan["itineraryDays"][number]["items"]; theme: string }> {
  const relaxed = input.pace === "relaxed";
  const packed = input.pace === "packed";
  const itemCount = relaxed ? 2 : packed ? 4 : 3;
  const attraction = mustVisit[0] || `${destination}代表性景区`;

  const templates = [
    {
      items: [
        mockItem("抵达与交通衔接", "TRANSPORT", "09:30", "10:30", 60, 60),
        mockItem(`${attraction}深度游览`, "ATTRACTION", "10:45", "12:45", 120, 120, attraction),
        mockItem(`${destination}本地美食区域`, "DINING", "13:00", "14:15", 75, 120, `${destination}本地美食区域`),
        mockItem("住宿区域休整", "LODGING", "19:30", "20:30", 60, 0, `${destination}交通便利住宿区域`),
      ].slice(0, itemCount),
      theme: "抵达与经典初识",
    },
    {
      items: [
        mockItem(`${destination}城市文化街区`, "ATTRACTION", "09:30", "11:30", 120, 80),
        mockItem("午餐与咖啡休息", "DINING", "12:00", "13:15", 75, 100, `${destination}本地美食区域`),
        mockItem(`${destination}自然或摄影点`, "ATTRACTION", "14:00", "16:00", 120, 80),
        mockItem("夜间轻松散步", "REST", "19:30", "20:30", 60, 0),
      ].slice(0, itemCount),
      theme: "文化与慢游体验",
    },
    {
      items: [
        mockItem("上午补充必去地点", "ATTRACTION", "09:30", "11:30", 120, 90),
        mockItem("购物或伴手礼时间", "SHOPPING", "14:00", "15:30", 90, 200),
        mockItem("返程交通预留", "TRANSPORT", "16:30", "18:00", 90, 80, `${destination}主要交通枢纽`),
      ].slice(0, itemCount),
      theme: "弹性收尾与返程",
    },
  ];

  return templates;
}

function mockItem(
  title: string,
  type: ItineraryItemType,
  startTime: string,
  endTime: string,
  durationMin: number,
  costEstimate: number,
  placeName?: string,
) {
  return {
    costEstimate,
    durationMin,
    endTime,
    notes: "AI 草稿，请核验开放时间、预约、交通耗时和价格。",
    placeName,
    priority: type === "ATTRACTION" ? ("HIGH" as Priority) : ("MEDIUM" as Priority),
    sortOrder: 1,
    startTime,
    title,
    type,
  };
}

function buildMockTransportOptions(input: AiPlanInput): StructuredTripPlan["transportOptions"] {
  const wantsFlight = input.transportPreferences.includes("飞机");
  const wantsTrain = input.transportPreferences.includes("高铁");
  const wantsDrive = input.transportPreferences.includes("自驾");
  const options: StructuredTripPlan["transportOptions"] = [];

  if (wantsTrain || !wantsFlight) {
    options.push({
      estimatedCost: input.budgetAmount ? Math.round(Number(input.budgetAmount) * 0.18) : 600,
      estimatedMinutes: 240,
      fromName: input.homeCity,
      mode: "TRAIN",
      notes: "建议查询铁路官方渠道确认车次、余票、时刻和价格；此处不提供实时车次。",
      toName: input.destination,
      transferCount: input.transportPreferences.includes("少换乘") ? 0 : 1,
    });
  }

  if (wantsFlight || !wantsTrain) {
    options.push({
      estimatedCost: input.budgetAmount ? Math.round(Number(input.budgetAmount) * 0.22) : 900,
      estimatedMinutes: 210,
      fromName: input.homeCity,
      mode: "FLIGHT",
      notes: "建议查询航空公司或官方票务渠道确认航班、行李额、机场交通和价格；不生成航班号。",
      toName: input.destination,
      transferCount: 1,
    });
  }

  if (wantsDrive) {
    options.push({
      estimatedCost: input.budgetAmount ? Math.round(Number(input.budgetAmount) * 0.16) : 700,
      estimatedMinutes: 360,
      fromName: input.homeCity,
      mode: "CAR",
      notes: "请核验高速路况、停车、充电/加油、限行和驾驶疲劳风险。",
      toName: input.destination,
      transferCount: 0,
    });
  }

  options.push({
    estimatedCost: 100,
    estimatedMinutes: 60,
    fromName: input.destination,
    mode: input.transportPreferences.includes("自驾") ? "CAR" : "METRO",
    notes: "城市内移动建议优先使用官方地图与公共交通 App 查询实时路线，不在此处编造实时路线。",
    toName: `${input.destination}市内各区域`,
    transferCount: input.transportPreferences.includes("少换乘") ? 0 : 1,
  });

  return options;
}

export function buildChecklist(
  input: AiPlanInput,
  startDate: Date,
): StructuredTripPlan["checklistItems"] {
  const dueDate = formatDate(addDays(startDate, -3));
  const items: StructuredTripPlan["checklistItems"] = [
    { category: "证件", dueDate, importance: "HIGH", title: "身份证/护照等有效证件" },
    { category: "支付", dueDate, importance: "HIGH", title: "银行卡、移动支付与少量现金" },
    { category: "通信", dueDate, importance: "MEDIUM", title: "手机流量、漫游或 eSIM 方案确认" },
    { category: "衣物", dueDate, importance: "MEDIUM", title: "按季节准备衣物与舒适步行鞋" },
    { category: "药品", dueDate, importance: "MEDIUM", title: "常用药、肠胃药、晕车药" },
    { category: "电子设备", dueDate, importance: "HIGH", title: "充电器、数据线、充电宝" },
    { category: "票据", dueDate, importance: "HIGH", notes: "交通、住宿、景区预约均需官方渠道核验。", title: "交通/住宿/景区预约信息核验" },
  ];

  if (input.companions.includes("儿童") || input.preferences.includes("亲子")) {
    items.push({
      category: "儿童用品",
      dueDate,
      importance: "HIGH",
      title: "儿童证件、零食、替换衣物与安抚用品",
    });
  }

  if (input.companions.includes("老人")) {
    items.push({
      category: "老人用品",
      dueDate,
      importance: "HIGH",
      title: "常用药、慢病处方与休息安排确认",
    });
  }

  if (input.transportPreferences.includes("自驾")) {
    items.push({
      category: "自驾游",
      dueDate,
      importance: "HIGH",
      title: "驾驶证、车辆证件、保险、停车与限行信息",
    });
  }

  return items;
}

export function splitBudget(totalAmount: number): Array<{ amount: number; category: string }> {
  const weights = new Map<string, number>([
    ["交通", 0.24],
    ["住宿", 0.28],
    ["餐饮", 0.18],
    ["门票", 0.1],
    ["购物", 0.08],
    ["其他", 0.12],
  ]);
  const fallbackCategories = ["交通", "住宿", "餐饮", "门票", "购物", "其他"];
  const categories = fallbackCategories.map((category) =>
    BUDGET_CATEGORIES.includes(category as (typeof BUDGET_CATEGORIES)[number])
      ? category
      : normalizeExpenseCategory(category),
  );

  let allocated = 0;
  return categories.map((category, index) => {
    const isLast = index === categories.length - 1;
    const amount = isLast
      ? roundMoney(totalAmount - allocated)
      : roundMoney(totalAmount * (weights.get(category) ?? 0.1));
    allocated = roundMoney(allocated + amount);
    return { amount, category };
  });
}

function dedupeCategoryBudgets(
  budgets: StructuredTripPlan["categoryBudgets"],
): StructuredTripPlan["categoryBudgets"] {
  const map = new Map<string, number>();

  for (const budget of budgets) {
    const category = normalizeExpenseCategory(budget.category);
    map.set(category, roundMoney((map.get(category) ?? 0) + Number(budget.amount || 0)));
  }

  return Array.from(map.entries()).map(([category, amount]) => ({
    amount,
    category,
  }));
}

function extractJsonText(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

function validateArray(value: unknown, field: string, errors: string[]) {
  if (!Array.isArray(value)) {
    errors.push(`${field} 必须是数组`);
  }
}

function requireString(value: unknown, field: string, errors: string[]) {
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${field} 必填`);
  }
}

function requireValidDate(value: unknown, field: string, errors: string[]) {
  if (typeof value !== "string" || !parseDateInput(value)) {
    errors.push(`${field} 必须是 YYYY-MM-DD`);
  }
}

function formValue(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

function normalizeSelectedValues(values: string[], options: string[]): string[] {
  return Array.from(new Set(values.filter((value) => options.includes(value))));
}

function parsePace(value: string): AiPlanInput["pace"] {
  return value === "relaxed" || value === "balanced" || value === "packed"
    ? value
    : "balanced";
}

function isPositiveInteger(value: string): boolean {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0;
}

function isNonNegativeNumber(value: string): boolean {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0;
}

function splitFreeText(value: string): string[] {
  return value
    .split(/[,，、\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function estimateDefaultBudget(dayCount: number, people: number, destination: string): number {
  const base = destination.length > 0 ? 700 : 600;
  return Math.max(1500, dayCount * people * base);
}

function scaleCost(cost: number, totalBudget: number, dayCount: number): number {
  if (cost === 0) {
    return 0;
  }
  const dailyBudget = totalBudget / Math.max(dayCount, 1);
  return roundMoney(Math.min(cost, dailyBudget * 0.35));
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function numberOrNull(value: unknown): number | null {
  const numberValue = Number(value ?? "");
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : null;
}

function integerOrNull(value: unknown): number | null {
  const numberValue = Number(value ?? "");
  return Number.isInteger(numberValue) && numberValue >= 0 ? numberValue : null;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
