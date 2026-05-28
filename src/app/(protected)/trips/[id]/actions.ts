"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  BASIC_CHECKLIST_TEMPLATE,
  CHECKLIST_CATEGORIES,
  emptyToNull,
  isChecklistStatus,
  isPlaceType,
  isPriority,
  isValidLatitude,
  isValidLongitude,
  isValidOptionalNonNegativeInteger,
  isValidOptionalNonNegativeNumber,
  isValidOptionalRating,
  isValidOptionalHttpUrl,
  parseDateInput,
  parseOptionalCoordinate,
  splitTags,
} from "@/lib/trip-management";

type TripModule = "destinations" | "places" | "notes" | "checklist";

export async function createDestinationAction(tripId: string, formData: FormData) {
  await requireTrip(tripId);
  const redirectPath = modulePath(tripId, "destinations");
  const validationError = validateCoordinates(formData);

  if (validationError) {
    redirectWithMessage(redirectPath, "error", validationError);
  }

  if (!requiredText(formData, "name")) {
    redirectWithMessage(redirectPath, "error", "请填写目的地名称。");
  }

  await prisma.destination.create({
    data: {
      tripId,
      name: requiredText(formData, "name"),
      country: optionalText(formData, "country"),
      region: optionalText(formData, "region"),
      timezone: optionalText(formData, "timezone"),
      arrivalDate: parseDateInput(formValue(formData, "arrivalDate")),
      departureDate: parseDateInput(formValue(formData, "departureDate")),
      latitude: parseOptionalCoordinate(formValue(formData, "latitude")),
      longitude: parseOptionalCoordinate(formValue(formData, "longitude")),
      notes: optionalText(formData, "notes"),
    },
  });

  revalidateTrip(tripId);
  redirectWithMessage(redirectPath, "message", "目的地已新增。");
}

export async function updateDestinationAction(
  tripId: string,
  destinationId: string,
  formData: FormData,
) {
  await requireTrip(tripId);
  const redirectPath = modulePath(tripId, "destinations");
  const validationError = validateCoordinates(formData);

  if (validationError) {
    redirectWithMessage(redirectPath, "error", validationError);
  }

  if (!requiredText(formData, "name")) {
    redirectWithMessage(redirectPath, "error", "请填写目的地名称。");
  }

  await runMutationOrRedirect(
    () =>
      prisma.destination.update({
        where: { id: destinationId, tripId },
        data: {
          name: requiredText(formData, "name"),
          country: optionalText(formData, "country"),
          region: optionalText(formData, "region"),
          timezone: optionalText(formData, "timezone"),
          arrivalDate: parseDateInput(formValue(formData, "arrivalDate")),
          departureDate: parseDateInput(formValue(formData, "departureDate")),
          latitude: parseOptionalCoordinate(formValue(formData, "latitude")),
          longitude: parseOptionalCoordinate(formValue(formData, "longitude")),
          notes: optionalText(formData, "notes"),
        },
      }),
    redirectPath,
    "目的地不存在或已被删除。",
  );

  revalidateTrip(tripId);
  redirectWithMessage(redirectPath, "message", "目的地已更新。");
}

export async function deleteDestinationAction(
  tripId: string,
  destinationId: string,
) {
  await requireTrip(tripId);
  const redirectPath = modulePath(tripId, "destinations");
  const linkedPlaces = await prisma.place.count({ where: { destinationId } });

  if (linkedPlaces > 0) {
    redirectWithMessage(
      redirectPath,
      "error",
      `该目的地已关联 ${linkedPlaces} 个地点，请先调整地点关联后再删除。`,
    );
  }

  await runMutationOrRedirect(
    () => prisma.destination.delete({ where: { id: destinationId, tripId } }),
    redirectPath,
    "目的地不存在或已被删除。",
  );
  revalidateTrip(tripId);
  redirectWithMessage(redirectPath, "message", "目的地已删除。");
}

export async function createPlaceAction(tripId: string, formData: FormData) {
  await requireTrip(tripId);
  const redirectPath = modulePath(tripId, "places");
  const validationError = validatePlaceForm(formData);

  if (validationError) {
    redirectWithMessage(redirectPath, "error", validationError);
  }

  const destinationId = await resolveDestinationIdForTrip(
    tripId,
    formData,
    redirectPath,
  );

  await prisma.place.create({
    data: buildPlaceData(tripId, formData, destinationId),
  });

  revalidateTrip(tripId);
  redirectWithMessage(redirectPath, "message", "地点已新增。");
}

export async function updatePlaceAction(
  tripId: string,
  placeId: string,
  formData: FormData,
) {
  await requireTrip(tripId);
  const redirectPath = modulePath(tripId, "places");
  const validationError = validatePlaceForm(formData);

  if (validationError) {
    redirectWithMessage(redirectPath, "error", validationError);
  }

  const destinationId = await resolveDestinationIdForTrip(
    tripId,
    formData,
    redirectPath,
  );

  await runMutationOrRedirect(
    () =>
      prisma.place.update({
        where: { id: placeId, tripId },
        data: buildPlaceData(tripId, formData, destinationId),
      }),
    redirectPath,
    "地点不存在或已被删除。",
  );

  revalidateTrip(tripId);
  redirectWithMessage(redirectPath, "message", "地点已更新。");
}

export async function deletePlaceAction(tripId: string, placeId: string) {
  await requireTrip(tripId);
  const redirectPath = modulePath(tripId, "places");
  const itineraryRefs = await prisma.itineraryItem.count({ where: { placeId } });

  if (itineraryRefs > 0) {
    redirectWithMessage(
      redirectPath,
      "error",
      `该地点已被 ${itineraryRefs} 个行程项引用，不能直接删除。`,
    );
  }

  await runMutationOrRedirect(
    () => prisma.place.delete({ where: { id: placeId, tripId } }),
    redirectPath,
    "地点不存在或已被删除。",
  );
  revalidateTrip(tripId);
  redirectWithMessage(redirectPath, "message", "地点已删除。");
}

export async function createNoteAction(tripId: string, formData: FormData) {
  await requireTrip(tripId);
  const redirectPath = modulePath(tripId, "notes");

  if (!isValidOptionalHttpUrl(formValue(formData, "sourceUrl"))) {
    redirectWithMessage(redirectPath, "error", "来源链接必须是有效的 http 或 https 地址。");
  }

  if (!requiredText(formData, "title") || !requiredText(formData, "content")) {
    redirectWithMessage(redirectPath, "error", "请填写笔记标题和内容。");
  }

  await prisma.note.create({
    data: {
      tripId,
      title: requiredText(formData, "title"),
      content: requiredText(formData, "content"),
      sourceUrl: optionalText(formData, "sourceUrl"),
      tags: splitTags(formValue(formData, "tags")),
    },
  });

  revalidateTrip(tripId);
  redirectWithMessage(redirectPath, "message", "笔记已新增。");
}

export async function updateNoteAction(
  tripId: string,
  noteId: string,
  formData: FormData,
) {
  await requireTrip(tripId);
  const redirectPath = modulePath(tripId, "notes");

  if (!isValidOptionalHttpUrl(formValue(formData, "sourceUrl"))) {
    redirectWithMessage(redirectPath, "error", "来源链接必须是有效的 http 或 https 地址。");
  }

  if (!requiredText(formData, "title") || !requiredText(formData, "content")) {
    redirectWithMessage(redirectPath, "error", "请填写笔记标题和内容。");
  }

  await runMutationOrRedirect(
    () =>
      prisma.note.update({
        where: { id: noteId, tripId },
        data: {
          title: requiredText(formData, "title"),
          content: requiredText(formData, "content"),
          sourceUrl: optionalText(formData, "sourceUrl"),
          tags: splitTags(formValue(formData, "tags")),
        },
      }),
    redirectPath,
    "笔记不存在或已被删除。",
  );

  revalidateTrip(tripId);
  redirectWithMessage(redirectPath, "message", "笔记已更新。");
}

export async function deleteNoteAction(tripId: string, noteId: string) {
  await requireTrip(tripId);
  const redirectPath = modulePath(tripId, "notes");

  await runMutationOrRedirect(
    () => prisma.note.delete({ where: { id: noteId, tripId } }),
    redirectPath,
    "笔记不存在或已被删除。",
  );
  revalidateTrip(tripId);
  redirectWithMessage(redirectPath, "message", "笔记已删除。");
}

export async function createChecklistItemAction(
  tripId: string,
  formData: FormData,
) {
  await requireTrip(tripId);
  const redirectPath = modulePath(tripId, "checklist");

  if (!requiredText(formData, "title")) {
    redirectWithMessage(redirectPath, "error", "请填写清单项名称。");
  }

  await prisma.checklistItem.create({
    data: buildChecklistItemData(tripId, formData),
  });

  revalidateTrip(tripId);
  redirectWithMessage(redirectPath, "message", "清单项已新增。");
}

export async function updateChecklistItemAction(
  tripId: string,
  itemId: string,
  formData: FormData,
) {
  await requireTrip(tripId);
  const redirectPath = modulePath(tripId, "checklist");

  if (!requiredText(formData, "title")) {
    redirectWithMessage(redirectPath, "error", "请填写清单项名称。");
  }

  await runMutationOrRedirect(
    () =>
      prisma.checklistItem.update({
        where: { id: itemId, tripId },
        data: buildChecklistItemData(tripId, formData),
      }),
    redirectPath,
    "清单项不存在或已被删除。",
  );

  revalidateTrip(tripId);
  redirectWithMessage(redirectPath, "message", "清单项已更新。");
}

export async function updateChecklistStatusAction(
  tripId: string,
  itemId: string,
  status: string,
) {
  await requireTrip(tripId);
  const redirectPath = modulePath(tripId, "checklist");

  if (!isChecklistStatus(status)) {
    redirectWithMessage(redirectPath, "error", "清单状态无效。");
  }

  await runMutationOrRedirect(
    () =>
      prisma.checklistItem.update({
        where: { id: itemId, tripId },
        data: { status },
      }),
    redirectPath,
    "清单项不存在或已被删除。",
  );

  revalidateTrip(tripId);
  redirect(redirectPath);
}

export async function deleteChecklistItemAction(tripId: string, itemId: string) {
  await requireTrip(tripId);
  const redirectPath = modulePath(tripId, "checklist");

  await runMutationOrRedirect(
    () => prisma.checklistItem.delete({ where: { id: itemId, tripId } }),
    redirectPath,
    "清单项不存在或已被删除。",
  );
  revalidateTrip(tripId);
  redirectWithMessage(redirectPath, "message", "清单项已删除。");
}

export async function generateChecklistTemplateAction(tripId: string) {
  await requireTrip(tripId);
  const redirectPath = modulePath(tripId, "checklist");
  const existingItems = await prisma.checklistItem.findMany({
    select: { category: true, title: true },
    where: { tripId },
  });
  const existingKeys = new Set(
    existingItems.map((item) => `${item.category}:${item.title}`),
  );
  const missingItems = BASIC_CHECKLIST_TEMPLATE.filter(
    (item) => !existingKeys.has(`${item.category}:${item.title}`),
  );

  if (missingItems.length > 0) {
    await prisma.checklistItem.createMany({
      data: missingItems.map((item) => ({
        tripId,
        category: item.category,
        title: item.title,
        notes: item.notes ?? null,
      })),
    });
  }

  revalidateTrip(tripId);
  redirectWithMessage(
    redirectPath,
    "message",
    missingItems.length > 0
      ? `已生成 ${missingItems.length} 个基础清单项。`
      : "基础模板清单已存在，无需重复生成。",
  );
}

async function requireTrip(tripId: string) {
  await requireUser();
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });

  if (!trip) {
    notFound();
  }

  return trip;
}

function buildPlaceData(
  tripId: string,
  formData: FormData,
  destinationId: string | null,
) {
  const type = formValue(formData, "type");
  const priority = formValue(formData, "priority");

  return {
    tripId,
    destinationId,
    name: requiredText(formData, "name"),
    type: isPlaceType(type) ? type : "OTHER",
    address: optionalText(formData, "address"),
    latitude: parseOptionalCoordinate(formValue(formData, "latitude")),
    longitude: parseOptionalCoordinate(formValue(formData, "longitude")),
    phone: optionalText(formData, "phone"),
    website: optionalText(formData, "website"),
    sourceUrl: optionalText(formData, "sourceUrl"),
    sourceName: optionalText(formData, "sourceName"),
    lastCheckedAt: parseDateInput(formValue(formData, "lastCheckedAt")),
    openingHours: optionalText(formData, "openingHours") ?? Prisma.JsonNull,
    estimatedCost: optionalText(formData, "estimatedCost"),
    estimatedDurationMin: optionalInteger(formData, "estimatedDurationMin"),
    ratingPersonal: optionalInteger(formData, "ratingPersonal"),
    priority: isPriority(priority) ? priority : "MEDIUM",
    tags: splitTags(formValue(formData, "tags")),
    notes: optionalText(formData, "notes"),
  };
}

function buildChecklistItemData(tripId: string, formData: FormData) {
  const category = formValue(formData, "category");
  const importance = formValue(formData, "importance");
  const status = formValue(formData, "status");

  return {
    tripId,
    category: CHECKLIST_CATEGORIES.includes(category) ? category : "其他",
    title: requiredText(formData, "title"),
    quantity: Math.max(optionalInteger(formData, "quantity") ?? 1, 1),
    importance: isPriority(importance) ? importance : "MEDIUM",
    dueDate: parseDateInput(formValue(formData, "dueDate")),
    status: isChecklistStatus(status) ? status : "TODO",
    notes: optionalText(formData, "notes"),
  };
}

function validatePlaceForm(formData: FormData): string | null {
  if (!requiredText(formData, "name")) {
    return "请填写地点名称。";
  }

  if (!isValidOptionalHttpUrl(formValue(formData, "website"))) {
    return "官网必须是有效的 http 或 https 地址。";
  }

  if (!isValidOptionalHttpUrl(formValue(formData, "sourceUrl"))) {
    return "来源链接必须是有效的 http 或 https 地址。";
  }

  if (!isValidOptionalNonNegativeNumber(formValue(formData, "estimatedCost"))) {
    return "预估花费不能小于 0。";
  }

  if (
    !isValidOptionalNonNegativeInteger(
      formValue(formData, "estimatedDurationMin"),
    )
  ) {
    return "建议游玩时长必须是大于等于 0 的整数。";
  }

  if (!isValidOptionalRating(formValue(formData, "ratingPersonal"))) {
    return "个人评分必须是 1 到 5 的整数。";
  }

  return validateCoordinates(formData);
}

async function resolveDestinationIdForTrip(
  tripId: string,
  formData: FormData,
  redirectPath: string,
): Promise<string | null> {
  const destinationId = optionalText(formData, "destinationId");

  if (!destinationId) {
    return null;
  }

  const destination = await prisma.destination.findFirst({
    select: { id: true },
    where: { id: destinationId, tripId },
  });

  if (!destination) {
    redirectWithMessage(redirectPath, "error", "关联目的地不属于当前旅行。");
  }

  return destination.id;
}

function validateCoordinates(formData: FormData): string | null {
  if (!isValidLatitude(formValue(formData, "latitude"))) {
    return "纬度必须是 -90 到 90 之间的合法数字。";
  }

  if (!isValidLongitude(formValue(formData, "longitude"))) {
    return "经度必须是 -180 到 180 之间的合法数字。";
  }

  return null;
}

function requiredText(formData: FormData, key: string): string {
  return formValue(formData, key).trim();
}

function optionalText(formData: FormData, key: string): string | null {
  return emptyToNull(formValue(formData, key));
}

function optionalInteger(formData: FormData, key: string): number | null {
  const value = formValue(formData, key).trim();

  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function formValue(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

function modulePath(tripId: string, moduleName: TripModule): string {
  return `/trips/${tripId}/${moduleName}`;
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

function revalidateTrip(tripId: string) {
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/destinations`);
  revalidatePath(`/trips/${tripId}/places`);
  revalidatePath(`/trips/${tripId}/notes`);
  revalidatePath(`/trips/${tripId}/checklist`);
}
