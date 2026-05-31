import { NextResponse } from "next/server";

import {
  attachOfflineCacheMetadata,
  assertOfflineSummaryHasNoSensitiveKeys,
  OFFLINE_CACHE_SCHEMA_VERSION,
  formatOfflineLocalTime,
  redactSensitiveOfflineText,
  sanitizeOfflineText,
  sanitizeOptionalOfflineText,
  stripSensitiveFields,
  type OfflineTripSummary,
} from "@/lib/offline";
import { dateKey, getNearestItineraryDay, getTodayDateMatch } from "@/lib/itinerary";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { getTripAccessForUser } from "@/lib/collaboration";
import { summarizeTodayForOffline } from "@/lib/today";

type RouteContext = {
  params: Promise<{ tripId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { tripId } = await context.params;
  const access = await getTripAccessForUser(tripId, user.id);

  if (!access?.canRead) {
    return NextResponse.json({ error: "Trip not found." }, { status: 404 });
  }

  const trip = await prisma.trip.findUnique({
    include: {
      checklistItems: {
        orderBy: [{ category: "asc" }, { importance: "desc" }, { createdAt: "asc" }],
        select: {
          category: true,
          importance: true,
          status: true,
          title: true,
        },
        take: 80,
      },
      itineraryDays: {
        include: {
          items: {
            orderBy: [
              { sortOrder: "asc" },
              { startTime: "asc" },
              { createdAt: "asc" },
            ],
            select: {
              endTime: true,
              id: true,
              place: { select: { name: true } },
              priority: true,
              startTime: true,
              status: true,
              title: true,
              transportToNext: true,
              type: true,
            },
          },
        },
        orderBy: { date: "asc" },
      },
      expenses: {
        orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
        select: {
          amount: true,
          category: true,
          currency: true,
          paidAt: true,
          title: true,
        },
        take: 80,
      },
      notes: {
        orderBy: { updatedAt: "desc" },
        select: { content: true, tags: true, title: true },
        take: 10,
      },
      places: {
        orderBy: [{ type: "asc" }, { priority: "desc" }, { name: "asc" }],
        select: {
          address: true,
          name: true,
          phone: true,
          type: true,
        },
        take: 80,
      },
      transports: {
        orderBy: [{ departTime: "asc" }, { createdAt: "asc" }],
        select: {
          arriveTime: true,
          departTime: true,
          fromName: true,
          mode: true,
          provider: true,
          toName: true,
          trainOrFlightNo: true,
        },
        take: 20,
      },
    },
    where: { id: tripId },
  });

  if (!trip) {
    return NextResponse.json({ error: "Trip not found." }, { status: 404 });
  }

  const now = new Date();
  const today =
    getTodayDateMatch(now, trip.itineraryDays) ??
    getNearestItineraryDay(now, trip.itineraryDays);
  const fullToday = today
    ? trip.itineraryDays.find((day) => day.id === today.id) ?? null
    : null;
  const lodging = trip.places.filter((place) => place.type === "HOTEL").slice(0, 10);
  const todayExpenses = trip.expenses.filter((expense) =>
    expense.paidAt && fullToday
      ? dateKey(expense.paidAt) === dateKey(fullToday.date)
      : false,
  );
  const todayOffline = summarizeTodayForOffline({
    checklist: trip.checklistItems.map((item) => ({ ...item, dueDate: null })),
    day: fullToday,
    expenses: todayExpenses,
    now,
  });
  const emergencyNotes = trip.notes
    .filter((note) => {
      const tags = Array.isArray(note.tags) ? note.tags.join(" ") : "";
      return `${note.title} ${tags}`.toLowerCase().includes("emergency") ||
        `${note.title} ${tags}`.includes("紧急");
    })
    .map((note) =>
      redactSensitiveOfflineText(`${note.title}: ${note.content.slice(0, 300)}`),
    )
    .slice(0, 8);

  const summary = attachOfflineCacheMetadata(
    stripSensitiveFields({
      budget: {
        baseCurrency: sanitizeOfflineText(trip.baseCurrency),
        spentToday: todayOffline.spentToday.map((expense) => ({
          ...expense,
          category: sanitizeOfflineText(expense.category),
          title: sanitizeOfflineText(expense.title),
        })),
        totalBudget: trip.budgetAmount?.toString() ?? null,
      },
      checklist: trip.checklistItems.map((item) => ({
        ...item,
        category: sanitizeOfflineText(item.category),
        title: sanitizeOfflineText(item.title),
      })),
      dateRange: {
        endDate: toDateString(trip.endDate),
        startDate: toDateString(trip.startDate),
      },
      emergencyNotes,
      lodging: lodging.map(sanitizePlaceSummary),
      places: trip.places.slice(0, 50).map(sanitizePlaceSummary),
      schemaVersion: OFFLINE_CACHE_SCHEMA_VERSION,
      title: sanitizeOfflineText(trip.title),
      today: {
        city: sanitizeOptionalOfflineText(fullToday?.city),
        date: fullToday ? dateKey(fullToday.date) : null,
        items:
          fullToday?.items.map((item) => ({
            endTime: toTimeString(item.endTime),
            placeName: sanitizeOptionalOfflineText(item.place?.name),
            startTime: toTimeString(item.startTime),
            status: item.status,
            title: sanitizeOfflineText(item.title),
            transportToNext: sanitizeOptionalOfflineText(item.transportToNext),
            type: item.type,
          })) ?? [],
        nextStep: todayOffline.nextStep
          ? {
              ...todayOffline.nextStep,
              title: sanitizeOfflineText(todayOffline.nextStep.title),
              transportToNext: sanitizeOptionalOfflineText(
                todayOffline.nextStep.transportToNext,
              ),
            }
          : null,
        theme: sanitizeOptionalOfflineText(fullToday?.theme),
        weatherSummary: sanitizeOptionalOfflineText(fullToday?.weatherSummary),
      },
      transports: trip.transports.map((transport) =>
        [
          sanitizeOfflineText(transport.fromName),
          "→",
          sanitizeOfflineText(transport.toName),
          sanitizeOptionalOfflineText(transport.provider),
          sanitizeOptionalOfflineText(transport.trainOrFlightNo),
          toTimeString(transport.departTime),
        ]
          .filter(Boolean)
          .join(" "),
      ),
      tripId: trip.id,
    }),
  ) satisfies OfflineTripSummary;

  if (!assertOfflineSummaryHasNoSensitiveKeys(summary)) {
    return NextResponse.json(
      { error: "Offline summary contains sensitive fields." },
      { status: 500 },
    );
  }

  return NextResponse.json(summary, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function toDateString(date: Date | null): string | null {
  return date ? dateKey(date) : null;
}

function toTimeString(date: Date | null): string | null {
  return formatOfflineLocalTime(date);
}

function sanitizePlaceSummary<T extends { address: string | null; name: string; phone: string | null }>(
  place: T,
): T {
  return {
    ...place,
    address: sanitizeOptionalOfflineText(place.address),
    name: sanitizeOfflineText(place.name),
    phone: sanitizeOptionalOfflineText(place.phone),
  };
}
