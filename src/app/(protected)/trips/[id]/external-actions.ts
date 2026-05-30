"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { requireTripAccess } from "@/lib/collaboration";
import {
  createExchangeRateProvider,
  normalizeCurrencyCode,
} from "@/lib/external/exchange";
import {
  createWeatherProvider,
  formatWeatherSnapshot,
  isWeatherCacheFresh,
  toDateKey,
} from "@/lib/external/weather";
import { prisma } from "@/lib/prisma";
import { parseDateInput } from "@/lib/trip-management";

export async function refreshWeatherAction(tripId: string, formData?: FormData) {
  const trip = await requireTrip(tripId);
  const target = pickWeatherTarget(trip);
  const redirectPath = safeTripReturnPath(
    tripId,
    formData ? formValue(formData, "returnTo") : "",
    `/trips/${tripId}`,
  );
  const forceRefresh = formData?.get("forceRefresh") === "true";

  if (!target) {
    redirectWithMessage(
      redirectPath,
      "error",
      "请先为目的地或地点填写经纬度，天气刷新需要坐标。",
    );
  }

  const dates = pickWeatherDates(trip);
  const provider = createWeatherProvider();
  let cachedUsed = 0;
  let refreshed = 0;
  let fallback = 0;

  for (const date of dates) {
    const cached = await findLatestWeatherSnapshot(tripId, date);

    if (
      cached &&
      cached.source !== "manual" &&
      !forceRefresh &&
      isWeatherCacheFresh(cached.fetchedAt)
    ) {
      await updateItineraryWeatherSummary(tripId, date);
      cachedUsed += 1;
      continue;
    }

    const result = await provider.fetchForecast({
      date,
      latitude: target.latitude,
      locationName: target.locationName,
      longitude: target.longitude,
      tripId,
    });

    if (!result.ok) {
      if (cached) {
        await updateItineraryWeatherSummary(tripId, date);
        fallback += 1;
      }
      continue;
    }

    await prisma.weatherSnapshot.create({
      data: {
        condition: result.data.condition,
        date,
        destinationId: target.destinationId,
        fetchedAt: result.data.fetchedAt,
        latitude: target.latitude,
        locationName: target.locationName,
        longitude: target.longitude,
        precipitationProbability: result.data.precipitationProbability,
        rawJson: toPrismaJson(result.data.rawJson),
        source: result.data.source,
        temperatureMax: result.data.temperatureMax,
        temperatureMin: result.data.temperatureMin,
        tripId,
        wind: result.data.wind,
      },
    });
    refreshed += 1;

    await updateItineraryWeatherSummary(tripId, date);
  }

  revalidateExternalData(tripId);

  if (refreshed > 0 || cachedUsed > 0 || fallback > 0) {
    const parts = [
      refreshed > 0 ? `天气已刷新 ${refreshed} 天` : null,
      cachedUsed > 0 ? `缓存仍有效 ${cachedUsed} 天` : null,
      fallback > 0 ? `天气服务不可用，已显示 ${fallback} 天上次缓存` : null,
    ].filter(Boolean);

    redirectWithMessage(
      redirectPath,
      "message",
      `${parts.join("；")}；外部数据仅供参考，请人工核验。`,
    );
  }

  redirectWithMessage(
    redirectPath,
    "error",
    "天气 provider 未配置或请求失败，且没有可用缓存。可在行程日历手动填写天气备注。",
  );
}

export async function saveManualWeatherAction(tripId: string, formData: FormData) {
  await requireTrip(tripId);
  const redirectPath = `/trips/${tripId}/itinerary`;
  const date = parseDateInput(formValue(formData, "date"));
  const locationName = requiredText(formData, "locationName") || "手动天气";
  const manualNote = requiredText(formData, "manualNote");

  if (!date || !manualNote) {
    redirectWithMessage(redirectPath, "error", "请填写日期和天气备注。");
  }

  await prisma.weatherSnapshot.create({
    data: {
      date,
      locationName,
      manualNote,
      source: "manual",
      tripId,
    },
  });
  await updateItineraryWeatherSummary(tripId, date);
  revalidateExternalData(tripId);
  redirectWithMessage(redirectPath, "message", "天气备注已保存；外部数据仅供参考，请人工核验。");
}

export async function refreshExchangeRatesAction(tripId: string) {
  const trip = await requireTrip(tripId);
  const baseCurrency = normalizeCurrencyCode(trip.baseCurrency || "CNY");
  const currencies = await getForeignExpenseCurrencies(tripId, baseCurrency);
  const redirectPath = `/trips/${tripId}/budget`;

  if (currencies.length === 0) {
    redirectWithMessage(redirectPath, "message", "没有需要更新汇率的外币支出。");
  }

  const provider = createExchangeRateProvider();
  let updated = 0;
  let fallback = 0;

  for (const currency of currencies) {
    const result = await provider.fetchRate({
      baseCurrency: currency,
      targetCurrency: baseCurrency,
      tripId,
    });

    if (!result.ok) {
      const cached = await findLatestCurrencyRate(tripId, currency, baseCurrency);
      if (cached) {
        await applyRateToExpenses(tripId, currency, cached.rate);
        fallback += 1;
      }
      continue;
    }

    await saveCurrencyRateSnapshot({
      baseCurrency: currency,
      fetchedAt: result.data.fetchedAt,
      isManual: false,
      rate: result.data.rate,
      source: result.data.source,
      targetCurrency: baseCurrency,
      tripId,
      validDate: result.data.validDate,
    });
    await applyRateToExpenses(tripId, currency, result.data.rate);
    updated += 1;
  }

  revalidateExternalData(tripId);

  if (updated > 0) {
    redirectWithMessage(
      redirectPath,
      "message",
      `汇率已更新 ${updated} 组，并已填充缺失汇率的支出；汇率仅供记录，请以实际支付为准。`,
    );
  }

  if (fallback > 0) {
    redirectWithMessage(
      redirectPath,
      "message",
      `汇率服务不可用，已使用 ${fallback} 组上次缓存；汇率仅供记录，请以实际支付为准。`,
    );
  }

  redirectWithMessage(redirectPath, "error", "汇率 provider 未配置或请求失败，请手动填写汇率。");
}

export async function saveManualExchangeRateAction(
  tripId: string,
  formData: FormData,
) {
  const trip = await requireTrip(tripId);
  const redirectPath = `/trips/${tripId}/budget`;
  const baseCurrency = normalizeCurrencyCode(requiredText(formData, "baseCurrency"));
  const targetCurrency = normalizeCurrencyCode(
    requiredText(formData, "targetCurrency") || trip.baseCurrency || "CNY",
  );
  const rate = Number(formValue(formData, "manualRate"));
  const validDate = normalizeDateForRate(
    parseDateInput(formValue(formData, "validDate")) ?? new Date(),
  );

  if (!/^[A-Z]{3}$/.test(baseCurrency) || !/^[A-Z]{3}$/.test(targetCurrency)) {
    redirectWithMessage(redirectPath, "error", "货币代码必须是 3 位字母。");
  }

  if (!Number.isFinite(rate) || rate <= 0) {
    redirectWithMessage(redirectPath, "error", "手动汇率必须大于 0。");
  }

  await saveCurrencyRateSnapshot({
    baseCurrency,
    fetchedAt: new Date(),
    isManual: true,
    rate,
    source: "manual",
    targetCurrency,
    tripId,
    validDate,
  });
  await applyRateToExpenses(tripId, baseCurrency, rate);
  revalidateExternalData(tripId);
  redirectWithMessage(redirectPath, "message", "手动汇率已保存；汇率仅供记录，请以实际支付为准。");
}

async function requireTrip(tripId: string) {
  await requireTripAccess(tripId, "edit");
  const trip = await prisma.trip.findUnique({
    include: {
      destinations: { orderBy: { createdAt: "asc" } },
      itineraryDays: { orderBy: { date: "asc" } },
      places: { orderBy: { createdAt: "asc" } },
    },
    where: { id: tripId },
  });

  if (!trip) {
    notFound();
  }

  return trip;
}

function pickWeatherTarget(trip: Awaited<ReturnType<typeof requireTrip>>) {
  const destination = trip.destinations.find(
    (item) => typeof item.latitude === "number" && typeof item.longitude === "number",
  );

  if (destination?.latitude !== null && destination?.longitude !== null && destination) {
    return {
      destinationId: destination.id,
      latitude: destination.latitude,
      locationName: destination.name,
      longitude: destination.longitude,
    };
  }

  const place = trip.places.find(
    (item) => typeof item.latitude === "number" && typeof item.longitude === "number",
  );

  if (place?.latitude !== null && place?.longitude !== null && place) {
    return {
      destinationId: place.destinationId,
      latitude: place.latitude,
      locationName: place.name,
      longitude: place.longitude,
    };
  }

  return null;
}

function pickWeatherDates(trip: Awaited<ReturnType<typeof requireTrip>>): Date[] {
  if (trip.itineraryDays.length > 0) {
    return trip.itineraryDays.map((day) => day.date);
  }

  if (trip.startDate) {
    return [trip.startDate];
  }

  return [new Date()];
}

async function findLatestWeatherSnapshot(tripId: string, date: Date) {
  return prisma.weatherSnapshot.findFirst({
    orderBy: { fetchedAt: "desc" },
    where: {
      date: dayBounds(date),
      tripId,
    },
  });
}

async function updateItineraryWeatherSummary(tripId: string, date: Date) {
  const snapshot = await findLatestWeatherSnapshot(tripId, date);

  if (!snapshot) {
    return;
  }

  await prisma.itineraryDay.updateMany({
    data: { weatherSummary: formatWeatherSnapshot(snapshot) },
    where: {
      date: dayBounds(date),
      tripId,
    },
  });
}

async function getForeignExpenseCurrencies(tripId: string, baseCurrency: string) {
  const expenses = await prisma.expense.findMany({
    select: { currency: true },
    where: { tripId },
  });

  return Array.from(
    new Set(
      expenses
        .map((expense) => normalizeCurrencyCode(expense.currency))
        .filter((currency) => /^[A-Z]{3}$/.test(currency) && currency !== baseCurrency),
    ),
  );
}

async function findLatestCurrencyRate(
  tripId: string,
  baseCurrency: string,
  targetCurrency: string,
) {
  return prisma.currencyRate.findFirst({
    orderBy: { fetchedAt: "desc" },
    where: { baseCurrency, targetCurrency, tripId },
  });
}

async function saveCurrencyRateSnapshot({
  baseCurrency,
  fetchedAt,
  isManual,
  rate,
  source,
  targetCurrency,
  tripId,
  validDate,
}: {
  baseCurrency: string;
  fetchedAt: Date;
  isManual: boolean;
  rate: number;
  source: string;
  targetCurrency: string;
  tripId: string;
  validDate: Date;
}) {
  const normalizedValidDate = normalizeDateForRate(validDate);
  const existing = await prisma.currencyRate.findFirst({
    orderBy: { fetchedAt: "desc" },
    where: {
      baseCurrency,
      isManual,
      source,
      targetCurrency,
      tripId,
      validDate: dayBounds(normalizedValidDate),
    },
  });

  if (existing) {
    return prisma.currencyRate.update({
      data: {
        fetchedAt,
        rate,
        validDate: normalizedValidDate,
      },
      where: { id: existing.id },
    });
  }

  return prisma.currencyRate.create({
    data: {
      baseCurrency,
      fetchedAt,
      isManual,
      rate,
      source,
      targetCurrency,
      tripId,
      validDate: normalizedValidDate,
    },
  });
}

async function applyRateToExpenses(
  tripId: string,
  currency: string,
  rate: number | Prisma.Decimal,
) {
  await prisma.expense.updateMany({
    data: { exchangeRate: rate },
    where: {
      currency,
      exchangeRate: null,
      tripId,
    },
  });
}

function dayBounds(date: Date) {
  const dayKey = toDateKey(date);
  const start = parseDateInput(dayKey) ?? date;
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { gte: start, lt: end };
}

function normalizeDateForRate(date: Date) {
  return dayBounds(date).gte;
}

function toPrismaJson(value: unknown) {
  return value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

function formValue(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

function requiredText(formData: FormData, key: string): string {
  return formValue(formData, key).trim();
}

function safeTripReturnPath(
  tripId: string,
  returnTo: string,
  fallback: string,
): string {
  if (!returnTo.startsWith(`/trips/${tripId}`)) {
    return fallback;
  }

  if (returnTo.startsWith("//") || returnTo.includes("://")) {
    return fallback;
  }

  return returnTo;
}

function redirectWithMessage(
  path: string,
  key: "error" | "message",
  message: string,
): never {
  redirect(`${path}?${key}=${encodeURIComponent(message)}`);
}

function revalidateExternalData(tripId: string) {
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/budget`);
  revalidatePath(`/trips/${tripId}/itinerary`);
  revalidatePath(`/trips/${tripId}/today`);
}
