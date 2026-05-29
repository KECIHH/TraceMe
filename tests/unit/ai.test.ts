import { describe, expect, it } from "vitest";

import {
  AI_DRAFT_NOTICE,
  buildAiNoteDraft,
  buildPromptStorageInput,
  buildSystemPrompt,
  buildUserPrompt,
  findSensitivePromptLabels,
  getAiProviderConfig,
  getAiTaskDefinition,
  isAiTaskType,
  redactSensitivePrompt,
  signAiDraft,
  summarizePromptForStorage,
  verifyAiDraftSignature,
} from "@/lib/ai";

describe("AI assistant helpers", () => {
  it("detects provider configuration", () => {
    expect(getAiProviderConfig({}).configured).toBe(false);
    expect(getAiProviderConfig({ OPENAI_API_KEY: "test-openai-key" })).toMatchObject({
      configured: true,
      provider: "openai",
    });
    expect(getAiProviderConfig({ AI_PROVIDER: "mock" })).toMatchObject({
      configured: true,
      provider: "mock",
    });
    expect(
      getAiProviderConfig({
        AI_FEATURE_ENABLED: "false",
        OPENAI_API_KEY: "test-openai-key",
      }),
    ).toMatchObject({ configured: false, reason: "AI 功能已关闭" });
  });

  it("builds system and user prompts with safety rules", () => {
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt({
      additionalInput: "三日游，喜欢城市漫步。",
      fieldValues: [
        { label: "目的地", value: "杭州" },
        { label: "预算", value: "5000 元" },
      ],
      taskType: "itinerary-draft",
      trip: {
        baseCurrency: "CNY",
        budgetAmount: "5000",
        homeCity: "上海",
        mainDestination: "杭州",
        title: "国庆旅行",
      },
    });

    expect(systemPrompt).toContain("输出必须是中文");
    expect(systemPrompt).toContain("不要索要或处理身份证");
    expect(systemPrompt).toContain(AI_DRAFT_NOTICE);
    expect(userPrompt).toContain("任务类型：几日游行程草稿");
    expect(userPrompt).toContain("旅行基础信息（不包含文件内容）");
    expect(userPrompt).toContain("- 目的地：杭州");
    expect(userPrompt).toContain("补充说明：三日游，喜欢城市漫步。");
    expect(userPrompt).toContain("需要人工核验的信息");
  });

  it("redacts sensitive prompt content before storage", () => {
    const redacted = redactSensitivePrompt(
      "手机号 13812345678，身份证 110105199001011234，订单号 ABCD123456。",
    );

    expect(redacted).toContain("[手机号已脱敏]");
    expect(redacted).toContain("[身份证号已脱敏]");
    expect(redacted).toContain("订单号：[编号已脱敏]");
    expect(redacted).not.toContain("13812345678");
    expect(redacted).not.toContain("110105199001011234");
  });

  it("detects sensitive prompt labels before AI calls", () => {
    expect(
      findSensitivePromptLabels("手机号 13812345678，订单号 ABCD123456"),
    ).toEqual(["手机号", "订单或保单编号"]);
    expect(findSensitivePromptLabels("只喜欢城市漫步")).toEqual([]);
  });

  it("maps AI task types", () => {
    expect(isAiTaskType("food-recommendations")).toBe(true);
    expect(isAiTaskType("unknown")).toBe(false);
    expect(getAiTaskDefinition("stay-advice").label).toBe("住宿选择建议草稿");
    expect(getAiTaskDefinition("stay-advice").fields[0]).toMatchObject({
      key: "destination",
      label: "目的地",
    });
  });

  it("stores only a short redacted prompt summary", () => {
    const summary = summarizePromptForStorage(
      "destination-guide",
      buildPromptStorageInput({
        additionalInput: "请安排京都旅行，手机号 13812345678。" + "很多补充信息".repeat(30),
        fieldValues: [{ label: "目的地", value: "京都" }],
      }),
    );

    expect(summary).toContain("目的地攻略草稿");
    expect(summary).toContain("[手机号已脱敏]");
    expect(summary.length).toBeLessThanOrEqual(150);
  });

  it("converts an AI result to a note draft", () => {
    const note = buildAiNoteDraft({
      createdAt: new Date(2026, 4, 29),
      responseText: "## 总结\n适合保存为笔记。",
      taskType: "trip-review",
    });

    expect(note.title).toBe("旅行复盘草稿 - 2026-05-29");
    expect(note.content).toContain(AI_DRAFT_NOTICE);
    expect(note.tags).toEqual(["AI草稿", "旅行复盘草稿"]);
  });

  it("signs AI draft content before saving as a note", () => {
    const signature = signAiDraft({
      content: "AI 草稿",
      conversationId: "conversation-1",
      secret: "test-secret",
      taskType: "travel-notes",
      tripId: "trip-1",
    });

    expect(
      verifyAiDraftSignature({
        content: "AI 草稿",
        conversationId: "conversation-1",
        secret: "test-secret",
        signature,
        taskType: "travel-notes",
        tripId: "trip-1",
      }),
    ).toBe(true);
    expect(
      verifyAiDraftSignature({
        content: "被篡改的草稿",
        conversationId: "conversation-1",
        secret: "test-secret",
        signature,
        taskType: "travel-notes",
        tripId: "trip-1",
      }),
    ).toBe(false);
  });
});
