import { afterEach, describe, expect, it, vi } from "vitest";

import { AI_DRAFT_NOTICE, createConfiguredAiProvider } from "@/lib/ai";
import {
  applyAiDraftToTrip,
  buildAdvancedAiPrompt,
  buildAiDraftText,
  createMockStructuredDraft,
  mergePromptTemplates,
  minimizeTripForAi,
  normalizeStructuredDraft,
} from "@/lib/ai/advanced";
import {
  decryptApiKey,
  encryptApiKey,
  getAiConfigEncryptionKey,
  maskApiKey,
  testAiProviderConnection,
} from "@/server/services/ai/provider-config";

const encryptionEnv = {
  AI_CONFIG_ENCRYPTION_KEY: "stage18-ai-config-encryption-key-32-bytes",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("stage 18 AI provider security", () => {
  it("masks provider configuration without exposing the full API key", () => {
    const masked = maskApiKey("sk-test-1234567890abcdef");

    expect(masked).toBe("sk-t...cdef");
    expect(masked).not.toContain("1234567890");
  });

  it("encrypts API keys with a server-side environment key", () => {
    const key = getAiConfigEncryptionKey(encryptionEnv);
    const encrypted = encryptApiKey("sk-secret-value", encryptionEnv);

    expect(key).toBeTruthy();
    expect(encrypted.ciphertext).not.toContain("sk-secret-value");
    expect(decryptApiKey(encrypted, encryptionEnv)).toBe("sk-secret-value");
    expect(decryptApiKey(encrypted, {})).toBeNull();
  });

  it("can call OpenAI without prepending the draft notice for structured JSON", async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({ output_text: '{"summary":"OK","findings":[],"suggestions":[]}' }),
      ok: true,
    }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = createConfiguredAiProvider({
      apiKey: "sk-test-key",
      configured: true,
      model: "gpt-4.1-mini",
      provider: "openai",
    });
    const text = await provider.generateText({
      includeDraftNotice: false,
      systemPrompt: "只返回 JSON。",
      task: {
        fields: [],
        id: "travel-notes",
        label: "结构化测试",
        outputSections: ["JSON"],
        placeholder: "",
      },
      userPrompt: "测试",
    });

    expect(text).toBe('{"summary":"OK","findings":[],"suggestions":[]}');
    expect(text).not.toContain(AI_DRAFT_NOTICE);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("performs a real provider connection check without exposing the API key", async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({ output_text: "OK" }),
      ok: true,
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      testAiProviderConnection({
        apiKey: "sk-test-key",
        apiKeyConfigured: true,
        apiKeySource: "stored",
        apiKeyPreview: "sk-t...-key",
        encryptionReady: true,
        model: "gpt-4.1-mini",
        provider: "openai",
      }),
    ).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("stage 18 AI data minimization", () => {
  it("builds a minimized prompt without files or sensitive values", () => {
    const tripInput = {
      baseCurrency: "CNY",
      budgetAmount: "3000",
      checklistItems: [
        { category: "证件", status: "TODO", title: "护照 123456789" },
      ],
      destinations: [
        {
          arrivalDate: new Date("2026-10-01T00:00:00.000Z"),
          country: "中国",
          departureDate: new Date("2026-10-03T00:00:00.000Z"),
          name: "杭州",
          region: "浙江",
        },
      ],
      documents: [{ title: "不应发送的上传文件内容" }],
      expenses: [
        {
          amount: "2800",
          category: "交通",
          currency: "CNY",
          title: "订单号 ABCD123456",
        },
      ],
      homeCity: "上海",
      itineraryDays: [],
      mainDestination: "杭州",
      places: [],
      routePlans: [],
      startDate: new Date("2026-10-01T00:00:00.000Z"),
      status: "PLANNING",
      title: "国庆旅行 手机号 13812345678",
      transports: [],
      weatherSnapshots: [],
    };
    const context = minimizeTripForAi(
      tripInput as unknown as Parameters<typeof minimizeTripForAi>[0],
    );
    const prompt = buildAdvancedAiPrompt({
      context,
      taskType: "budget-risk",
      template: "只分析预算风险。",
    });

    expect(JSON.stringify(context)).not.toContain("上传文件内容");
    expect(prompt).not.toContain("13812345678");
    expect(prompt).not.toContain("ABCD123456");
    expect(prompt).toContain("[手机号已脱敏]");
    expect(prompt).toContain("只使用下方最小化旅行数据");
  });

  it("normalizes prompt templates and falls back to defaults", () => {
    const templates = mergePromptTemplates({
      "budget-risk": "预算模板",
      "route-suggestion": "",
    });

    expect(templates["budget-risk"]).toBe("预算模板");
    expect(templates["route-suggestion"]).toContain("路线建议");
  });
});

describe("stage 18 AI structured drafts", () => {
  it("converts structured AI output to a draft text with notice", () => {
    const content = normalizeStructuredDraft("itinerary-optimization", {
      findings: ["行程偏密"],
      suggestions: ["减少低优先级景点"],
      summary: "建议调整节奏。",
    });
    const text = buildAiDraftText("行程优化 - 2026-05-30", content);

    expect(text).toContain(AI_DRAFT_NOTICE);
    expect(text).toContain("行程偏密");
    expect(text).toContain("减少低优先级景点");
  });

  it("generates a mock checklist completion draft", () => {
    const context = minimizeTripForAi({
      baseCurrency: "CNY",
      checklistItems: [],
      destinations: [],
      expenses: [],
      homeCity: "上海",
      itineraryDays: [],
      mainDestination: "成都",
      places: [],
      routePlans: [],
      status: "PLANNING",
      title: "成都旅行",
      transports: [],
      weatherSnapshots: [],
    });
    const draft = createMockStructuredDraft("checklist-completion", context);

    expect(draft.notice).toBe(AI_DRAFT_NOTICE);
    expect(draft.checklistItems?.length).toBeGreaterThan(0);
    expect(draft.checklistItems?.[0].title).not.toContain("身份证号");
  });

  it("applies checklist drafts only after confirmation", async () => {
    const tx = createFakeApplyTransaction();
    const content = normalizeStructuredDraft("checklist-completion", {
      checklistItems: [
        { category: "电子设备", quantity: 1, title: "移动电源" },
        { category: "药品", quantity: 1, title: "常用药" },
      ],
      findings: ["清单缺少电子设备"],
      suggestions: ["补齐后再出发"],
      summary: "清单补全",
    });
    const result = await applyAiDraftToTrip(tx, {
      contentJson: content,
      contentText: buildAiDraftText("清单补全", content),
      id: "draft-1",
      status: "draft",
      title: "清单补全",
      tripId: "trip-1",
      type: "checklist-completion",
    });

    expect(result).toEqual({ checklistItemsCreated: 2, noteCreated: false });
    expect(tx.createdChecklistItems).toHaveLength(2);
    expect(tx.updatedDraft).toEqual({ status: "applied" });
  });

  it("rejects checklist drafts with no new applicable items", async () => {
    const tx = createFakeApplyTransaction([
      { category: "电子设备", title: "移动电源" },
    ]);
    const content = normalizeStructuredDraft("checklist-completion", {
      checklistItems: [
        { category: "电子设备", quantity: 1, title: "移动电源" },
      ],
      findings: ["清单缺少电子设备"],
      suggestions: ["补齐后再出发"],
      summary: "清单补全",
    });

    await expect(
      applyAiDraftToTrip(tx, {
        contentJson: content,
        contentText: buildAiDraftText("清单补全", content),
        id: "draft-duplicate",
        status: "draft",
        title: "清单补全",
        tripId: "trip-1",
        type: "checklist-completion",
      }),
    ).rejects.toThrow("没有新的可应用项");
    expect(tx.updatedDraft).toBeNull();
  });

  it("rejects malformed drafts before applying", async () => {
    const tx = createFakeApplyTransaction();

    await expect(
      applyAiDraftToTrip(tx, {
        contentJson: null,
        contentText: "broken",
        id: "draft-broken",
        status: "draft",
        title: "坏草稿",
        tripId: "trip-1",
        type: "checklist-completion",
      }),
    ).rejects.toThrow("AI 草稿结构无效");
    expect(tx.createdChecklistItems).toHaveLength(0);
  });

  it("applies analysis drafts as notes instead of overwriting itinerary", async () => {
    const tx = createFakeApplyTransaction();
    const content = normalizeStructuredDraft("itinerary-optimization", {
      findings: ["时间冲突"],
      suggestions: ["人工调整顺序"],
      summary: "行程优化",
    });
    const result = await applyAiDraftToTrip(tx, {
      contentJson: content,
      contentText: buildAiDraftText("行程优化", content),
      id: "draft-2",
      status: "draft",
      title: "行程优化",
      tripId: "trip-1",
      type: "itinerary-optimization",
    });

    expect(result).toEqual({ checklistItemsCreated: 0, noteCreated: true });
    expect(tx.createdNotes[0].content).toContain(AI_DRAFT_NOTICE);
    expect(tx.createdChecklistItems).toHaveLength(0);
  });
});

function createFakeApplyTransaction(
  existingItems: Array<{ category: string; title: string }> = [],
) {
  const createdChecklistItems: unknown[] = [];
  const createdNotes: Array<{ content: string }> = [];
  let updatedDraft: unknown = null;

  const fake = {
    aiDraft: {
      update: async ({ data }: { data: unknown }) => {
        updatedDraft = data;
        return data;
      },
    },
    checklistItem: {
      createMany: async ({ data }: { data: unknown[] }) => {
        createdChecklistItems.push(...data);
        return { count: data.length };
      },
      findMany: async () => existingItems,
    },
    createdChecklistItems,
    createdNotes,
    get updatedDraft() {
      return updatedDraft;
    },
    note: {
      create: async ({ data }: { data: { content: string } }) => {
        createdNotes.push(data);
        return data;
      },
    },
  };

  return fake as typeof fake & Parameters<typeof applyAiDraftToTrip>[0];
}
