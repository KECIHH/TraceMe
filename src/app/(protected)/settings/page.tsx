import Link from "next/link";

import { requireUser } from "@/lib/auth/session";
import { getAiProviderConfig } from "@/lib/ai";
import { isAiEnabledByUserSetting } from "@/server/services/ai/settings";

import { setAiEnabledAction } from "./actions";

export default async function SettingsPage() {
  const user = await requireUser();
  const aiEnabled = await isAiEnabledByUserSetting();
  const aiConfig = getAiProviderConfig();

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-[#2f6f73]">Settings</p>
        <h1 className="mt-2 text-3xl font-semibold">系统设置</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5d6972]">
          当前只展示只读信息，敏感配置不会在前端显示或修改。
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-[#d8d2c6] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">当前用户</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-[#66737b]">用户名</dt>
              <dd className="font-medium">{user.username}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[#66737b]">显示名称</dt>
              <dd className="font-medium">{user.displayName ?? "未设置"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[#66737b]">角色</dt>
              <dd className="font-medium">{user.role}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-lg border border-[#d8d2c6] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">系统信息</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-[#66737b]">数据库</dt>
              <dd className="font-medium">SQLite + Prisma</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[#66737b]">认证方式</dt>
              <dd className="font-medium">HTTP-only Cookie Session</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[#66737b]">敏感配置</dt>
              <dd className="font-medium">仅服务端读取</dd>
            </div>
          </dl>
          <Link
            className="mt-5 inline-flex justify-center rounded-md border border-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-[#2f6f73] transition hover:bg-[#edf4f2]"
            href="/settings/backups"
          >
            管理系统备份
          </Link>
        </section>

        <section className="rounded-lg border border-[#d8d2c6] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">AI 功能</h2>
          <p className="mt-3 text-sm leading-6 text-[#5d6972]">
            AI Key 仅从服务端环境变量读取，前端不会显示。关闭后，旅行 AI 页面不会发起生成请求。
          </p>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-[#66737b]">用户开关</dt>
              <dd className="font-medium">{aiEnabled ? "已开启" : "已关闭"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[#66737b]">服务状态</dt>
              <dd className="font-medium">
                {aiConfig.configured ? "已配置" : aiConfig.reason ?? "未配置 AI 服务"}
              </dd>
            </div>
          </dl>
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
      </div>
    </section>
  );
}
