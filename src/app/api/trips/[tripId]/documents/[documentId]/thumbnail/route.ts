import { readFile, stat } from "node:fs/promises";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { canAccessDocument, getTripAccessForUser } from "@/lib/collaboration";
import { decryptDocumentBuffer } from "@/lib/document-encryption";
import { resolveUploadPath } from "@/lib/documents";
import { prisma } from "@/lib/prisma";

type ThumbnailRouteContext = {
  params: Promise<{ documentId: string; tripId: string }>;
};

export async function GET(_request: Request, { params }: ThumbnailRouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "请先登录后再查看缩略图。" }, { status: 401 });
  }

  const { documentId, tripId } = await params;
  const access = await getTripAccessForUser(tripId, user.id);

  if (!access?.canRead) {
    return NextResponse.json({ error: "缩略图不存在。" }, { status: 404 });
  }

  const document = await prisma.document.findFirst({
    where: { id: documentId, tripId },
  });

  if (document && !canAccessDocument(access, document)) {
    return NextResponse.json({ error: "缩略图不存在。" }, { status: 404 });
  }

  if (!document?.thumbnailPath) {
    return NextResponse.json({ error: "缩略图不存在。" }, { status: 404 });
  }

  let thumbnailPath: string;

  try {
    thumbnailPath = resolveUploadPath(document.thumbnailPath);
    await stat(thumbnailPath);
  } catch {
    return NextResponse.json({ error: "缩略图文件缺失。" }, { status: 404 });
  }

  const encryptedThumbnail = await readFile(thumbnailPath);
  let thumbnail: Buffer;

  try {
    thumbnail = decryptDocumentBuffer(encryptedThumbnail, {
      encryptionAlgorithm: document.thumbnailEncryptionAlgorithm,
      encryptionAuthTag: document.thumbnailEncryptionAuthTag,
      encryptionIv: document.thumbnailEncryptionIv,
    });
  } catch {
    return NextResponse.json(
      { error: "缩略图解密失败，请检查服务端加密密钥配置。" },
      { status: 500 },
    );
  }

  return new Response(new Uint8Array(thumbnail), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Length": String(thumbnail.byteLength),
      "Content-Type": document.thumbnailMimeType || "image/jpeg",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
