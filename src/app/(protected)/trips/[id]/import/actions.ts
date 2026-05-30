"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { requireTripAccess } from "@/lib/collaboration";
import {
  buildImportPreview,
  type ChecklistImportData,
  type ConflictStrategy,
  type DestinationImportData,
  type ExistingImportData,
  type ExpenseImportData,
  type ImportDecision,
  type ImportPreviewItem,
  isConflictStrategy,
  isImportPreview,
  isImportType,
  makeImportCopyLabel,
  type ManualConflictAction,
  type NoteImportData,
  refreshImportPreviewConflicts,
  resolveImportDecision,
  type RoutePlanImportData,
  validateImportFileBeforeRead,
  type PlaceImportData,
} from "@/lib/imports";
import { prisma } from "@/lib/prisma";

type ImportResult = {
  created: number;
  overwritten: number;
  skipped: number;
  failed: number;
  errors: string[];
};

export async function createImportJobAction(tripId: string, formData: FormData) {
  const user = await requireUser();
  await requireTripAccess(tripId, "edit");
  await requireTrip(tripId);
  const redirectPath = importPath(tripId);
  const importTypeValue = String(formData.get("importType") ?? "");
  const file = formData.get("file");

  if (!isImportType(importTypeValue)) {
    redirectWithMessage(redirectPath, "error", "请选择有效的导入类型。");
  }

  if (!(file instanceof File) || file.size === 0) {
    redirectWithMessage(redirectPath, "error", "请先上传一个导入文件。");
  }

  const fileMetaErrors = validateImportFileBeforeRead({
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || null,
    type: importTypeValue,
  });

  if (fileMetaErrors.length > 0) {
    redirectWithMessage(redirectPath, "error", fileMetaErrors.join("；"));
  }

  const existing = await loadExistingImportData(tripId);
  const content = await file.text();
  const { preview, validation } = buildImportPreview({
    content,
    existing,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || null,
    type: importTypeValue,
  });

  const job = await prisma.importJob.create({
    data: {
      tripId,
      userId: user.id,
      type: importTypeValue,
      fileName: preview.fileName,
      fileSize: preview.fileSize,
      mimeType: file.type || null,
      status: validation.ok ? "parsed" : "failed",
      previewJson: preview as unknown as Prisma.InputJsonValue,
      validationJson: validation as unknown as Prisma.InputJsonValue,
      errorMessage: validation.ok ? null : validation.errors.join("；"),
    },
    select: { id: true },
  });

  revalidateImport(tripId);
  redirectWithMessage(
    `${redirectPath}?jobId=${job.id}`,
    validation.ok ? "message" : "error",
    validation.ok
      ? "文件已解析完成，请预览并确认后再写入数据库。"
      : "导入解析失败，请查看错误报告。",
  );
}

export async function confirmImportJobAction(
  tripId: string,
  importJobId: string,
  formData: FormData,
) {
  await requireTripAccess(tripId, "edit");
  await requireTrip(tripId);
  const redirectPath = importPath(tripId);
  const strategyValue = String(formData.get("conflictStrategy") ?? "skip");

  if (!isConflictStrategy(strategyValue)) {
    redirectWithMessage(
      `${redirectPath}?jobId=${importJobId}`,
      "error",
      "请选择有效的冲突处理策略。",
    );
  }

  const job = await prisma.importJob.findFirst({
    where: { id: importJobId, tripId },
  });

  if (!job || !isImportPreview(job.previewJson)) {
    redirectWithMessage(redirectPath, "error", "导入作业不存在或预览数据已损坏。");
  }

  const preview = job.previewJson;

  if (preview.errors.length > 0) {
    redirectWithMessage(
      `${redirectPath}?jobId=${importJobId}`,
      "error",
      "当前导入存在解析错误，不能写入数据库。",
    );
  }

  const manualActions = readManualActions(formData);

  let result: ImportResult;

  try {
    result = await prisma.$transaction(async (tx) => {
      const currentExisting = await loadExistingImportData(tripId, tx);
      const currentPreview = refreshImportPreviewConflicts(
        preview,
        currentExisting,
      );
      const importResult: ImportResult = {
        created: 0,
        overwritten: 0,
        skipped: 0,
        failed: 0,
        errors: [],
      };

      for (const item of currentPreview.items) {
        const decision = resolveImportDecision(
          item,
          strategyValue,
          manualActions.get(String(item.index)),
        );

        if (decision === "skip" || item.status === "invalid") {
          importResult.skipped += 1;
          continue;
        }

        await applyImportItem(tx, tripId, item, strategyValue, decision);

        if (decision === "overwrite") {
          importResult.overwritten += 1;
        } else {
          importResult.created += 1;
        }
      }

      await tx.importJob.update({
        where: { id: importJobId },
        data: {
          status: "completed",
          conflictStrategy: strategyValue,
          previewJson: currentPreview as unknown as Prisma.InputJsonValue,
          resultJson: importResult as unknown as Prisma.InputJsonValue,
          errorMessage: null,
        },
      });

      return importResult;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "导入写入失败。";
    const result: ImportResult = {
      created: 0,
      overwritten: 0,
      skipped: 0,
      failed: preview.items.length,
      errors: [message],
    };

    await prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: "failed",
        conflictStrategy: strategyValue,
        resultJson: result as unknown as Prisma.InputJsonValue,
        errorMessage: message,
      },
    });

    revalidateImport(tripId);
    redirectWithMessage(
      `${redirectPath}?jobId=${importJobId}`,
      "error",
      "导入失败，现有数据没有被破坏。请查看错误报告。",
    );
  }

  revalidateTripAfterImport(tripId);
  redirectWithMessage(
    `${redirectPath}?jobId=${importJobId}`,
    "message",
    `导入完成：新增 ${result.created} 条，覆盖 ${result.overwritten} 条，跳过 ${result.skipped} 条。`,
  );
}

async function requireTrip(tripId: string) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });

  if (!trip) {
    notFound();
  }

  return trip;
}

async function loadExistingImportData(
  tripId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<ExistingImportData> {
  const [
    destinations,
    places,
    expenses,
    checklistItems,
    notes,
    routePlans,
  ] = await Promise.all([
    client.destination.findMany({
      select: { country: true, id: true, name: true, region: true },
      where: { tripId },
    }),
    client.place.findMany({
      select: { address: true, id: true, name: true },
      where: { tripId },
    }),
    client.expense.findMany({
      select: {
        amount: true,
        category: true,
        currency: true,
        id: true,
        paidAt: true,
        title: true,
      },
      where: { tripId },
    }),
    client.checklistItem.findMany({
      select: { category: true, id: true, title: true },
      where: { tripId },
    }),
    client.note.findMany({
      select: { id: true, sourceUrl: true, title: true },
      where: { tripId },
    }),
    client.routePlan.findMany({
      select: { fromName: true, id: true, title: true, toName: true },
      where: { tripId },
    }),
  ]);

  return {
    checklistItems,
    destinations,
    expenses,
    notes,
    places,
    routePlans,
  };
}

function readManualActions(formData: FormData): Map<string, ManualConflictAction> {
  const actions = new Map<string, ManualConflictAction>();

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("manualAction-")) {
      continue;
    }

    const action = String(value);

    if (action === "skip" || action === "overwrite" || action === "duplicate") {
      actions.set(key.replace("manualAction-", ""), action);
    }
  }

  return actions;
}

async function applyImportItem(
  tx: Prisma.TransactionClient,
  tripId: string,
  item: ImportPreviewItem,
  strategy: ConflictStrategy,
  decision: ImportDecision,
) {
  switch (item.entity) {
    case "destination":
      return applyDestination(tx, tripId, item, strategy, decision);
    case "place":
      return applyPlace(tx, tripId, item, strategy, decision);
    case "expense":
      return applyExpense(tx, tripId, item, strategy, decision);
    case "checklistItem":
      return applyChecklistItem(tx, tripId, item, strategy, decision);
    case "note":
      return applyNote(tx, tripId, item, strategy, decision);
    case "routePlan":
      return applyRoutePlan(tx, tripId, item, strategy, decision);
  }
}

async function applyDestination(
  tx: Prisma.TransactionClient,
  tripId: string,
  item: ImportPreviewItem,
  strategy: ConflictStrategy,
  decision: ImportDecision,
) {
  const data = item.data as DestinationImportData;
  const payload = {
    tripId,
    name: copyNameIfNeeded(data.name, item, strategy, decision),
    country: data.country,
    region: data.region,
    timezone: data.timezone,
    arrivalDate: parseDate(data.arrivalDate),
    departureDate: parseDate(data.departureDate),
    latitude: data.latitude,
    longitude: data.longitude,
    notes: data.notes,
  };

  if (decision === "overwrite" && item.conflict?.existingId) {
    await tx.destination.update({
      where: { id: item.conflict.existingId, tripId },
      data: payload,
    });
    return;
  }

  await tx.destination.create({ data: payload });
}

async function applyPlace(
  tx: Prisma.TransactionClient,
  tripId: string,
  item: ImportPreviewItem,
  strategy: ConflictStrategy,
  decision: ImportDecision,
) {
  const data = item.data as PlaceImportData;
  const payload = {
    tripId,
    name: copyNameIfNeeded(data.name, item, strategy, decision),
    type: data.type,
    address: data.address,
    latitude: data.latitude,
    longitude: data.longitude,
    phone: data.phone,
    website: data.website,
    sourceUrl: data.sourceUrl,
    sourceName: data.sourceName,
    estimatedCost: data.estimatedCost,
    estimatedDurationMin: data.estimatedDurationMin,
    ratingPersonal: data.ratingPersonal,
    priority: data.priority,
    tags: data.tags,
    notes: data.notes,
  };

  if (decision === "overwrite" && item.conflict?.existingId) {
    await tx.place.update({
      where: { id: item.conflict.existingId, tripId },
      data: payload,
    });
    return;
  }

  await tx.place.create({ data: payload });
}

async function applyExpense(
  tx: Prisma.TransactionClient,
  tripId: string,
  item: ImportPreviewItem,
  strategy: ConflictStrategy,
  decision: ImportDecision,
) {
  const data = item.data as ExpenseImportData;
  const relatedPlaceId = data.relatedPlaceName
    ? (
        await tx.place.findFirst({
          select: { id: true },
          where: { name: data.relatedPlaceName, tripId },
        })
      )?.id ?? null
    : null;
  const payload = {
    tripId,
    title: copyNameIfNeeded(data.title, item, strategy, decision),
    category: data.category,
    amount: data.amount,
    currency: data.currency,
    exchangeRate: data.exchangeRate,
    paidAt: parseDate(data.paidAt),
    payer: data.payer,
    splitWith: data.splitWith,
    relatedPlaceId,
    notes: data.notes,
  };

  if (decision === "overwrite" && item.conflict?.existingId) {
    await tx.expense.update({
      where: { id: item.conflict.existingId, tripId },
      data: payload,
    });
    return;
  }

  await tx.expense.create({ data: payload });
}

async function applyChecklistItem(
  tx: Prisma.TransactionClient,
  tripId: string,
  item: ImportPreviewItem,
  strategy: ConflictStrategy,
  decision: ImportDecision,
) {
  const data = item.data as ChecklistImportData;
  const payload = {
    tripId,
    category: data.category,
    title: copyNameIfNeeded(data.title, item, strategy, decision),
    quantity: data.quantity,
    importance: data.importance,
    dueDate: parseDate(data.dueDate),
    status: data.status,
    notes: data.notes,
  };

  if (decision === "overwrite" && item.conflict?.existingId) {
    await tx.checklistItem.update({
      where: { id: item.conflict.existingId, tripId },
      data: payload,
    });
    return;
  }

  await tx.checklistItem.create({ data: payload });
}

async function applyNote(
  tx: Prisma.TransactionClient,
  tripId: string,
  item: ImportPreviewItem,
  strategy: ConflictStrategy,
  decision: ImportDecision,
) {
  const data = item.data as NoteImportData;
  const payload = {
    tripId,
    title: copyNameIfNeeded(data.title, item, strategy, decision),
    content: data.content,
    sourceUrl: data.sourceUrl,
    tags: data.tags,
  };

  if (decision === "overwrite" && item.conflict?.existingId) {
    await tx.note.update({
      where: { id: item.conflict.existingId, tripId },
      data: payload,
    });
    return;
  }

  await tx.note.create({ data: payload });
}

async function applyRoutePlan(
  tx: Prisma.TransactionClient,
  tripId: string,
  item: ImportPreviewItem,
  strategy: ConflictStrategy,
  decision: ImportDecision,
) {
  const data = item.data as RoutePlanImportData;
  const payload = {
    tripId,
    title: copyNameIfNeeded(data.title, item, strategy, decision),
    fromName: data.fromName,
    toName: data.toName,
    notes: data.notes,
    resultJson: data.resultJson as unknown as Prisma.InputJsonValue,
  };

  if (decision === "overwrite" && item.conflict?.existingId) {
    await tx.routePlan.update({
      where: { id: item.conflict.existingId, tripId },
      data: payload,
    });
    return;
  }

  await tx.routePlan.create({ data: payload });
}

function copyNameIfNeeded(
  value: string,
  item: ImportPreviewItem,
  strategy: ConflictStrategy,
  decision: ImportDecision,
): string {
  if (
    decision === "create" &&
    item.conflict &&
    (strategy === "duplicate" || strategy === "manual")
  ) {
    return makeImportCopyLabel(value);
  }

  return value;
}

function parseDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function importPath(tripId: string) {
  return `/trips/${tripId}/import`;
}

function redirectWithMessage(
  path: string,
  key: "error" | "message",
  message: string,
): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}${key}=${encodeURIComponent(message)}`);
}

function revalidateImport(tripId: string) {
  revalidatePath(importPath(tripId));
}

function revalidateTripAfterImport(tripId: string) {
  revalidateImport(tripId);
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/places`);
  revalidatePath(`/trips/${tripId}/budget`);
  revalidatePath(`/trips/${tripId}/checklist`);
  revalidatePath(`/trips/${tripId}/notes`);
  revalidatePath(`/trips/${tripId}/routes`);
  revalidatePath(`/trips/${tripId}/destinations`);
}
