import Link from "next/link";

import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { SubmitButton } from "@/components/submit-button";
import { AI_ADVANCED_TASKS } from "@/lib/ai/advanced";
import { requireAdmin } from "@/lib/collaboration";
import { getSafeAiProviderConfig } from "@/server/services/ai/provider-config";
import {
  getAiPromptTemplates,
  isAiEnabledByUserSetting,
} from "@/server/services/ai/settings";

import {
  deleteAiProviderConfigAction,
  setAiEnabledAction,
  testAiProviderConfigAction,
  updateAiPromptTemplatesAction,
  updateAiProviderConfigAction,
} from "../actions";

type AiSettingsPageProps = {
  searchParams?: Promise<{ error?: string; message?: string }>;
};

export default async function AiSettingsPage({
  searchParams,
}: AiSettingsPageProps) {
  await requireAdmin();
  const notice = (await searchParams) ?? {};
  const aiEnabled = await isAiEnabledByUserSetting();
  const aiConfig = await getSafeAiProviderConfig();
  const promptTemplates = await getAiPromptTemplates();

  return (
    <section className="space-y-6">
      <div>
        <Link className="text-sm font-medium text-[#2f6f73]" href="/settings">
          返回设置中心
        </Link>
        <p className="mt-4 text-sm font-semibold text-[#2f6f73]">AI</p>
        <h1 className="mt-2 text-3xl font-semibold">AI 设置</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5d6972]">
          查看 AI 功能开关、Provider 和 API Key 配置状态。页面只显示“已配置”或“未配置”，不会显示完整 API Key。
        </p>
      </div>
      <Notice error={notice.error} message={notice.message} />

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">配置状态</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Info label="AI 是否启用" value={aiEnabled ? "已启用" : "已关闭"} />
          <Info label="Provider" value={aiConfig.provider} />
          <Info label="模型" value={aiConfig.model} />
          <Info
            label="API Key"
            value={
              aiConfig.apiKeyConfigured
                ? `已配置${aiConfig.apiKeyPreview ? `（${aiConfig.apiKeyPreview}）` : ""}`
                : "未配置"
            }
          />
          <Info
            label="Key 来源"
            value={
              aiConfig.apiKeySource === "env"
                ? "服务端环境变量"
                : aiConfig.apiKeySource === "stored"
                  ? "加密存储"
                  : "不需要"
            }
          />
          <Info
            label="加密存储"
            value={aiConfig.encryptionReady ? "可用" : "未配置环境密钥"}
          />
          <Info
            label="服务状态"
            value={aiEnabled && aiConfig.apiKeyConfigured ? "可用" : "不可用"}
          />
        </dl>
      </section>

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Provider 配置</h2>
        <p className="mt-2 text-sm leading-6 text-[#5d6972]">
          mock provider 不需要 API Key。OpenAI API Key 如果从页面填写，会使用服务端环境变量 AI_CONFIG_ENCRYPTION_KEY 加密后存储。
        </p>
        <form action={updateAiProviderConfigAction} className="mt-5 grid gap-4 md:grid-cols-2">
          <label>
            <span className="text-sm font-medium text-[#34434c]">Provider</span>
            <select
              className={inputClassName}
              defaultValue={aiConfig.provider}
              name="provider"
            >
              <option value="mock">mock</option>
              <option value="openai">openai</option>
            </select>
          </label>
          <label>
            <span className="text-sm font-medium text-[#34434c]">模型</span>
            <select
              className={inputClassName}
              defaultValue={aiConfig.model}
              name="model"
            >
              <option value="mock-travel-structured">mock-travel-structured</option>
              <option value="gpt-4.1-mini">gpt-4.1-mini</option>
              <option value="gpt-4.1">gpt-4.1</option>
              <option value="gpt-4o-mini">gpt-4o-mini</option>
            </select>
          </label>
          <label className="md:col-span-2">
            <span className="text-sm font-medium text-[#34434c]">
              API Key（留空则保留现有加密 Key 或环境变量）
            </span>
            <input
              autoComplete="off"
              className={inputClassName}
              name="apiKey"
              placeholder={
                aiConfig.apiKeyConfigured
                  ? "已配置，不会显示完整 API Key"
                  : "仅 OpenAI provider 需要填写"
              }
              type="password"
            />
          </label>
          <div className="flex flex-wrap gap-3 md:col-span-2">
            <SubmitButton className={primaryButtonClassName} pendingLabel="保存中...">
              保存 provider 配置
            </SubmitButton>
          </div>
        </form>
        <div className="mt-4 flex flex-wrap gap-3">
          <form action={testAiProviderConfigAction}>
            <SubmitButton className={secondaryButtonClassName} pendingLabel="测试中...">
              测试连接
            </SubmitButton>
          </form>
          <form action={deleteAiProviderConfigAction}>
            <ConfirmSubmitButton
              className={dangerButtonClassName}
              message="确定删除 AI provider 配置吗？页面加密存储的 API Key 会被删除。"
              pendingLabel="删除中..."
            >
              删除 provider 配置
            </ConfirmSubmitButton>
          </form>
        </div>
      </section>

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">功能开关</h2>
        <p className="mt-2 text-sm leading-6 text-[#5d6972]">
          关闭后，旅行 AI 页面不会发起生成请求。OpenAI Key 仍只通过服务端环境变量读取。
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <form action={setAiEnabledAction}>
            <input name="enabled" type="hidden" value="true" />
            <SubmitButton
              className="rounded-md bg-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#285f62] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={aiEnabled}
              pendingLabel="开启中..."
            >
              开启 AI
            </SubmitButton>
          </form>
          <form action={setAiEnabledAction}>
            <input name="enabled" type="hidden" value="false" />
            <SubmitButton
              className="rounded-md border border-[#d46a55] px-4 py-2.5 text-sm font-semibold text-[#9b2f1f] transition hover:bg-[#fff2ee] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!aiEnabled}
              pendingLabel="关闭中..."
            >
              关闭 AI
            </SubmitButton>
          </form>
        </div>
      </section>

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Prompt 模板管理</h2>
        <p className="mt-2 text-sm leading-6 text-[#5d6972]">
          模板只用于高级 AI 任务。系统仍会在发送前追加数据最小化、脱敏和结构化输出规则。
        </p>
        <form action={updateAiPromptTemplatesAction} className="mt-5 grid gap-4">
          {AI_ADVANCED_TASKS.map((task) => (
            <label key={task.id}>
              <span className="text-sm font-medium text-[#34434c]">
                {task.label}
              </span>
              <textarea
                className={`${inputClassName} min-h-24 resize-y`}
                defaultValue={promptTemplates[task.id]}
                name={`template-${task.id}`}
              />
            </label>
          ))}
          <div>
            <SubmitButton className={primaryButtonClassName} pendingLabel="保存中...">
              保存 Prompt 模板
            </SubmitButton>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-[#ead0a7] bg-[#fff8ec] p-5 text-sm leading-6 text-[#70430f]">
        <h2 className="text-base font-semibold">隐私说明</h2>
        <p className="mt-2">
          本页面不会输出完整 API Key、会话密钥、文档加密密钥或其他敏感环境变量。
        </p>
      </section>
    </section>
  );
}

function Notice({ error, message }: { error?: string; message?: string }) {
  if (!error && !message) {
    return null;
  }

  return (
    <div
      className={[
        "rounded-lg border px-4 py-3 text-sm",
        error
          ? "border-[#f1b8aa] bg-[#fff2ee] text-[#9b2f1f]"
          : "border-[#b8d8ca] bg-[#f0faf5] text-[#276044]",
      ].join(" ")}
    >
      {error ?? message}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[#7a858c]">{label}</dt>
      <dd className="mt-1 break-words font-medium text-[#34434c]">{value}</dd>
    </div>
  );
}

const inputClassName =
  "mt-2 w-full rounded-md border border-[#cfd7d2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#2f6f73] focus:ring-2 focus:ring-[#2f6f73]/20";

const primaryButtonClassName =
  "rounded-md bg-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#285f62] disabled:cursor-not-allowed disabled:opacity-50";

const secondaryButtonClassName =
  "rounded-md border border-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-[#2f6f73] transition hover:bg-[#edf4f1] disabled:cursor-not-allowed disabled:opacity-50";

const dangerButtonClassName =
  "rounded-md border border-[#d46a55] px-4 py-2.5 text-sm font-semibold text-[#9b2f1f] transition hover:bg-[#fff2ee] disabled:cursor-not-allowed disabled:opacity-50";
