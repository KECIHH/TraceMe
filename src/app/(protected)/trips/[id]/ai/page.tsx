import { notFound } from "next/navigation";

import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { SubmitButton } from "@/components/submit-button";
import { AI_DRAFT_NOTICE, AI_TASKS } from "@/lib/ai";
import { AI_ADVANCED_TASKS } from "@/lib/ai/advanced";
import { prisma } from "@/lib/prisma";
import { getSafeAiProviderConfig } from "@/server/services/ai/provider-config";
import { isAiEnabledByUserSetting } from "@/server/services/ai/settings";

import { Notice, TripModuleNav } from "../module-nav";
import {
  applyAdvancedAiDraftAction,
  dismissAdvancedAiDraftAction,
  generateAdvancedAiDraftAction,
  generateAiDraftAction,
  saveAiDraftAsNoteAction,
} from "./actions";
import { AiAssistantClient } from "./ai-assistant-client";

type AiPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string; message?: string }>;
};

export default async function AiAssistantPage({
  params,
  searchParams,
}: AiPageProps) {
  const { id } = await params;
  const notice = (await searchParams) ?? {};
  const trip = await prisma.trip.findUnique({
    include: {
      aiConversations: {
        orderBy: { createdAt: "desc" },
        take: 12,
      },
      aiDrafts: {
        orderBy: { createdAt: "desc" },
        take: 12,
      },
    },
    where: { id },
  });

  if (!trip) {
    notFound();
  }

  const providerConfig = await getSafeAiProviderConfig();
  const userEnabled = await isAiEnabledByUserSetting();
  const configured = userEnabled && providerConfig.apiKeyConfigured;
  const disabledReason = userEnabled
    ? "未配置 AI 服务"
    : "AI 功能已关闭";
  const generateAction = generateAiDraftAction.bind(null, trip.id);
  const saveNoteAction = saveAiDraftAsNoteAction.bind(null, trip.id);
  const generateAdvancedAction = generateAdvancedAiDraftAction.bind(null, trip.id);

  return (
    <section className="space-y-6">
      <TripModuleNav active="ai" tripId={trip.id} tripTitle={trip.title} />
      <Notice error={notice.error} message={notice.message} />

      <div className="rounded-lg border border-[#e3b75c] bg-[#fff8e6] p-5 text-[#5c430b] shadow-sm">
        <p className="text-base font-semibold">{AI_DRAFT_NOTICE}</p>
        <p className="mt-2 text-sm leading-6">
          请勿输入身份证、护照、手机号、订单号、保险单、同行人隐私等敏感信息。AI 不会自动读取文件票据内容。
        </p>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#2f6f73]">AI 助手</p>
          <h1 className="mt-2 text-3xl font-semibold">AI 助手</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#5d6972]">
            用于生成攻略、行程、清单、美食、住宿、交通、注意事项和复盘草稿。结果只能作为起点，事实信息必须人工核验。
          </p>
        </div>
        <div className="rounded-md border border-[#d8d2c6] bg-white px-4 py-3 text-sm shadow-sm">
          <span className="text-[#66737b]">AI 状态：</span>
          <span className="font-semibold text-[#172026]">
            {configured ? "可用" : disabledReason}
          </span>
        </div>
      </div>

      <AiAssistantClient
        configured={configured}
        disabledReason={disabledReason}
        generateAction={generateAction}
        saveNoteAction={saveNoteAction}
        tasks={AI_TASKS}
      />

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#2f6f73]">高级 AI</p>
            <h2 className="mt-1 text-xl font-semibold">生成结构化草稿</h2>
          </div>
          <p className="text-sm text-[#66737b]">
            Provider：{providerConfig.provider} · 模型：{providerConfig.model}
          </p>
        </div>
        <p className="mt-3 text-sm leading-6 text-[#5d6972]">
          高级任务只发送已录入旅行数据的最小化摘要，不发送上传文件内容，不发送手机号、证件号、订单号等敏感字段。生成结果会先保存为 Draft。
        </p>
        {configured ? null : (
          <p className="mt-4 rounded-md border border-[#f0d39b] bg-[#fff9e8] px-4 py-3 text-sm text-[#73530f]">
            {disabledReason}
          </p>
        )}
        <form action={generateAdvancedAction} className="mt-5 grid gap-4 md:grid-cols-[1fr_auto]">
          <label>
            <span className="text-sm font-medium text-[#34434c]">高级任务</span>
            <select
              className="mt-2 w-full rounded-md border border-[#cfd7d2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#2f6f73] focus:ring-2 focus:ring-[#2f6f73]/20"
              disabled={!configured}
              name="advancedTaskType"
            >
              {AI_ADVANCED_TASKS.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <SubmitButton
              className="rounded-md bg-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#285f62] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!configured}
              pendingLabel="生成中..."
            >
              生成结构化草稿
            </SubmitButton>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#2f6f73]">Draft</p>
            <h2 className="mt-1 text-xl font-semibold">AI 结构化草稿</h2>
          </div>
          <p className="text-sm text-[#66737b]">需用户确认后才会应用到正式数据。</p>
        </div>

        {trip.aiDrafts.length === 0 ? (
          <p className="mt-4 rounded-md bg-[#fbfaf7] p-4 text-sm text-[#5d6972]">
            暂无 AI 结构化草稿。
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {trip.aiDrafts.map((draft) => {
              const applyAction = applyAdvancedAiDraftAction.bind(
                null,
                trip.id,
                draft.id,
              );
              const dismissAction = dismissAdvancedAiDraftAction.bind(
                null,
                trip.id,
                draft.id,
              );

              return (
                <article
                  className="rounded-md border border-[#e0d9cc] bg-[#fbfaf7] p-4"
                  key={draft.id}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{draft.title}</h3>
                        <span className={draftStatusClassName(draft.status)}>
                          {draft.status === "draft"
                            ? "待确认"
                            : draft.status === "applied"
                              ? "已应用"
                              : "已删除"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[#7a858c]">
                        {draft.type} · {draft.createdAt.toLocaleString("zh-CN")}
                      </p>
                    </div>
                    {draft.status === "draft" ? (
                      <div className="flex flex-wrap gap-2">
                        <form action={applyAction}>
                          <SubmitButton
                            className="rounded-md bg-[#2f6f73] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#285f62]"
                            pendingLabel="应用中..."
                          >
                            应用草稿
                          </SubmitButton>
                        </form>
                        <form action={dismissAction}>
                          <ConfirmSubmitButton
                            className="rounded-md border border-[#d46a55] px-3 py-2 text-sm font-semibold text-[#9b2f1f] transition hover:bg-[#fff2ee]"
                            message={`确定删除 AI 草稿“${draft.title}”吗？`}
                            pendingLabel="删除中..."
                          >
                            删除草稿
                          </ConfirmSubmitButton>
                        </form>
                      </div>
                    ) : null}
                  </div>
                  <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-white p-4 text-sm leading-6 text-[#34434c]">
                    {draft.contentText}
                  </pre>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#2f6f73]">历史记录</p>
            <h2 className="mt-1 text-xl font-semibold">历史生成记录</h2>
          </div>
          <p className="text-sm text-[#66737b]">只保存脱敏摘要，不保存完整敏感原文。</p>
        </div>

        {trip.aiConversations.length === 0 ? (
          <p className="mt-4 rounded-md bg-[#fbfaf7] p-4 text-sm text-[#5d6972]">
            暂无历史生成记录。
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {trip.aiConversations.map((conversation) => (
              <article
                className="rounded-md border border-[#e0d9cc] bg-[#fbfaf7] p-4"
                key={conversation.id}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="font-semibold">{conversation.title}</h3>
                    <p className="mt-1 text-xs text-[#7a858c]">
                      {conversation.createdAt.toLocaleString("zh-CN")}
                    </p>
                  </div>
                  {conversation.purpose ? (
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs text-[#5d6972]">
                      {conversation.purpose}
                    </span>
                  ) : null}
                </div>
                {conversation.promptRedacted ? (
                  <p className="mt-3 text-sm leading-6 text-[#5d6972]">
                    {conversation.promptRedacted}
                  </p>
                ) : null}
                {conversation.responseSummary ? (
                  <p className="mt-2 text-sm leading-6 text-[#34434c]">
                    {conversation.responseSummary}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function draftStatusClassName(status: string) {
  if (status === "applied") {
    return "rounded-full bg-[#e8f6ef] px-2.5 py-1 text-xs font-medium text-[#276044]";
  }

  if (status === "dismissed") {
    return "rounded-full bg-[#eceff3] px-2.5 py-1 text-xs font-medium text-[#4d5964]";
  }

  return "rounded-full bg-[#fff7d6] px-2.5 py-1 text-xs font-medium text-[#6d5412]";
}
