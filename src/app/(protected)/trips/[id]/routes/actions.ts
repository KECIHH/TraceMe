"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { requireTripAccess } from "@/lib/collaboration";
import { prisma } from "@/lib/prisma";
import {
  getRouteWeightPreset,
  normalizeWeights,
  type RouteScoreWeights,
} from "@/lib/route-score";
import {
  isTransportMode,
  isTransportStatus,
  parseDateTimeInput,
} from "@/lib/routes";
import {
  emptyToNull,
  isValidOptionalHttpUrl,
  parseDateInput,
} from "@/lib/trip-management";

export async function createRoutePlanAction(
  tripId: string,
  formData: FormData,
) {
  await requireTrip(tripId);
  const redirectPath = routesPath(tripId);
  const validationError = validateRoutePlanForm(formData);

  if (validationError) {
    redirectWithMessage(redirectPath, "error", validationError);
  }

  const routePlan = await prisma.routePlan.create({
    data: buildRoutePlanData(tripId, formData),
  });

  revalidateRoutes(tripId, routePlan.id);
  redirectWithMessage(
    routePlanPath(tripId, routePlan.id),
    "message",
    "路线规划已创建。",
  );
}

export async function updateRoutePlanAction(
  tripId: string,
  routePlanId: string,
  formData: FormData,
) {
  await requireRoutePlan(tripId, routePlanId);
  const redirectPath = routePlanPath(tripId, routePlanId);
  const validationError = validateRoutePlanForm(formData);

  if (validationError) {
    redirectWithMessage(redirectPath, "error", validationError);
  }

  await runMutationOrRedirect(
    () =>
      prisma.routePlan.update({
        where: { id: routePlanId, tripId },
        data: buildRoutePlanData(tripId, formData),
      }),
    redirectPath,
    "路线规划不存在或已被删除。",
  );

  revalidateRoutes(tripId, routePlanId);
  redirectWithMessage(redirectPath, "message", "路线规划和权重已保存。");
}

export async function deleteRoutePlanAction(
  tripId: string,
  routePlanId: string,
) {
  await requireRoutePlan(tripId, routePlanId);

  await runMutationOrRedirect(
    () => prisma.routePlan.delete({ where: { id: routePlanId, tripId } }),
    routesPath(tripId),
    "路线规划不存在或已被删除。",
  );

  revalidateRoutes(tripId, routePlanId);
  redirectWithMessage(routesPath(tripId), "message", "路线规划已删除。");
}

export async function createTransportOptionAction(
  tripId: string,
  routePlanId: string,
  formData: FormData,
) {
  await requireRoutePlan(tripId, routePlanId);
  const redirectPath = routePlanPath(tripId, routePlanId);
  const validationError = validateTransportOptionForm(formData);

  if (validationError) {
    redirectWithMessage(redirectPath, "error", validationError);
  }

  const option = await prisma.transportOption.create({
    data: buildTransportOptionData(tripId, routePlanId, formData),
  });

  if (option.status === "SELECTED") {
    await selectOption(tripId, routePlanId, option.id);
  }

  revalidateRoutes(tripId, routePlanId);
  redirectWithMessage(redirectPath, "message", "交通方案已添加。");
}

export async function updateTransportOptionAction(
  tripId: string,
  routePlanId: string,
  optionId: string,
  formData: FormData,
) {
  await requireTransportOption(tripId, routePlanId, optionId);
  const redirectPath = `${routePlanPath(tripId, routePlanId)}#option-${optionId}`;
  const validationError = validateTransportOptionForm(formData);

  if (validationError) {
    redirectWithMessage(redirectPath, "error", validationError);
  }

  const option = await prisma.transportOption.update({
    where: { id: optionId, tripId },
    data: buildTransportOptionData(tripId, routePlanId, formData),
  });

  if (option.status === "SELECTED") {
    await selectOption(tripId, routePlanId, option.id);
  }

  revalidateRoutes(tripId, routePlanId);
  redirectWithMessage(redirectPath, "message", "交通方案已更新。");
}

export async function deleteTransportOptionAction(
  tripId: string,
  routePlanId: string,
  optionId: string,
) {
  const routePlan = await requireRoutePlan(tripId, routePlanId);
  await requireTransportOption(tripId, routePlanId, optionId);
  const wasSelected = routePlan.selectedOptionId === optionId;

  await prisma.$transaction([
    ...(wasSelected
      ? [
          prisma.routePlan.update({
            where: { id: routePlanId, tripId },
            data: { selectedOptionId: null },
          }),
        ]
      : []),
    prisma.transportOption.delete({ where: { id: optionId, tripId } }),
  ]);

  revalidateRoutes(tripId, routePlanId);
  redirectWithMessage(
    routePlanPath(tripId, routePlanId),
    "message",
    wasSelected ? "已删除所选交通方案，推荐选择已清空。" : "交通方案已删除。",
  );
}

export async function selectTransportOptionAction(
  tripId: string,
  routePlanId: string,
  optionId: string,
) {
  await requireTransportOption(tripId, routePlanId, optionId);
  await selectOption(tripId, routePlanId, optionId);

  revalidateRoutes(tripId, routePlanId);
  redirectWithMessage(routePlanPath(tripId, routePlanId), "message", "推荐方案已选择。");
}

async function selectOption(
  tripId: string,
  routePlanId: string,
  optionId: string,
) {
  await prisma.$transaction([
    prisma.transportOption.updateMany({
      where: { routePlanId, tripId, status: "SELECTED", id: { not: optionId } },
      data: { status: "CANDIDATE" },
    }),
    prisma.transportOption.update({
      where: { id: optionId, tripId },
      data: { status: "SELECTED" },
    }),
    prisma.routePlan.update({
      where: { id: routePlanId, tripId },
      data: { selectedOptionId: optionId },
    }),
  ]);
}

function buildRoutePlanData(tripId: string, formData: FormData) {
  return {
    tripId,
    title: requiredText(formData, "title"),
    fromName: requiredText(formData, "fromName"),
    toName: requiredText(formData, "toName"),
    departDate: parseDateInput(formValue(formData, "departDate")),
    notes: optionalText(formData, "notes"),
    weights: parseWeightsForm(formData),
  };
}

function buildTransportOptionData(
  tripId: string,
  routePlanId: string,
  formData: FormData,
) {
  const mode = formValue(formData, "mode");
  const status = formValue(formData, "status");

  return {
    tripId,
    routePlanId,
    fromName: requiredText(formData, "fromName"),
    toName: requiredText(formData, "toName"),
    mode: isTransportMode(mode) ? mode : "OTHER",
    provider: optionalText(formData, "provider"),
    trainOrFlightNo: optionalText(formData, "trainOrFlightNo"),
    departTime: parseDateTimeInput(formValue(formData, "departTime")),
    arriveTime: parseDateTimeInput(formValue(formData, "arriveTime")),
    doorToDoorMinutes: optionalInteger(formData, "doorToDoorMinutes"),
    price: optionalText(formData, "price"),
    currency: optionalText(formData, "currency") ?? "CNY",
    transferCount: optionalInteger(formData, "transferCount"),
    comfortScore: optionalInteger(formData, "comfortScore"),
    riskScore: optionalInteger(formData, "riskScore"),
    luggageFriendlyScore: optionalInteger(formData, "luggageFriendlyScore"),
    flexibilityScore: optionalInteger(formData, "flexibilityScore"),
    bookingUrl: optionalText(formData, "bookingUrl"),
    status: isTransportStatus(status) ? status : "CANDIDATE",
    notes: optionalText(formData, "notes"),
  };
}

function validateRoutePlanForm(formData: FormData): string | null {
  if (!requiredText(formData, "title")) {
    return "请填写路线规划标题。";
  }

  if (!requiredText(formData, "fromName") || !requiredText(formData, "toName")) {
    return "请填写路线起点和终点。";
  }

  if (formValue(formData, "departDate") && !parseDateInput(formValue(formData, "departDate"))) {
    return "出发日期无效。";
  }

  return null;
}

function validateTransportOptionForm(formData: FormData): string | null {
  if (!requiredText(formData, "fromName") || !requiredText(formData, "toName")) {
    return "请填写交通方案起点和终点。";
  }

  if (!isValidOptionalHttpUrl(formValue(formData, "bookingUrl"))) {
    return "预订链接必须是有效的 http 或 https 地址。";
  }

  for (const [key, label] of [
    ["doorToDoorMinutes", "门到门总耗时"],
    ["transferCount", "中转次数"],
  ] as const) {
    const value = formValue(formData, key).trim();

    if (value && (!Number.isInteger(Number(value)) || Number(value) < 0)) {
      return `${label}必须是大于等于 0 的整数。`;
    }
  }

  const price = formValue(formData, "price").trim();

  if (price && (!Number.isFinite(Number(price)) || Number(price) < 0)) {
    return "价格不能小于 0。";
  }

  for (const [key, label] of [
    ["comfortScore", "舒适度评分"],
    ["riskScore", "风险评分"],
    ["luggageFriendlyScore", "行李友好度"],
    ["flexibilityScore", "退改灵活度"],
  ] as const) {
    const value = formValue(formData, key).trim();

    if (value && (!Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > 100)) {
      return `${label}必须是 0 到 100 的整数。`;
    }
  }

  const departTime = formValue(formData, "departTime");
  const arriveTime = formValue(formData, "arriveTime");
  const departDate = parseDateTimeInput(departTime);
  const arriveDate = parseDateTimeInput(arriveTime);

  if (departTime && !departDate) {
    return "出发时间无效。";
  }

  if (arriveTime && !arriveDate) {
    return "到达时间无效。";
  }

  if (departDate && arriveDate && arriveDate <= departDate) {
    return "到达时间必须晚于出发时间。";
  }

  return null;
}

function parseWeightsForm(formData: FormData): RouteScoreWeights {
  const presetId = formValue(formData, "weightPreset");

  if (presetId && presetId !== "custom") {
    return normalizeWeights(getRouteWeightPreset(presetId).weights);
  }

  return normalizeWeights({
    time: optionalNumber(formData, "weightTime"),
    cost: optionalNumber(formData, "weightCost"),
    comfort: optionalNumber(formData, "weightComfort"),
    transfer: optionalNumber(formData, "weightTransfer"),
    risk: optionalNumber(formData, "weightRisk"),
    luggage: optionalNumber(formData, "weightLuggage"),
    flexibility: optionalNumber(formData, "weightFlexibility"),
  });
}

async function requireTrip(tripId: string) {
  await requireTripAccess(tripId, "edit");
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });

  if (!trip) {
    notFound();
  }

  return trip;
}

async function requireRoutePlan(tripId: string, routePlanId: string) {
  await requireTripAccess(tripId, "edit");
  const routePlan = await prisma.routePlan.findFirst({
    where: { id: routePlanId, tripId },
  });

  if (!routePlan) {
    notFound();
  }

  return routePlan;
}

async function requireTransportOption(
  tripId: string,
  routePlanId: string,
  optionId: string,
) {
  await requireTripAccess(tripId, "edit");
  const option = await prisma.transportOption.findFirst({
    where: { id: optionId, tripId, routePlanId },
  });

  if (!option) {
    redirectWithMessage(routePlanPath(tripId, routePlanId), "error", "交通方案不存在或已被删除。");
  }

  return option;
}

function requiredText(formData: FormData, key: string): string {
  return formValue(formData, key).trim();
}

function optionalText(formData: FormData, key: string): string | null {
  return emptyToNull(formValue(formData, key));
}

function optionalInteger(formData: FormData, key: string): number | null {
  const value = requiredText(formData, key);

  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function optionalNumber(formData: FormData, key: string): number | undefined {
  const value = requiredText(formData, key);

  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formValue(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

function routesPath(tripId: string): string {
  return `/trips/${tripId}/routes`;
}

function routePlanPath(tripId: string, routePlanId: string): string {
  return `${routesPath(tripId)}/${routePlanId}`;
}

function redirectWithMessage(
  path: string,
  key: "error" | "message",
  message: string,
): never {
  const [pathname, hash] = path.split("#");
  redirect(
    `${pathname}?${key}=${encodeURIComponent(message)}${hash ? `#${hash}` : ""}`,
  );
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

function revalidateRoutes(tripId: string, routePlanId?: string) {
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(routesPath(tripId));

  if (routePlanId) {
    revalidatePath(routePlanPath(tripId, routePlanId));
  }
}
