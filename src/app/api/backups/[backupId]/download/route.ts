import { readFile, stat } from "node:fs/promises";

import { NextResponse } from "next/server";

import { resolveBackupPath } from "@/lib/backup/paths";
import { requireAdmin } from "@/lib/collaboration";
import { prisma } from "@/lib/prisma";

type BackupDownloadRouteProps = {
  params: Promise<{ backupId: string }>;
};

export async function GET(_request: Request, { params }: BackupDownloadRouteProps) {
  await requireAdmin();
  const { backupId } = await params;
  const record = await prisma.backupRecord.findUnique({
    where: { id: backupId },
  });

  if (!record || record.status !== "success") {
    return NextResponse.json({ error: "Backup not found." }, { status: 404 });
  }

  const backupPath = resolveBackupPath(record.fileName);
  const fileStats = await stat(/*turbopackIgnore: true*/ backupPath).catch(
    () => null,
  );

  if (!fileStats?.isFile()) {
    return NextResponse.json({ error: "Backup file missing." }, { status: 404 });
  }

  return new Response(await readFile(/*turbopackIgnore: true*/ backupPath), {
    headers: {
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(record.fileName)}`,
      "Content-Length": String(fileStats.size),
      "Content-Type": "application/zip",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
