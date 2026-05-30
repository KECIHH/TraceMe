import Link from "next/link";

import { requireUser } from "@/lib/auth/session";
import { formatDisplayDateTime, formatEmptyValue } from "@/lib/display-format";
import { formatBytes, getSystemOverview } from "@/lib/settings/system";
import { isAiEnabledByUserSetting } from "@/server/services/ai/settings";

const quickLinks = [
  {
    description: "修改显示名称，查看登录用户名。",
    href: "/settings/profile",
    label: "个人资料",
  },
  {
    description: "更新登录密码，并让其他会话失效。",
    href: "/settings/password",
    label: "修改密码",
  },
  {
    description: "创建、下载和删除系统备份。",
    href: "/settings/backups",
    label: "备份管理",
  },
  {
    description: "查看 AI 开关、Provider 和 Key 配置状态。",
    href: "/settings/ai",
    label: "AI 设置",
  },
  {
    description: "查看登录与敏感配置保护说明。",
    href: "/settings/sessions",
    label: "安全信息",
  },
  {
    description: "创建协作用户，并把用户加入旅行成员列表。",
    href: "/settings/users",
    label: "用户管理",
  },
  {
    description: "查看版本、数据库、存储和维护状态。",
    href: "/settings/system",
    label: "关于系统",
  },
];

export default async function SettingsPage() {
  const user = await requireUser();
  const aiEnabled = await isAiEnabledByUserSetting();
  const system = await getSystemOverview({ aiEnabled });

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-[#2f6f73]">系统设置</p>
        <h1 className="mt-2 text-3xl font-semibold">设置中心</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5d6972]">
          管理个人资料、登录安全、系统状态、备份、AI 配置和协作用户。
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SummaryCard
          detail={`用户名：${user.username}`}
          label="当前用户"
          value={user.displayName ?? user.username}
        />
        <SummaryCard
          detail={`${system.databaseType}，旅行 ${system.tripCount} 条`}
          label="数据库状态"
          tone={system.databaseConnected ? "normal" : "danger"}
          value={system.databaseConnected ? "已连接" : "连接异常"}
        />
        <SummaryCard
          detail={`上传 ${formatBytes(system.uploadBytes)}，备份 ${formatBytes(system.backupBytes)}`}
          label="存储占用"
          value={formatBytes(system.uploadBytes + system.backupBytes)}
        />
      </div>

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">系统状态</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Info label="AI 功能" value={aiEnabled ? "已开启" : "已关闭"} />
          <Info label="AI Provider" value={system.aiProvider} />
          <Info label="AI Key" value={system.aiApiKeyConfigured ? "已配置" : "未配置"} />
          <Info
            label="最近备份"
            value={
              system.recentBackupAt
                ? formatDisplayDateTime(system.recentBackupAt)
                : formatEmptyValue(null)
            }
          />
        </dl>
      </section>

      <section>
        <h2 className="text-lg font-semibold">快捷入口</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((item) => (
            <Link
              className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm transition hover:border-[#2f6f73] hover:bg-[#fbfdfc]"
              href={item.href}
              key={item.label}
            >
              <span className="text-base font-semibold text-[#172026]">
                {item.label}
              </span>
              <span className="mt-2 block text-sm leading-6 text-[#5d6972]">
                {item.description}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </section>
  );
}

function SummaryCard({
  detail,
  label,
  tone = "normal",
  value,
}: {
  detail: string;
  label: string;
  tone?: "danger" | "normal";
  value: string;
}) {
  return (
    <section
      className={[
        "rounded-lg border bg-white p-5 shadow-sm",
        tone === "danger" ? "border-[#f1b8aa]" : "border-[#d8d2c6]",
      ].join(" ")}
    >
      <p className="text-sm font-medium text-[#66737b]">{label}</p>
      <p className="mt-2 break-words text-2xl font-semibold">{value}</p>
      <p className="mt-2 text-sm leading-6 text-[#5d6972]">{detail}</p>
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
