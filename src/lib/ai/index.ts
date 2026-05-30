import { createHmac, timingSafeEqual } from "node:crypto";

export const AI_DRAFT_NOTICE =
  "AI 草稿，需人工核验。营业时间、票价、班次、政策等请以官方渠道为准。";

export const AI_SENSITIVE_INPUT_NOTICE =
  "请勿输入身份证、护照、手机号、订单号等敏感个人信息。";

export type AiTaskType =
  | "destination-guide"
  | "itinerary-draft"
  | "packing-checklist"
  | "food-recommendations"
  | "stay-advice"
  | "transport-comparison"
  | "travel-notes"
  | "trip-review";

export type AiTaskField = {
  key: string;
  label: string;
  placeholder?: string;
  type?: "date" | "number" | "text" | "textarea";
};

export type AiTaskDefinition = {
  fields: AiTaskField[];
  id: AiTaskType;
  label: string;
  outputSections: string[];
  placeholder: string;
};

export type AiTripContext = {
  baseCurrency?: string | null;
  budgetAmount?: string | number | null;
  endDate?: Date | null;
  homeCity?: string | null;
  mainDestination?: string | null;
  startDate?: Date | null;
  title: string;
};

export type AiGenerateRequest = {
  includeDraftNotice?: boolean;
  maxOutputTokens?: number;
  systemPrompt: string;
  task: AiTaskDefinition;
  userPrompt: string;
};

export type AiPromptFieldValue = {
  label: string;
  value: string;
};

export type AiProvider = {
  generateText(request: AiGenerateRequest): Promise<string>;
  isConfigured(): boolean;
  name: string;
};

export type AiProviderConfig = {
  apiKey?: string;
  configured: boolean;
  model: string;
  provider: "mock" | "openai";
  reason?: string;
};

export const AI_TASKS: AiTaskDefinition[] = [
  {
    id: "destination-guide",
    label: "目的地攻略草稿",
    fields: [
      { key: "destination", label: "目的地", placeholder: "例如：京都" },
      { key: "days", label: "出行天数", placeholder: "例如：5", type: "number" },
      { key: "preferences", label: "旅行偏好", placeholder: "例如：历史文化、散步", type: "textarea" },
      { key: "budget", label: "预算", placeholder: "例如：8000 元" },
      { key: "companions", label: "是否亲子/老人/情侣/独行", placeholder: "例如：情侣出行" },
      { key: "pace", label: "体力强度偏好", placeholder: "例如：中等偏轻松" },
    ],
    outputSections: [
      "目的地概览",
      "适合季节",
      "推荐区域",
      "必去景点",
      "可选景点",
      "美食建议",
      "住宿区域建议",
      "交通建议",
      "注意事项",
      "需要人工核验的信息",
    ],
    placeholder:
      "例：京都，5 天，偏历史文化和轻松散步，预算 8000 元，情侣出行，体力中等。",
  },
  {
    id: "itinerary-draft",
    label: "几日游行程草稿",
    fields: [
      { key: "destination", label: "目的地", placeholder: "例如：杭州" },
      { key: "homeCity", label: "出发城市", placeholder: "例如：上海" },
      { key: "startDate", label: "开始日期", type: "date" },
      { key: "endDate", label: "结束日期", type: "date" },
      { key: "people", label: "出行人数", placeholder: "例如：2", type: "number" },
      { key: "preferences", label: "偏好", placeholder: "例如：咖啡馆、城市漫步", type: "textarea" },
      { key: "budget", label: "预算", placeholder: "例如：3000 元" },
      { key: "savedPlaces", label: "已收藏地点（可选）", placeholder: "例如：西湖、灵隐寺" },
    ],
    outputSections: [
      "每日主题",
      "上午安排",
      "中午安排",
      "下午安排",
      "晚上安排",
      "交通提示",
      "预算提示",
      "风险提示",
      "需要人工核验的信息",
    ],
    placeholder:
      "例：上海出发到杭州，2026-10-01 至 2026-10-03，2 人，喜欢咖啡馆和城市漫步，预算 3000 元。",
  },
  {
    id: "packing-checklist",
    label: "出发前准备清单草稿",
    fields: [
      { key: "destination", label: "目的地", placeholder: "例如：北海道" },
      { key: "days", label: "天数", placeholder: "例如：6", type: "number" },
      { key: "season", label: "季节", placeholder: "例如：冬季" },
      { key: "international", label: "是否出境", placeholder: "例如：是" },
      { key: "selfDrive", label: "是否自驾", placeholder: "例如：否" },
      { key: "companions", label: "是否带老人儿童", placeholder: "例如：带老人" },
      { key: "outdoor", label: "是否户外活动", placeholder: "例如：有雪地活动" },
    ],
    outputSections: [
      "证件",
      "衣物",
      "药品",
      "电子设备",
      "支付",
      "通信",
      "票据",
      "特殊装备",
      "出境游",
      "自驾游",
      "容易遗漏事项",
    ],
    placeholder:
      "例：北海道冬季 6 天，出境，不自驾，带老人，有雪地活动。",
  },
  {
    id: "food-recommendations",
    label: "美食推荐草稿",
    fields: [
      { key: "destination", label: "目的地", placeholder: "例如：成都" },
      { key: "taste", label: "口味偏好", placeholder: "例如：微辣、本地特色" },
      { key: "budget", label: "预算", placeholder: "例如：人均 80-150" },
      { key: "restrictions", label: "禁忌或过敏", placeholder: "例如：不吃太辣" },
      { key: "scene", label: "用餐场景", placeholder: "例如：午餐、小吃、家庭聚餐" },
    ],
    outputSections: [
      "当地特色",
      "推荐菜",
      "餐厅选择策略",
      "避坑提示",
      "预算范围",
      "需要核验事项",
    ],
    placeholder:
      "例：成都，能吃微辣，预算人均 80-150，想找本地特色和适合排队较少的选择。",
  },
  {
    id: "stay-advice",
    label: "住宿选择建议草稿",
    fields: [
      { key: "destination", label: "目的地", placeholder: "例如：大阪" },
      { key: "nights", label: "天数", placeholder: "例如：4 晚" },
      { key: "budget", label: "预算", placeholder: "例如：每晚 900 元以内" },
      { key: "companions", label: "同行人", placeholder: "例如：第一次去，2 人" },
      { key: "transport", label: "交通偏好", placeholder: "例如：地铁方便" },
      { key: "vibe", label: "安静/热闹偏好", placeholder: "例如：晚上安静安全" },
    ],
    outputSections: [
      "推荐住宿区域",
      "不同区域优缺点",
      "交通便利性",
      "安全性",
      "适合人群",
      "预算建议",
      "需要核验事项",
    ],
    placeholder:
      "例：大阪 4 晚，预算每晚 900 元以内，第一次去，希望交通方便、晚上安全。",
  },
  {
    id: "transport-comparison",
    label: "交通方案比较建议草稿",
    fields: [
      { key: "from", label: "起点", placeholder: "例如：东京市区" },
      { key: "to", label: "终点", placeholder: "例如：河口湖" },
      { key: "date", label: "日期", type: "date" },
      { key: "people", label: "人数", placeholder: "例如：2", type: "number" },
      { key: "luggage", label: "行李", placeholder: "例如：1 个大箱子" },
      { key: "budget", label: "预算", placeholder: "例如：希望经济" },
      { key: "comfort", label: "舒适度要求", placeholder: "例如：少换乘" },
    ],
    outputSections: [
      "可选交通方式",
      "适用场景",
      "时间成本",
      "费用成本",
      "舒适度",
      "风险",
      "行李友好度",
      "人工核验提醒",
    ],
    placeholder:
      "例：东京市区到河口湖，2 人，1 个大箱子，希望比较高速巴士、火车和包车。",
  },
  {
    id: "travel-notes",
    label: "出行注意事项草稿",
    fields: [
      { key: "destination", label: "目的地", placeholder: "例如：首尔" },
      { key: "season", label: "季节", placeholder: "例如：冬季" },
      { key: "companions", label: "同行人", placeholder: "例如：2 人" },
      { key: "transport", label: "交通方式", placeholder: "例如：公共交通为主" },
      { key: "budget", label: "预算", placeholder: "例如：中等预算" },
      { key: "concerns", label: "特殊关注", placeholder: "例如：支付、通信、夜间安全", type: "textarea" },
    ],
    outputSections: [
      "天气",
      "交通",
      "安全",
      "饮食",
      "支付",
      "通信",
      "当地习惯",
      "紧急情况",
      "人工核验提醒",
    ],
    placeholder:
      "例：首尔冬季自由行，2 人，公共交通为主，关注支付、通信和夜间安全。",
  },
  {
    id: "trip-review",
    label: "旅行复盘草稿",
    fields: [
      { key: "actualRoute", label: "实际行程", placeholder: "例如：西湖、灵隐寺、龙井村", type: "textarea" },
      { key: "actualCost", label: "实际花费", placeholder: "例如：总花费 2800 元" },
      { key: "likedPlaces", label: "好评地点", placeholder: "例如：龙井村" },
      { key: "avoidPlaces", label: "避雷地点", placeholder: "例如：周末排队过久的点" },
      { key: "regrets", label: "遗憾事项", placeholder: "例如：没有提前预约", type: "textarea" },
      { key: "nextTime", label: "下次优化", placeholder: "例如：避开周末", type: "textarea" },
    ],
    outputSections: ["总结", "推荐", "避雷", "预算复盘", "路线复盘", "下次建议"],
    placeholder:
      "例：实际去了西湖、灵隐寺和龙井村，总花费 2800，最喜欢龙井村，遗憾是周末人太多。",
  },
];

export function isAiTaskType(value: string): value is AiTaskType {
  return AI_TASKS.some((task) => task.id === value);
}

export function getAiTaskDefinition(taskType: AiTaskType): AiTaskDefinition {
  return AI_TASKS.find((task) => task.id === taskType) ?? AI_TASKS[0];
}

export function getAiProviderConfig(
  env: Record<string, string | undefined> = process.env,
): AiProviderConfig {
  const provider = env.AI_PROVIDER === "mock" ? "mock" : "openai";
  const model = env.OPENAI_MODEL?.trim() || "gpt-4.1-mini";

  if (env.AI_FEATURE_ENABLED === "false") {
    return {
      configured: false,
      model,
      provider,
      reason: "AI 功能已关闭",
    };
  }

  if (provider === "mock" || env.AI_MOCK_ENABLED === "true") {
    return { configured: true, model: "mock-travel-draft", provider: "mock" };
  }

  if (env.OPENAI_API_KEY?.trim()) {
    return { configured: true, model, provider: "openai" };
  }

  return {
    configured: false,
    model,
    provider: "openai",
    reason: "未配置 AI 服务",
  };
}

export function createAiProvider(
  env: Record<string, string | undefined> = process.env,
): AiProvider {
  const config = getAiProviderConfig(env);

  return createConfiguredAiProvider(config, env);
}

export function createConfiguredAiProvider(
  config: AiProviderConfig,
  env: Record<string, string | undefined> = process.env,
): AiProvider {

  if (config.provider === "mock") {
    return new MockTravelAiProvider();
  }

  return new OpenAiResponsesProvider(env, config.model, config.apiKey);
}

export function buildSystemPrompt(): string {
  return [
    "你是旅行规划助手。",
    "输出必须是中文。",
    "输出是草稿，不代表事实。",
    "对营业时间、票价、交通班次、签证、政策、预约、门票、安全风险等必须提醒用户人工核验。",
    "不要编造确定事实。",
    "如果不确定，请明确写“不确定，需要核验”。",
    "不要索要或处理身份证、护照、银行卡、订单号、保险单号、手机号等敏感信息。",
    "输出结构清晰，适合保存为旅行笔记。",
    `每次输出开头必须包含：${AI_DRAFT_NOTICE}`,
  ].join("\n");
}

export function buildUserPrompt({
  additionalInput,
  fieldValues,
  taskType,
  trip,
}: {
  additionalInput?: string;
  fieldValues: AiPromptFieldValue[];
  taskType: AiTaskType;
  trip: AiTripContext;
}): string {
  const task = getAiTaskDefinition(taskType);
  const tripFacts = [
    `旅行名称：${redactSensitivePrompt(trip.title)}`,
    trip.mainDestination
      ? `主要目的地：${redactSensitivePrompt(trip.mainDestination)}`
      : null,
    trip.homeCity ? `出发城市：${redactSensitivePrompt(trip.homeCity)}` : null,
    trip.startDate ? `开始日期：${formatDate(trip.startDate)}` : null,
    trip.endDate ? `结束日期：${formatDate(trip.endDate)}` : null,
    trip.budgetAmount
      ? `预算：${String(trip.budgetAmount)} ${trip.baseCurrency ?? ""}`.trim()
      : null,
  ].filter(Boolean);

  return [
    `任务类型：${task.label}`,
    "",
    "旅行基础信息（不包含文件内容）：",
    ...tripFacts.map((fact) => `- ${fact}`),
    "",
    "用户需求（已提示用户不要输入敏感信息）：",
    ...formatPromptFieldValues(fieldValues),
    additionalInput?.trim()
      ? `补充说明：${redactSensitivePrompt(additionalInput.trim())}`
      : null,
    "",
    "请按以下结构输出：",
    ...task.outputSections.map((section) => `- ${section}`),
    "",
    "请在最后列出需要人工核验的信息。",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export function buildPromptStorageInput({
  additionalInput,
  fieldValues,
}: {
  additionalInput?: string;
  fieldValues: AiPromptFieldValue[];
}): string {
  return [
    ...formatPromptFieldValues(fieldValues),
    additionalInput?.trim() ? `补充说明：${additionalInput.trim()}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export function redactSensitivePrompt(input: string): string {
  return input
    .replace(/\b1[3-9]\d{9}\b/g, "[手机号已脱敏]")
    .replace(/\b\d{17}[\dXx]\b/g, "[身份证号已脱敏]")
    .replace(/\b(?:\d[ -]?){16,19}\b/g, "[银行卡号已脱敏]")
    .replace(/\b[A-Za-z]\d{7,9}\b/g, "[证件号已脱敏]")
    .replace(
      /(订单号|订单|order|booking|保单号|保险单号)[:：]?\s*[A-Za-z0-9-]{6,}/gi,
      "$1：[编号已脱敏]",
    )
    .replace(/(护照|电话)[:：]?\s*\S+/g, "$1：[敏感信息已脱敏]");
}

export function findSensitivePromptLabels(input: string): string[] {
  const checks: Array<{ label: string; pattern: RegExp }> = [
    { label: "手机号", pattern: /\b1[3-9]\d{9}\b/ },
    { label: "身份证号", pattern: /\b\d{17}[\dXx]\b/ },
    { label: "银行卡号", pattern: /\b(?:\d[ -]?){16,19}\b/ },
    { label: "证件号", pattern: /\b[A-Za-z]\d{7,9}\b/ },
    {
      label: "订单或保单编号",
      pattern: /(订单号|订单|order|booking|保单号|保险单号)[:：]?\s*[A-Za-z0-9-]{6,}/i,
    },
    { label: "护照或电话", pattern: /(护照|电话)[:：]?\s*\S+/ },
  ];
  const labels = checks
    .filter((check) => check.pattern.test(input))
    .map((check) => check.label);

  return Array.from(new Set(labels));
}

export function summarizePromptForStorage(
  taskType: AiTaskType,
  input: string,
): string {
  const task = getAiTaskDefinition(taskType);
  const redacted = redactSensitivePrompt(input).replace(/\s+/g, " ").trim();
  const preview = redacted.slice(0, 120);

  return `${task.label}；摘要：${preview}${redacted.length > 120 ? "..." : ""}`;
}

export function summarizeResponseForStorage(response: string): string {
  const cleaned = response.replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 180) + (cleaned.length > 180 ? "..." : "");
}

export function ensureAiDraftNotice(text: string): string {
  return text.includes(AI_DRAFT_NOTICE) ? text : `${AI_DRAFT_NOTICE}\n\n${text}`;
}

export function buildAiNoteDraft({
  createdAt = new Date(),
  responseText,
  taskType,
}: {
  createdAt?: Date;
  responseText: string;
  taskType: AiTaskType;
}) {
  const task = getAiTaskDefinition(taskType);
  const dateText = formatDate(createdAt);

  return {
    content: ensureAiDraftNotice(responseText),
    tags: ["AI草稿", task.label],
    title: `${task.label} - ${dateText}`,
  };
}

export function signAiDraft({
  content,
  conversationId,
  secret = process.env.SESSION_SECRET ?? "traceme-dev-signature",
  taskType,
  tripId,
}: {
  content: string;
  conversationId: string;
  secret?: string;
  taskType: AiTaskType;
  tripId: string;
}): string {
  return createHmac("sha256", secret)
    .update(
      [tripId, conversationId, taskType, normalizeSignatureContent(content)].join(
        "\n",
      ),
    )
    .digest("hex");
}

export function verifyAiDraftSignature({
  content,
  conversationId,
  secret = process.env.SESSION_SECRET ?? "traceme-dev-signature",
  signature,
  taskType,
  tripId,
}: {
  content: string;
  conversationId: string;
  secret?: string;
  signature: string;
  taskType: AiTaskType;
  tripId: string;
}): boolean {
  const expected = signAiDraft({
    content,
    conversationId,
    secret,
    taskType,
    tripId,
  });
  const actualBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

class MockTravelAiProvider implements AiProvider {
  name = "mock";

  isConfigured(): boolean {
    return true;
  }

  async generateText(request: AiGenerateRequest): Promise<string> {
    const sections = request.task.outputSections
      .map(
        (section) =>
          `## ${section}\n- 这是基于当前输入生成的 mock 草稿，请按实际资料补充。\n- 不确定的信息需要核验。`,
      )
      .join("\n\n");

    const text = [
      `# ${request.task.label}`,
      "",
      sections,
      "",
      "## 需要人工核验的信息",
      "- 营业时间、票价、预约要求、交通班次、签证和当地政策。",
    ].join("\n");

    return request.includeDraftNotice === false ? text : ensureAiDraftNotice(text);
  }
}

class OpenAiResponsesProvider implements AiProvider {
  name = "openai";

  constructor(
    private readonly env: Record<string, string | undefined>,
    private readonly model: string,
    private readonly apiKeyOverride?: string,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.apiKeyOverride?.trim() || this.env.OPENAI_API_KEY?.trim());
  }

  async generateText(request: AiGenerateRequest): Promise<string> {
    const apiKey = this.apiKeyOverride?.trim() || this.env.OPENAI_API_KEY?.trim();

    if (!apiKey) {
      throw new Error("未配置 AI 服务");
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      body: JSON.stringify({
        input: request.userPrompt,
        instructions: request.systemPrompt,
        max_output_tokens: request.maxOutputTokens ?? 1800,
        model: this.model,
      }),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    if (!response.ok) {
      throw new Error("AI 服务暂时不可用，请稍后重试。");
    }

    const data: unknown = await response.json();
    const text = extractOpenAiOutputText(data);

    if (!text.trim()) {
      throw new Error("AI 服务未返回可用内容，请稍后重试。");
    }

    return request.includeDraftNotice === false ? text : ensureAiDraftNotice(text);
  }
}

function extractOpenAiOutputText(data: unknown): string {
  if (isRecord(data) && typeof data.output_text === "string") {
    return data.output_text;
  }

  if (!isRecord(data) || !Array.isArray(data.output)) {
    return "";
  }

  return data.output
    .flatMap((item) => (isRecord(item) && Array.isArray(item.content) ? item.content : []))
    .map((content) => {
      if (!isRecord(content)) {
        return "";
      }

      if (typeof content.text === "string") {
        return content.text;
      }

      if (typeof content.output_text === "string") {
        return content.output_text;
      }

      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatPromptFieldValues(fieldValues: AiPromptFieldValue[]): string[] {
  const formatted = fieldValues
    .map((field) => ({
      label: field.label.trim(),
      value: redactSensitivePrompt(field.value.trim()),
    }))
    .filter((field) => field.label && field.value)
    .map((field) => `- ${field.label}：${field.value}`);

  return formatted.length > 0 ? formatted : ["- 未填写结构化字段"];
}

function normalizeSignatureContent(content: string): string {
  return content.replace(/\r\n/g, "\n");
}

function formatDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
