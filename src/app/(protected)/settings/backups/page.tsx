import Link from "next/link";

import { SubmitButton } from "@/components/submit-button";
import { formatBackupFileSize, listBackupFiles } from "@/lib/backup/files";
import { formatDisplayDateTime } from "@/lib/display-format";
import { prisma } from "@/lib/prisma";
import { Notice } from "@/app/(protected)/trips/[id]/module-nav";

import { BackupDeleteButton } from "./backup-delete-button";
import { createBackupAction } from "./actions";

type BackupsPageProps = {
  searchParams?: Promise<{ error?: string; message?: string }>;
};

export default async function BackupsPage({ searchParams }: BackupsPageProps) {
  const notice = (await searchParams) ?? {};
  const [records, files] = await Promise.all([
    prisma.backupRecord.findMany({ orderBy: { createdAt: "desc" } }),
    listBackupFiles(),
  ]);
  const existingFileNames = new Set(files.map((file) => file.fileName));

  return (
    <section className="space-y-6">
      <div>
        <Link className="text-sm font-medium text-[#2f6f73]" href="/settings">
          返回系统设置
        </Link>
        <p className="mt-4 text-sm font-semibold text-[#2f6f73]">Backups</p>
        <h1 className="mt-2 text-3xl font-semibold">系统备份管理</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5d6972]">
          创建、下载、删除和查看系统备份记录。备份包含 SQLite 数据库和 storage/uploads 文件。
        </p>
      </div>

      <Notice error={notice.error} message={notice.message} />
      <PrivacyNotice />

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">创建新备份</h2>
        <p className="mt-2 text-sm leading-6 text-[#5d6972]">
          备份会生成 zip 文件，文件名格式为 travel-planner-backup-YYYYMMDD-HHmmss.zip。
        </p>
        <form action={createBackupAction} className="mt-4 grid gap-4">
          <label>
            <span className="text-sm font-medium text-[#34434c]">备份备注</span>
            <textarea
              className="mt-2 min-h-24 w-full rounded-md border border-[#cfd7d2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#2f6f73] focus:ring-2 focus:ring-[#2f6f73]/20"
              name="notes"
              placeholder="例如：阶段 9 完成前备份"
            />
          </label>
          <div>
            <SubmitButton
              className="rounded-md bg-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#285f62]"
              pendingLabel="创建中..."
            >
              创建备份
            </SubmitButton>
          </div>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">备份记录</h2>
        {records.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#b8c8c4] bg-white p-8 text-center">
            <h3 className="text-xl font-semibold">暂无备份记录</h3>
            <p className="mt-3 text-sm text-[#5d6972]">
              建议在导入大量资料或进行重要修改前先创建备份。
            </p>
          </div>
        ) : (
          records.map((record) => (
            <BackupRecordCard
              fileExists={existingFileNames.has(record.fileName)}
              key={record.id}
              record={record}
            />
          ))
        )}
      </section>

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">恢复功能说明</h2>
        <p className="mt-3 text-sm leading-6 text-[#5d6972]">
          当前版本不提供网页上传恢复。原因是恢复会覆盖当前 SQLite 数据库和上传文件，必须确保失败时不破坏现有系统。
          请先下载当前备份，并在停止应用后手动恢复。
        </p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm leading-6 text-[#5d6972]">
          <li>先在本页创建并下载当前状态备份。</li>
          <li>停止正在运行的 Next.js 应用。</li>
          <li>解压目标备份，检查 manifest.json。</li>
          <li>将 database 中的 SQLite 文件复制回 prisma 目录。</li>
          <li>将 storage/uploads 中的文件复制回项目 storage/uploads。</li>
          <li>重新启动应用并检查旅行列表、文件票据和备份记录。</li>
        </ol>
      </section>
    </section>
  );
}

function BackupRecordCard({
  fileExists,
  record,
}: {
  fileExists: boolean;
  record: {
    createdAt: Date;
    fileName: string;
    fileSize: number;
    id: string;
    notes: string | null;
    status: string;
  };
}) {
  const canDownload = record.status === "success" && fileExists;

  return (
    <article
      className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm"
      data-testid="backup-record"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-all text-lg font-semibold">{record.fileName}</h3>
            <span className={statusClassName(record.status)}>{statusLabel(record.status)}</span>
            {!fileExists && record.status === "success" ? (
              <span className="rounded-full bg-[#fff2ee] px-2.5 py-1 text-xs font-semibold text-[#9b2f1f]">
                文件缺失
              </span>
            ) : null}
          </div>
          <dl className="mt-3 grid gap-2 text-sm text-[#5d6972] sm:grid-cols-3">
            <Info label="创建时间" value={formatDisplayDateTime(record.createdAt)} />
            <Info label="文件大小" value={formatBackupFileSize(record.fileSize)} />
            <Info label="状态" value={statusLabel(record.status)} />
          </dl>
          {record.notes ? (
            <p className="mt-3 whitespace-pre-wrap rounded-md bg-[#fbfaf7] p-3 text-sm leading-6 text-[#34434c]">
              {record.notes}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {canDownload ? (
            <Link
              className="inline-flex justify-center rounded-md border border-[#2f6f73] px-3 py-2 text-sm font-semibold text-[#2f6f73] transition hover:bg-[#edf4f2]"
              href={`/api/backups/${record.id}/download`}
            >
              下载备份
            </Link>
          ) : (
            <span className="inline-flex justify-center rounded-md border border-[#cfd7d2] px-3 py-2 text-sm font-semibold text-[#7a858c]">
              无法下载
            </span>
          )}
          {record.status !== "deleted" ? (
            <BackupDeleteButton backupId={record.id} fileName={record.fileName} />
          ) : null}
        </div>
      </div>
    </article>
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

function PrivacyNotice() {
  return (
    <section className="rounded-lg border border-[#ead0a7] bg-[#fff8ec] p-5 text-sm leading-6 text-[#70430f]">
      <h2 className="text-base font-semibold">隐私提醒</h2>
      <ul className="mt-3 list-disc space-y-1 pl-5">
        <li>导出文件可能包含旅行行程、住宿地址、票据记录、预算等隐私信息。</li>
        <li>备份文件请勿上传到不可信网盘或公开分享。</li>
        <li>如包含敏感文件，请考虑加密保存。</li>
        <li>不要把备份文件发给 AI。</li>
      </ul>
    </section>
  );
}

function statusLabel(status: string): string {
  if (status === "success") {
    return "成功";
  }

  if (status === "failed") {
    return "失败";
  }

  if (status === "deleted") {
    return "已删除";
  }

  return status;
}

function statusClassName(status: string): string {
  if (status === "success") {
    return "rounded-full bg-[#edf4f2] px-2.5 py-1 text-xs font-semibold text-[#2f6f73]";
  }

  if (status === "deleted") {
    return "rounded-full bg-[#eceff3] px-2.5 py-1 text-xs font-semibold text-[#4d5964]";
  }

  return "rounded-full bg-[#fff2ee] px-2.5 py-1 text-xs font-semibold text-[#9b2f1f]";
}
