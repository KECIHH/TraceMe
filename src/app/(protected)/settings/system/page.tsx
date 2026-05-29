import Link from "next/link";

import { Notice } from "@/app/(protected)/trips/[id]/module-nav";
import { requireUser } from "@/lib/auth/session";
import { formatBytes, getSystemOverview } from "@/lib/settings/system";
import { isAiEnabledByUserSetting } from "@/server/services/ai/settings";

import { refreshSystemStatusAction } from "../actions";

type SystemPageProps = {
  searchParams?: Promise<{ error?: string; message?: string }>;
};

export default async function SystemPage({ searchParams }: SystemPageProps) {
  await requireUser();
  const notice = (await searchParams) ?? {};
  const aiEnabled = await isAiEnabledByUserSetting();
  const system = await getSystemOverview({ aiEnabled });

  return (
    <section className="space-y-6">
      <div>
        <Link className="text-sm font-medium text-[#2f6f73]" href="/settings">
          返回设置中心
        </Link>
        <p className="mt-4 text-sm font-semibold text-[#2f6f73]">System</p>
        <h1 className="mt-2 text-3xl font-semibold">系统信息</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5d6972]">
          查看应用版本、数据库状态、上传目录、备份目录和存储占用。敏感环境变量不会显示。
        </p>
      </div>

      <Notice error={notice.error} message={notice.message} />

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">基础信息</h2>
          <form action={refreshSystemStatusAction}>
            <button
              className="rounded-md border border-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-[#2f6f73] transition hover:bg-[#edf4f2]"
              type="submit"
            >
              重新计算统计
            </button>
          </form>
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Info label="应用名称" value={system.appName} />
          <Info label="应用版本" value={system.appVersion} />
          <Info label="Node 环境" value={system.nodeEnv} />
          <Info label="当前时间" value={system.currentTime.toLocaleString("zh-CN")} />
          <Info label="数据库类型" value={system.databaseType} />
          <Info
            label="数据库连接状态"
            value={system.databaseConnected ? "已连接" : "连接异常"}
          />
          <Info label="AI 是否配置" value={system.aiConfigured ? "已配置" : "未配置"} />
          <Info label="AI 是否启用" value={system.aiEnabled ? "已启用" : "已关闭"} />
        </dl>
      </section>

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">数据统计</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Info label="旅行数量" value={String(system.tripCount)} />
          <Info label="地点数量" value={String(system.placeCount)} />
          <Info label="行程项数量" value={String(system.itineraryItemCount)} />
          <Info label="文件数量" value={String(system.documentCount)} />
          <Info label="上传文件总大小" value={formatBytes(system.uploadBytes)} />
          <Info label="备份文件总大小" value={formatBytes(system.backupBytes)} />
          <Info
            label="最近备份时间"
            value={system.recentBackupAt?.toLocaleString("zh-CN") ?? "暂无"}
          />
          <Info
            label="文件记录总大小"
            value={formatBytes(system.documentRecordBytes)}
          />
        </dl>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <DirectoryCard
          exists={system.uploadDirectory.exists}
          fileCount={system.uploadDirectory.fileCount}
          readable={system.uploadDirectory.readable}
          title="上传目录状态"
          totalBytes={system.uploadDirectory.totalBytes}
        />
        <DirectoryCard
          exists={system.backupDirectory.exists}
          fileCount={system.backupDirectory.fileCount}
          readable={system.backupDirectory.readable}
          title="备份目录状态"
          totalBytes={system.backupDirectory.totalBytes}
        />
      </section>

      <section className="rounded-lg border border-[#ead0a7] bg-[#fff8ec] p-5 text-sm leading-6 text-[#70430f]">
        <h2 className="text-base font-semibold">数据维护工具</h2>
        <p className="mt-2">
          当前提供重新计算统计、检查上传目录、检查备份目录。删除类维护工具暂未开启，避免误删个人资料。
        </p>
      </section>
    </section>
  );
}

function DirectoryCard({
  exists,
  fileCount,
  readable,
  title,
  totalBytes,
}: {
  exists: boolean;
  fileCount: number;
  readable: boolean;
  title: string;
  totalBytes: number;
}) {
  return (
    <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">{title}</h2>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <Info label="目录存在" value={exists ? "是" : "否"} />
        <Info label="可读取" value={readable ? "是" : "否"} />
        <Info label="文件数量" value={String(fileCount)} />
        <Info label="占用空间" value={formatBytes(totalBytes)} />
      </dl>
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
