"use client";

import { useState } from "react";

export function BackupDeleteButton({
  backupId,
  fileName,
}: {
  backupId: string;
  fileName: string;
}) {
  const [isPending, setIsPending] = useState(false);

  return (
    <button
      className="rounded-md border border-[#d46a55] px-3 py-2 text-sm font-semibold text-[#9b2f1f] transition hover:bg-[#fff2ee] disabled:cursor-not-allowed disabled:opacity-60"
      disabled={isPending}
      onClick={async () => {
        if (!window.confirm(`确定删除备份文件「${fileName}」吗？删除后只保留记录。`)) {
          return;
        }

        setIsPending(true);
        const response = await fetch(`/api/backups/${backupId}/delete`, {
          credentials: "same-origin",
          method: "POST",
        });
        const payload = (await response.json().catch(() => null)) as {
          redirectUrl?: string;
        } | null;

        window.location.href =
          payload?.redirectUrl ??
          (response.status === 401
            ? "/login"
            : "/settings/backups?message=%E5%A4%87%E4%BB%BD%E6%96%87%E4%BB%B6%E5%B7%B2%E5%88%A0%E9%99%A4");
      }}
      type="button"
    >
      {isPending ? "处理中..." : "删除备份"}
    </button>
  );
}
