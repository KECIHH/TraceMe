import { notFound } from "next/navigation";

import { AI_DRAFT_NOTICE, AI_TASKS, getAiProviderConfig } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { isAiEnabledByUserSetting } from "@/server/services/ai/settings";

import { Notice, TripModuleNav } from "../module-nav";
import {
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
    },
    where: { id },
  });

  if (!trip) {
    notFound();
  }

  const providerConfig = getAiProviderConfig();
  const userEnabled = await isAiEnabledByUserSetting();
  const configured = userEnabled && providerConfig.configured;
  const disabledReason = userEnabled
    ? providerConfig.reason ?? "未配置 AI 服务"
    : "AI 功能已关闭";
  const generateAction = generateAiDraftAction.bind(null, trip.id);
  const saveNoteAction = saveAiDraftAsNoteAction.bind(null, trip.id);

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
          <p className="text-sm font-semibold text-[#2f6f73]">AI Assistant</p>
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
            <p className="text-sm font-semibold text-[#2f6f73]">History</p>
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
