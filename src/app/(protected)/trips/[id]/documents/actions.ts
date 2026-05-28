"use server";

import { mkdir, unlink, writeFile } from "node:fs/promises";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import {
  generateSafeStoredFileName,
  isDocumentType,
  normalizeOriginalFileName,
  resolveUploadPath,
  validateDocumentFile,
  validateDocumentFileContent,
  validateTripDocumentStorageUsage,
  UPLOAD_STORAGE_DIR,
} from "@/lib/documents";
import { prisma } from "@/lib/prisma";
import { emptyToNull, parseDateInput } from "@/lib/trip-management";

export async function uploadDocumentAction(tripId: string, formData: FormData) {
  await requireTrip(tripId);
  const redirectPath = documentsPath(tripId);
  const upload = formData.get("file");

  if (!(upload instanceof File)) {
    redirectWithMessage(redirectPath, "error", "请选择要上传的文件。");
  }

  const title = requiredText(formData, "title");

  if (!title) {
    redirectWithMessage(redirectPath, "error", "请填写文件标题。");
  }

  const originalFileName = normalizeOriginalFileName(upload.name);
  const validation = validateDocumentFile({
    fileName: originalFileName,
    mimeType: upload.type,
    size: upload.size,
  });

  if (!validation.ok) {
    redirectWithMessage(redirectPath, "error", validation.error);
  }

  const uploadBuffer = Buffer.from(await upload.arrayBuffer());
  const contentValidationError = validateDocumentFileContent(
    uploadBuffer,
    validation.extension,
  );

  if (contentValidationError) {
    redirectWithMessage(redirectPath, "error", contentValidationError);
  }

  const storedSize = await prisma.document.aggregate({
    _sum: { fileSize: true },
    where: { tripId },
  });
  const storageValidationError = validateTripDocumentStorageUsage(
    storedSize._sum.fileSize ?? 0,
    upload.size,
  );

  if (storageValidationError) {
    redirectWithMessage(redirectPath, "error", storageValidationError);
  }

  const storedFileName = generateSafeStoredFileName(validation.extension);
  const uploadPath = resolveUploadPath(storedFileName);

  await mkdir(UPLOAD_STORAGE_DIR, { recursive: true });
  await writeFile(uploadPath, uploadBuffer);

  try {
    await prisma.document.create({
      data: {
        tripId,
        title,
        type: parseDocumentType(formData),
        filePath: storedFileName,
        originalFileName,
        mimeType: upload.type,
        fileSize: upload.size,
        isSensitive: formData.get("isSensitive") === "on",
        relatedDate: parseDateInput(formValue(formData, "relatedDate")),
        notes: optionalText(formData, "notes"),
      },
    });
  } catch (error) {
    await unlink(uploadPath).catch(() => {});
    throw error;
  }

  revalidateDocuments(tripId);
  redirectWithMessage(redirectPath, "message", "文件已上传。");
}

export async function updateDocumentAction(
  tripId: string,
  documentId: string,
  formData: FormData,
) {
  await requireTrip(tripId);
  const redirectPath = documentsPath(tripId);

  if (!requiredText(formData, "title")) {
    redirectWithMessage(redirectPath, "error", "请填写文件标题。");
  }

  await runMutationOrRedirect(
    () =>
      prisma.document.update({
        where: { id: documentId, tripId },
        data: {
          title: requiredText(formData, "title"),
          type: parseDocumentType(formData),
          isSensitive: formData.get("isSensitive") === "on",
          relatedDate: parseDateInput(formValue(formData, "relatedDate")),
          notes: optionalText(formData, "notes"),
        },
      }),
    redirectPath,
    "文件不存在或已被删除。",
  );

  revalidateDocuments(tripId);
  redirectWithMessage(redirectPath, "message", "文件信息已更新。");
}

export async function deleteDocumentAction(tripId: string, documentId: string) {
  await requireTrip(tripId);
  const redirectPath = documentsPath(tripId);
  const document = await prisma.document.findFirst({
    where: { id: documentId, tripId },
  });

  if (!document) {
    redirectWithMessage(redirectPath, "error", "文件不存在或已被删除。");
  }

  const uploadPath = safeResolveDocumentPath(document.filePath);

  await prisma.document.delete({ where: { id: document.id } });

  if (uploadPath) {
    try {
      await unlink(uploadPath);
    } catch (error) {
      if (!isFileMissingError(error)) {
        revalidateDocuments(tripId);
        redirectWithMessage(
          redirectPath,
          "error",
          "数据库记录已删除，但磁盘文件删除失败，请手动检查 storage/uploads。",
        );
      }
    }
  }

  revalidateDocuments(tripId);
  redirectWithMessage(redirectPath, "message", "文件已删除。");
}

async function requireTrip(tripId: string) {
  await requireUser();
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });

  if (!trip) {
    notFound();
  }

  return trip;
}

function parseDocumentType(formData: FormData) {
  const type = formValue(formData, "type");

  return isDocumentType(type) ? type : "OTHER";
}

function requiredText(formData: FormData, key: string): string {
  return formValue(formData, key).trim();
}

function optionalText(formData: FormData, key: string): string | null {
  return emptyToNull(formValue(formData, key));
}

function formValue(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

function documentsPath(tripId: string): string {
  return `/trips/${tripId}/documents`;
}

function redirectWithMessage(
  path: string,
  key: "error" | "message",
  message: string,
): never {
  redirect(`${path}?${key}=${encodeURIComponent(message)}`);
}

async function runMutationOrRedirect<T>(
  mutation: () => Promise<T>,
  redirectPath: string,
  message: string,
): Promise<T> {
  try {
    return await mutation();
  } catch (error) {
    if (isPrismaNotFoundError(error)) {
      redirectWithMessage(redirectPath, "error", message);
    }

    throw error;
  }
}

function isPrismaNotFoundError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  );
}

function isFileMissingError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function safeResolveDocumentPath(filePath: string): string | null {
  try {
    return resolveUploadPath(filePath);
  } catch {
    return null;
  }
}

function revalidateDocuments(tripId: string) {
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(documentsPath(tripId));
}
