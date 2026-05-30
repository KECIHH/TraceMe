import { readFile, stat } from "node:fs/promises";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit";
import { canAccessDocument, getTripAccessForUser } from "@/lib/collaboration";
import { checkDocumentDownloadRateLimit } from "@/lib/document-download-rate-limit";
import { decryptDocumentBuffer } from "@/lib/document-encryption";
import { resolveUploadPath } from "@/lib/documents";
import { prisma } from "@/lib/prisma";

type DownloadRouteContext = {
  params: Promise<{ documentId: string; tripId: string }>;
};

export async function GET(_request: Request, { params }: DownloadRouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "请先登录后再下载文件。" }, { status: 401 });
  }

  const { documentId, tripId } = await params;
  const access = await getTripAccessForUser(tripId, user.id);

  if (!access?.canRead) {
    return NextResponse.json({ error: "文件不存在或无权访问。" }, { status: 404 });
  }

  const rateLimit = checkDocumentDownloadRateLimit(`${user.id}:${tripId}`);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "下载过于频繁，请稍后再试。" },
      {
        headers: {
          "Retry-After": String(
            Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
          ),
        },
        status: 429,
      },
    );
  }

  const document = await prisma.document.findFirst({
    where: { id: documentId, tripId },
  });

  if (!document) {
    return NextResponse.json({ error: "文件不存在或无权访问。" }, { status: 404 });
  }

  if (!canAccessDocument(access, document)) {
    return NextResponse.json({ error: "无权下载敏感文件。" }, { status: 403 });
  }

  let uploadPath: string;

  try {
    uploadPath = resolveUploadPath(document.filePath);
    await stat(uploadPath);
  } catch {
    return NextResponse.json({ error: "文件缺失，无法下载。" }, { status: 404 });
  }

  const storedBuffer = await readFile(uploadPath);
  let fileBuffer: Buffer;

  try {
    fileBuffer = document.isEncrypted
      ? decryptDocumentBuffer(storedBuffer, {
          encryptionAlgorithm: document.encryptionAlgorithm,
          encryptionAuthTag: document.encryptionAuthTag,
          encryptionIv: document.encryptionIv,
        })
      : storedBuffer;
  } catch {
    return NextResponse.json(
      { error: "文件解密失败，请检查服务端加密密钥配置。" },
      { status: 500 },
    );
  }
  const fileName = document.originalFileName || document.title || "download";

  await writeAuditLog({
    action: "document.downloaded",
    entityId: document.id,
    entityType: "Document",
    metadata: {
      encrypted: document.isEncrypted,
      fileSha256: document.fileSha256,
      sensitive: document.isSensitive,
      tripId,
    },
    request: _request,
    userId: user.id,
  });

  return new Response(new Uint8Array(fileBuffer), {
    headers: {
      "Content-Disposition": contentDisposition(fileName),
      "Content-Length": String(fileBuffer.byteLength),
      "Content-Type": document.mimeType || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function contentDisposition(fileName: string): string {
  const fallback = fileName.replace(/[^\w. -]/g, "_") || "download";
  const encoded = encodeURIComponent(fileName).replace(/['()]/g, escape);

  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
