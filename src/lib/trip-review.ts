import { buildSystemPrompt, createAiProvider, getAiProviderConfig, redactSensitivePrompt } from "@/lib/ai";
import { calculateConvertedSpent, formatMoney } from "@/lib/budget";
import { formatDisplayDate } from "@/lib/display-format";

export const TRIP_REVIEW_SCHEMA_VERSION = 1;

export type TripReviewStatusValue = "draft" | "final";

export type ReviewTagGroup = {
  name: string;
  tags: string[];
};

export type TripReviewFormValues = {
  actualCostAmount: string;
  actualCostCurrency: string;
  actualPace: string;
  placeTags: ReviewTagGroup[];
  recommendations: string[];
  regrets: string[];
  stayTags: ReviewTagGroup[];
  summary: string;
  transportTags: ReviewTagGroup[];
  warnings: string[];
};

export type TripReviewDraft = TripReviewFormValues & {
  nextTimeAdvice: string;
};

export type TripReviewAiInput = {
  budget: {
    baseCurrency: string;
    plannedAmount: number | null;
    spentAmount: number;
  };
  itinerary: Array<{
    city: string | null;
    date: string;
    done: number;
    skipped: number;
    theme: string | null;
    title: string | null;
    total: number;
  }>;
  notes: Array<{
    contentSnippet: string;
    tags: string[];
    title: string;
  }>;
  reviewSignals: {
    actualCost: string;
    actualPace: string;
    placeTags: ReviewTagGroup[];
    recommendations: string[];
    regrets: string[];
    stayTags: ReviewTagGroup[];
    transportTags: ReviewTagGroup[];
    warnings: string[];
  };
  trip: {
    endDate: string | null;
    homeCity: string | null;
    mainDestination: string | null;
    startDate: string | null;
    title: string;
  };
};

export type TripReviewAiSource = {
  baseCurrency: string;
  budgetAmount?: number | string | { toString(): string } | null;
  endDate?: Date | null;
  expenses?: Array<{
    amount: number | string | { toString(): string };
    currency: string;
    exchangeRate?: number | string | { toString(): string } | null;
  }>;
  homeCity?: string | null;
  itineraryDays?: Array<{
    city?: string | null;
    date: Date;
    items?: Array<{ status?: string | null }>;
    theme?: string | null;
    title?: string | null;
  }>;
  mainDestination?: string | null;
  notes?: Array<{
    content: string;
    tags?: unknown;
    title: string;
  }>;
  startDate?: Date | null;
  title: string;
};

export type TravelPreferenceSignal = {
  key: string;
  label: string;
  weight: number;
};

export type PreferenceForAiPlan = {
  evidenceCount: number;
  key: string;
  label: string;
  weight: number;
};

export type NextTripSuggestion = {
  body: string;
  title: string;
};

export const REQUIRED_REVIEW_TRIP_STATUS = "COMPLETED" as const;
export const TRIP_REVIEW_COMPLETED_ONLY_MESSAGE =
  "只有已结束的旅行可以保存正式复盘。请先把旅行状态改为已结束。";

export type TripReviewMarkdownInput = {
  actualCostAmount?: number | string | { toString(): string } | null;
  actualCostCurrency: string;
  actualPace?: string | null;
  createdAt?: Date | null;
  nextTimeAdvice?: string | null;
  nextTripSuggestions?: unknown;
  placeTags?: unknown;
  recommendations?: unknown;
  regrets?: unknown;
  stayTags?: unknown;
  summary?: string | null;
  transportTags?: unknown;
  trip?: {
    endDate?: Date | null;
    mainDestination?: string | null;
    startDate?: Date | null;
    title: string;
  };
  warnings?: unknown;
};

const PACE_LABELS: Record<string, string> = {
  balanced: "适中",
  packed: "紧凑",
  relaxed: "轻松",
};

const DEFAULT_REVIEW_DRAFT: TripReviewDraft = {
  actualCostAmount: "",
  actualCostCurrency: "CNY",
  actualPace: "balanced",
  nextTimeAdvice: "下次保留更清晰的机动时间，并在出发前复核交通、预约和预算。",
  placeTags: [],
  recommendations: [],
  regrets: [],
  stayTags: [],
  summary: "",
  transportTags: [],
  warnings: [],
};

export function buildTripReviewAiInput(
  trip: TripReviewAiSource,
  values: Partial<TripReviewFormValues> = {},
): TripReviewAiInput {
  const expenses = trip.expenses ?? [];
  const spentAmount = calculateConvertedSpent(expenses, trip.baseCurrency);

  return {
    budget: {
      baseCurrency: trip.baseCurrency,
      plannedAmount: toNullableNumber(trip.budgetAmount),
      spentAmount,
    },
    itinerary: (trip.itineraryDays ?? []).slice(0, 21).map((day) => {
      const items = day.items ?? [];
      return {
        city: safeNullableText(day.city),
        date: formatDate(day.date),
        done: items.filter((item) => item.status === "DONE").length,
        skipped: items.filter((item) => item.status === "SKIPPED").length,
        theme: safeNullableText(day.theme),
        title: safeNullableText(day.title),
        total: items.length,
      };
    }),
    notes: (trip.notes ?? []).slice(0, 8).map((note) => ({
      contentSnippet: safeSnippet(note.content, 180),
      tags: tagsFromJson(note.tags).slice(0, 6).map((tag) => redactReviewText(tag)),
      title: redactReviewText(note.title).slice(0, 80),
    })),
    reviewSignals: {
      actualCost: redactReviewText(values.actualCostAmount?.trim() ?? ""),
      actualPace: normalizePace(values.actualPace ?? ""),
      placeTags: sanitizeTagGroups(values.placeTags ?? []),
      recommendations: sanitizeLines(values.recommendations ?? []),
      regrets: sanitizeLines(values.regrets ?? []),
      stayTags: sanitizeTagGroups(values.stayTags ?? []),
      transportTags: sanitizeTagGroups(values.transportTags ?? []),
      warnings: sanitizeLines(values.warnings ?? []),
    },
    trip: {
      endDate: trip.endDate ? formatDate(trip.endDate) : null,
      homeCity: safeNullableText(trip.homeCity),
      mainDestination: safeNullableText(trip.mainDestination),
      startDate: trip.startDate ? formatDate(trip.startDate) : null,
      title: redactSensitivePrompt(trip.title).slice(0, 100),
    },
  };
}

export function buildTripReviewPrompt(input: TripReviewAiInput): string {
  return [
    "TRACE_ME_TRIP_REVIEW_DRAFT_JSON",
    "请基于最小化旅行摘要和用户反馈，生成旅行复盘草稿。只返回 JSON，不要返回 Markdown，不要使用代码块。",
    "不得索要、读取或推断上传文件、票据、证件、订单、联系人、环境变量、API Key 或附件内容。",
    "JSON 顶层字段必须为 schemaVersion, summary, recommendations, warnings, actualCostAmount, actualCostCurrency, actualPace, regrets, nextTimeAdvice, placeTags, stayTags, transportTags。",
    "recommendations/warnings/regrets 是字符串数组；placeTags/stayTags/transportTags 是 { name, tags } 数组；actualCostAmount 可为空字符串。",
    "输入 JSON：",
    JSON.stringify(input, null, 2),
  ].join("\n");
}

export function canSaveFinalTripReview(tripStatus: string): boolean {
  return tripStatus === REQUIRED_REVIEW_TRIP_STATUS;
}

export async function generateTripReviewDraft(
  input: TripReviewAiInput,
  env: Record<string, string | undefined> = process.env,
): Promise<{
  draft: TripReviewDraft;
  model: string;
  provider: "mock" | "openai";
}> {
  const config = getAiProviderConfig(env);

  if (!config.configured || config.provider === "mock") {
    return {
      draft: generateMockTripReviewDraft(input),
      model: "mock-trip-review",
      provider: "mock",
    };
  }

  const provider = createAiProvider(env);
  const responseText = await provider.generateText({
    includeDraftNotice: false,
    maxOutputTokens: 2400,
    systemPrompt: [
      buildSystemPrompt(),
      "你现在是 TraceMe 的旅行复盘草稿生成器。",
      "你只能基于给出的最小化 JSON 摘要工作。",
      "不要接收、索要或回显文件内容、密码、session、API Key、环境变量、证件号或订单号。",
      "你必须只返回可解析 JSON。",
    ].join("\n"),
    task: {
      fields: [],
      id: "trip-review",
      label: "旅行复盘草稿",
      outputSections: [],
      placeholder: "",
    },
    userPrompt: buildTripReviewPrompt(input),
  });

  return {
    draft: parseTripReviewDraftJson(responseText),
    model: config.model,
    provider: "openai",
  };
}

export function generateMockTripReviewDraft(input: TripReviewAiInput): TripReviewDraft {
  const destination = input.trip.mainDestination ?? input.trip.title;
  const recommendations =
    input.reviewSignals.recommendations.length > 0
      ? input.reviewSignals.recommendations
      : [`${destination}中体验顺畅、值得复用的安排可以作为下次计划锚点。`];
  const warnings =
    input.reviewSignals.warnings.length > 0
      ? input.reviewSignals.warnings
      : ["高峰时段、排队和跨城转场需要提前预留缓冲。"];
  const regrets =
    input.reviewSignals.regrets.length > 0
      ? input.reviewSignals.regrets
      : ["未提前确认预约、交通耗时或备选方案的部分，下次应在出发前补齐。"];
  const actualCostAmount =
    input.reviewSignals.actualCost || String(input.budget.spentAmount || "");
  const costText = actualCostAmount
    ? `${input.budget.baseCurrency} ${actualCostAmount}`
    : "实际花费未填写";
  const done = input.itinerary.reduce((sum, day) => sum + day.done, 0);
  const total = input.itinerary.reduce((sum, day) => sum + day.total, 0);

  return {
    actualCostAmount,
    actualCostCurrency: input.budget.baseCurrency || "CNY",
    actualPace: normalizePace(input.reviewSignals.actualPace),
    nextTimeAdvice: [
      input.reviewSignals.actualPace === "relaxed"
        ? "继续保留轻松节奏，把每天核心安排控制在 2-3 个。"
        : "下次把高消耗安排和跨区移动拆开，避免连续紧凑日。",
      warnings.some((item) => /转场|换乘|交通|跨城/.test(item))
        ? "交通优先选择少换乘、确定性高的方案，并保留延误缓冲。"
        : "保留一条低风险备选路线，减少临时决策成本。",
      actualCostAmount ? "预算按实际花费上浮 10%-15% 作为缓冲。" : "补齐实际花费后再校准预算敏感度。",
    ].join("\n"),
    placeTags: input.reviewSignals.placeTags,
    recommendations,
    regrets,
    stayTags: input.reviewSignals.stayTags,
    summary: [
      `${input.trip.title}复盘：实际执行 ${done}/${total || 0} 个行程项，${costText}。`,
      "推荐、避雷和遗憾会沉淀为个人偏好，后续 AI 规划默认参考这些经验。",
    ].join(" "),
    transportTags: input.reviewSignals.transportTags,
    warnings,
  };
}

export function parseTripReviewDraftJson(text: string): TripReviewDraft {
  const parsed = JSON.parse(extractJsonText(text)) as unknown;

  if (!isRecord(parsed)) {
    throw new Error("AI 复盘草稿不是有效对象。");
  }

  return normalizeTripReviewDraft({
    actualCostAmount: stringValue(parsed.actualCostAmount),
    actualCostCurrency: stringValue(parsed.actualCostCurrency) || "CNY",
    actualPace: stringValue(parsed.actualPace),
    nextTimeAdvice: stringValue(parsed.nextTimeAdvice),
    placeTags: tagGroupsFromJson(parsed.placeTags),
    recommendations: stringArray(parsed.recommendations),
    regrets: stringArray(parsed.regrets),
    stayTags: tagGroupsFromJson(parsed.stayTags),
    summary: stringValue(parsed.summary),
    transportTags: tagGroupsFromJson(parsed.transportTags),
    warnings: stringArray(parsed.warnings),
  });
}

export function normalizeTripReviewDraft(values: Partial<TripReviewDraft>): TripReviewDraft {
  return {
    actualCostAmount: safeAmountText(values.actualCostAmount ?? DEFAULT_REVIEW_DRAFT.actualCostAmount),
    actualCostCurrency: normalizeCurrency(values.actualCostCurrency),
    actualPace: normalizePace(values.actualPace),
    nextTimeAdvice: redactReviewText((values.nextTimeAdvice ?? "").trim()).slice(0, 1600),
    placeTags: sanitizeTagGroups(values.placeTags ?? []),
    recommendations: sanitizeLines(values.recommendations ?? []),
    regrets: sanitizeLines(values.regrets ?? []),
    stayTags: sanitizeTagGroups(values.stayTags ?? []),
    summary: redactReviewText((values.summary ?? "").trim()).slice(0, 1200),
    transportTags: sanitizeTagGroups(values.transportTags ?? []),
    warnings: sanitizeLines(values.warnings ?? []),
  };
}

export function extractPreferencesFromReview(review: Partial<TripReviewDraft>): TravelPreferenceSignal[] {
  const normalized = normalizeTripReviewDraft(review);
  const text = [
    normalized.summary,
    normalized.actualPace,
    normalized.nextTimeAdvice,
    ...normalized.recommendations,
    ...normalized.warnings,
    ...normalized.regrets,
    ...normalized.placeTags.flatMap((item) => [item.name, ...item.tags]),
    ...normalized.stayTags.flatMap((item) => [item.name, ...item.tags]),
    ...normalized.transportTags.flatMap((item) => [item.name, ...item.tags]),
  ].join(" ");
  const signals = new Map<string, TravelPreferenceSignal>();

  if (normalized.actualPace === "relaxed" || /慢|轻松|松弛|留白|不赶/.test(text)) {
    addSignal(signals, "pace.relaxed", "喜欢慢节奏", 3);
  }

  if (/换乘|转场|跨城|奔波|折腾|少换乘|少转场/.test(text)) {
    addSignal(signals, "transport.fewer_transfers", "不喜欢转场过多", 3);
  }

  if (/预算|花费|超支|便宜|性价比|价格|贵|省钱|控制/.test(text)) {
    addSignal(signals, "budget.sensitive", "预算敏感", 2);
  }

  if (/安静|隔音|睡眠|休息|安全/.test(text)) {
    addSignal(signals, "stay.quiet_safe", "偏好安静安全的住宿", 2);
  }

  if (/排队|预约|人多|拥挤|热门/.test(text)) {
    addSignal(signals, "planning.avoid_crowds", "避开排队和拥挤", 2);
  }

  if (/美食|餐厅|小吃|咖啡|本地菜/.test(text)) {
    addSignal(signals, "interest.food", "偏好美食体验", 1);
  }

  if (/历史|博物馆|古迹|文化|建筑/.test(text)) {
    addSignal(signals, "interest.history", "偏好历史文化", 1);
  }

  if (/自然|公园|山|湖|海|徒步|风景/.test(text)) {
    addSignal(signals, "interest.nature", "偏好自然风景", 1);
  }

  return Array.from(signals.values()).sort((a, b) => b.weight - a.weight);
}

export function summarizePreferencesForAiPlan(preferences: PreferenceForAiPlan[]): string {
  const sorted = preferences
    .filter((item) => item.label && item.weight > 0)
    .sort((a, b) => b.weight - a.weight || b.evidenceCount - a.evidenceCount)
    .slice(0, 8);

  if (sorted.length === 0) {
    return "";
  }

  return sorted
    .map((item) => `${item.label}（权重 ${item.weight}，证据 ${item.evidenceCount}）`)
    .join("；");
}

export function buildNextTripSuggestions(
  review: Partial<TripReviewDraft>,
  preferences: PreferenceForAiPlan[] = [],
): NextTripSuggestion[] {
  const normalized = normalizeTripReviewDraft(review);
  const signals = extractPreferencesFromReview(normalized);
  const mergedLabels = new Set([
    ...signals.map((item) => item.label),
    ...preferences.map((item) => item.label),
  ]);
  const suggestions: NextTripSuggestion[] = [];

  if (mergedLabels.has("喜欢慢节奏")) {
    suggestions.push({
      body: "每天安排 2-3 个核心点，午后或傍晚留出机动时间。",
      title: "节奏更轻松",
    });
  }

  if (mergedLabels.has("不喜欢转场过多")) {
    suggestions.push({
      body: "优先选择同一区域连玩，跨城或跨区移动尽量集中到同一天。",
      title: "减少转场",
    });
  }

  if (mergedLabels.has("预算敏感")) {
    suggestions.push({
      body: "先给出预算上限，再为交通、住宿和餐饮各保留 10%-15% 缓冲。",
      title: "预算先行",
    });
  }

  if (normalized.warnings.length > 0 || normalized.regrets.length > 0) {
    suggestions.push({
      body: "把避雷和遗憾事项作为新计划的硬约束，生成时同步列出替代方案。",
      title: "复用避雷清单",
    });
  }

  return suggestions.length > 0
    ? suggestions
    : [
        {
          body: "复用本次推荐地点和住宿标签，同时在新目的地预留半天自由探索。",
          title: "延续有效经验",
        },
      ];
}

export function exportTripReviewMarkdown(review: TripReviewMarkdownInput): string {
  const tripTitle = review.trip?.title ?? "旅行复盘";
  const suggestions = nextTripSuggestionsFromJson(review.nextTripSuggestions);
  const sections = [
    `# ${sanitizeMarkdownText(tripTitle)}复盘`,
    "",
    "## 基础信息",
    "",
    `- 目的地：${sanitizeMarkdownText(review.trip?.mainDestination ?? "未填写")}`,
    `- 日期：${formatReviewDateRange(review.trip?.startDate, review.trip?.endDate)}`,
    `- 复盘时间：${review.createdAt ? formatDisplayDate(review.createdAt) : "未填写"}`,
    `- 实际花费：${formatReviewMoney(review.actualCostAmount, review.actualCostCurrency)}`,
    `- 实际节奏：${getPaceLabel(review.actualPace)}`,
    "",
    "## 总结",
    "",
    sanitizeMarkdownText(review.summary ?? "未填写"),
    "",
    "## 推荐",
    "",
    ...formatMarkdownList(linesFromJson(review.recommendations)),
    "",
    "## 避雷",
    "",
    ...formatMarkdownList(linesFromJson(review.warnings)),
    "",
    "## 遗憾事项",
    "",
    ...formatMarkdownList(linesFromJson(review.regrets)),
    "",
    "## 标签",
    "",
    ...formatTagGroupMarkdown("地点", tagGroupsFromJson(review.placeTags)),
    ...formatTagGroupMarkdown("住宿", tagGroupsFromJson(review.stayTags)),
    ...formatTagGroupMarkdown("交通", tagGroupsFromJson(review.transportTags)),
    "",
    "## 下次建议",
    "",
    sanitizeMarkdownText(review.nextTimeAdvice ?? "未填写"),
  ];

  if (suggestions.length > 0) {
    sections.push(
      "",
      "## 下一次旅行建议",
      "",
      ...suggestions.map((item) => `- ${sanitizeMarkdownText(item.title)}：${sanitizeMarkdownText(item.body)}`),
    );
  }

  return `${sections.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

function addSignal(
  signals: Map<string, TravelPreferenceSignal>,
  key: string,
  label: string,
  weight: number,
) {
  const existing = signals.get(key);
  if (existing) {
    existing.weight = Math.max(existing.weight, weight);
    return;
  }

  signals.set(key, { key, label, weight });
}

function sanitizeLines(lines: string[]): string[] {
  return Array.from(
    new Set(
      lines
        .map((line) => redactReviewText(line.trim()).slice(0, 300))
        .filter(Boolean),
    ),
  ).slice(0, 20);
}

function sanitizeTagGroups(groups: ReviewTagGroup[]): ReviewTagGroup[] {
  return groups
    .map((group) => ({
      name: redactReviewText(group.name.trim()).slice(0, 80),
      tags: sanitizeLines(group.tags).slice(0, 8),
    }))
    .filter((group) => group.name || group.tags.length > 0)
    .slice(0, 20);
}

export function parseLines(value: string): string[] {
  return value
    .split(/\r?\n|[；;]/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

export function parseTagGroups(value: string): ReviewTagGroup[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [namePart, tagPart = ""] = line.split(/[:：]/, 2);
      return {
        name: namePart.trim(),
        tags: tagPart
          .split(/[,，、]/)
          .map((tag) => tag.trim())
          .filter(Boolean),
      };
    });
}

export function formatLinesForTextarea(value: unknown): string {
  return linesFromJson(value).join("\n");
}

export function formatTagGroupsForTextarea(value: unknown): string {
  return tagGroupsFromJson(value)
    .map((group) => `${group.name}：${group.tags.join("、")}`)
    .join("\n");
}

export function linesFromJson(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function tagGroupsFromJson(value: unknown): ReviewTagGroup[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .map((item) => ({
      name: stringValue(item.name),
      tags: stringArray(item.tags),
    }))
    .filter((item) => item.name || item.tags.length > 0);
}

export function nextTripSuggestionsFromJson(value: unknown): NextTripSuggestion[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .map((item) => ({
      body: stringValue(item.body),
      title: stringValue(item.title),
    }))
    .filter((item) => item.title || item.body);
}

function tagsFromJson(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function normalizePace(value = ""): TripReviewDraft["actualPace"] {
  return ["relaxed", "balanced", "packed"].includes(value) ? value : "balanced";
}

function getPaceLabel(value: string | null | undefined): string {
  return PACE_LABELS[normalizePace(value ?? "")] ?? "适中";
}

function normalizeCurrency(value: string | null | undefined): string {
  const normalized = (value ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : "CNY";
}

function safeAmountText(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? trimmed : "";
}

function safeNullableText(value: string | null | undefined): string | null {
  const trimmed = redactReviewText((value ?? "").trim());
  return trimmed ? trimmed.slice(0, 100) : null;
}

function safeSnippet(value: string, maxLength: number): string {
  return redactReviewText(value)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function formatDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function toNullableNumber(value: number | string | { toString(): string } | null | undefined): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

function formatReviewDateRange(startDate: Date | null | undefined, endDate: Date | null | undefined): string {
  if (!startDate && !endDate) {
    return "未填写";
  }

  return `${formatDisplayDate(startDate)} 至 ${formatDisplayDate(endDate)}`;
}

function formatReviewMoney(
  amount: number | string | { toString(): string } | null | undefined,
  currency: string,
): string {
  const parsed = toNullableNumber(amount);
  return parsed === null ? "未填写" : formatMoney(parsed, normalizeCurrency(currency));
}

function formatMarkdownList(lines: string[]): string[] {
  return lines.length > 0
    ? lines.map((line) => `- ${sanitizeMarkdownText(line)}`)
    : ["- 未填写"];
}

function formatTagGroupMarkdown(label: string, groups: ReviewTagGroup[]): string[] {
  if (groups.length === 0) {
    return [`- ${label}：未填写`];
  }

  return groups.map((group) => {
    const tags = group.tags.length > 0 ? group.tags.join("、") : "未填写";
    return `- ${label} / ${sanitizeMarkdownText(group.name || "未命名")}：${sanitizeMarkdownText(tags)}`;
  });
}

function sanitizeMarkdownText(value: string): string {
  return redactReviewText(value).replace(/\r\n/g, "\n").trim();
}

function redactReviewText(value: string): string {
  return redactSensitivePrompt(value)
    .replace(/[A-Za-z]:[\\/][^\s，。；;、)）]+/g, "[文件路径已脱敏]")
    .replace(
      /\b[\w.-]*(?:passport|id|visa|ticket|booking|receipt|insurance|secret)[\w.-]*\.(?:pdf|jpe?g|png|docx?|xlsx?|zip)\b/gi,
      "[文件名已脱敏]",
    );
}

function extractJsonText(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) {
    return fenced[1];
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
