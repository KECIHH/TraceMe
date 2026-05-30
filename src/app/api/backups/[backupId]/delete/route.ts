import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit";
import { deleteBackupRecord } from "@/lib/backup/delete";
import { requireAdmin } from "@/lib/collaboration";

type BackupDeleteRouteProps = {
  params: Promise<{ backupId: string }>;
};

export async function POST(request: Request, { params }: BackupDeleteRouteProps) {
  const user = await requireAdmin();

  const { backupId } = await params;
  const result = await deleteBackupRecord(backupId);
  await writeAuditLog({
    action: "backup.deleted",
    entityId: backupId,
    entityType: "BackupRecord",
    metadata: { ok: result.ok },
    request,
    userId: user.id,
  });
  const redirectUrl = new URL("/settings/backups", request.url);
  const errorReason = result.ok ? null : result.reason;
  const errorMessage =
    errorReason === "delete_failed"
      ? "删除备份文件失败，请确认文件未被占用后重试。"
      : "备份记录不存在或已被删除。";

  redirectUrl.searchParams.set(
    result.ok ? "message" : "error",
    result.ok ? "备份文件已删除，记录已保留。" : errorMessage,
  );

  return NextResponse.json(
    { ok: result.ok, redirectUrl: `${redirectUrl.pathname}${redirectUrl.search}` },
    { status: result.ok ? 200 : errorReason === "delete_failed" ? 409 : 404 },
  );
}
