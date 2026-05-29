import Link from "next/link";

import { getAiProviderConfig } from "@/lib/ai";
import { requireUser } from "@/lib/auth/session";
import { isAiEnabledByUserSetting } from "@/server/services/ai/settings";

import { setAiEnabledAction } from "../actions";

export default async function AiSettingsPage() {
  await requireUser();
  const aiEnabled = await isAiEnabledByUserSetting();
  const aiConfig = getAiProviderConfig();
  const apiKeyConfigured = Boolean(process.env.OPENAI_API_KEY?.trim());

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

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">配置状态</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Info label="AI 是否启用" value={aiEnabled ? "已启用" : "已关闭"} />
          <Info label="Provider" value={aiConfig.provider} />
          <Info label="模型" value={aiConfig.model} />
          <Info label="API Key" value={apiKeyConfigured ? "已配置" : "未配置"} />
          <Info label="服务状态" value={aiConfig.configured ? "可用" : "不可用"} />
          <Info label="配置说明" value={aiConfig.reason ?? "配置正常"} />
        </dl>
      </section>

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">功能开关</h2>
        <p className="mt-2 text-sm leading-6 text-[#5d6972]">
          关闭后，旅行 AI 页面不会发起生成请求。OpenAI Key 仍只通过服务端环境变量读取。
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <form action={setAiEnabledAction}>
            <input name="enabled" type="hidden" value="true" />
            <button
              className="rounded-md bg-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#285f62] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={aiEnabled}
              type="submit"
            >
              开启 AI
            </button>
          </form>
          <form action={setAiEnabledAction}>
            <input name="enabled" type="hidden" value="false" />
            <button
              className="rounded-md border border-[#d46a55] px-4 py-2.5 text-sm font-semibold text-[#9b2f1f] transition hover:bg-[#fff2ee] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!aiEnabled}
              type="submit"
            >
              关闭 AI
            </button>
          </form>
        </div>
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[#7a858c]">{label}</dt>
      <dd className="mt-1 break-words font-medium text-[#34434c]">{value}</dd>
    </div>
  );
}
