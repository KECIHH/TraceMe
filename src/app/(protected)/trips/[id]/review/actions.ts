"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { requireTripAccess } from "@/lib/collaboration";
import { prisma } from "@/lib/prisma";
import {
  buildNextTripSuggestions,
  buildTripReviewAiInput,
  canSaveFinalTripReview,
  extractPreferencesFromReview,
  generateTripReviewDraft,
  normalizeTripReviewDraft,
  parseLines,
  parseTagGroups,
  TRIP_REVIEW_COMPLETED_ONLY_MESSAGE,
  type PreferenceForAiPlan,
  type TripReviewDraft,
} from "@/lib/trip-review";

export async function generateTripReviewDraftAction(
  tripId: string,
  formData: FormData,
) {
  const { user } = await requireTripAccess(tripId, "edit");
  const trip = await loadTripReviewSource(tripId);

  if (!trip) {
    notFound();
  }

  const currentValues = parseReviewForm(formData);
  const input = buildTripReviewAiInput(trip, currentValues);
  const { draft, model, provider } = await generateTripReviewDraft(input);
  const preferences = await loadUserPreferences(user.id);
  const nextTripSuggestions = buildNextTripSuggestions(draft, preferences);

  await prisma.tripReview.upsert({
    create: {
      ...reviewDataForWrite(draft, nextTripSuggestions),
      aiDraftJson: toJsonValue({
        generatedAt: new Date().toISOString(),
        input,
        model,
        provider,
        schemaVersion: 1,
      }),
      createdById: user.id,
      status: "draft",
      tripId,
    },
    update: {
      ...reviewDataForWrite(draft, nextTripSuggestions),
      aiDraftJson: toJsonValue({
        generatedAt: new Date().toISOString(),
        input,
        model,
        provider,
        schemaVersion: 1,
      }),
      status: "draft",
    },
    where: { tripId_createdById: { createdById: user.id, tripId } },
  });

  revalidateReview(tripId);
  redirectToReview(tripId, { message: "AI 复盘草稿已生成。" });
}

export async function saveTripReviewAction(tripId: string, formData: FormData) {
  const { user } = await requireTripAccess(tripId, "edit");
  const trip = await prisma.trip.findUnique({
    select: { id: true, status: true },
    where: { id: tripId },
  });

  if (!trip) {
    notFound();
  }

  if (!canSaveFinalTripReview(trip.status)) {
    redirectToReview(tripId, { error: TRIP_REVIEW_COMPLETED_ONLY_MESSAGE });
  }

  const review = parseReviewForm(formData);
  const existingPreferences = await loadUserPreferences(user.id);
  const extractedPreferences = extractPreferencesFromReview(review);
  const nextTripSuggestions = buildNextTripSuggestions(review, [
    ...existingPreferences,
    ...extractedPreferences.map((item) => ({
      evidenceCount: 1,
      key: item.key,
      label: item.label,
      weight: item.weight,
    })),
  ]);

  await prisma.$transaction(async (tx) => {
    const savedReview = await tx.tripReview.upsert({
      create: {
        ...reviewDataForWrite(review, nextTripSuggestions),
        createdById: user.id,
        status: "final",
        tripId,
      },
      update: {
        ...reviewDataForWrite(review, nextTripSuggestions),
        status: "final",
      },
      where: { tripId_createdById: { createdById: user.id, tripId } },
    });

    for (const preference of extractedPreferences) {
      const existing = await tx.travelPreference.findUnique({
        where: { userId_key: { key: preference.key, userId: user.id } },
      });

      if (!existing) {
        await tx.travelPreference.create({
          data: {
            evidenceCount: 1,
            key: preference.key,
            label: preference.label,
            sourceReviewId: savedReview.id,
            userId: user.id,
            visibility: "private",
            weight: preference.weight,
          },
        });
        continue;
      }

      const isSameSource = existing.sourceReviewId === savedReview.id;

      await tx.travelPreference.update({
        data: {
          evidenceCount: existing.evidenceCount + (isSameSource ? 0 : 1),
          label: preference.label,
          sourceReviewId: savedReview.id,
          visibility: "private",
          weight: Math.min(
            10,
            Math.max(existing.weight, preference.weight) +
              (isSameSource ? 0 : preference.weight),
          ),
        },
        where: { userId_key: { key: preference.key, userId: user.id } },
      });
    }
  });

  revalidateReview(tripId);
  revalidatePath("/trips/ai-plan");
  redirectToReview(tripId, { message: "旅行复盘已保存，并沉淀为个人偏好。" });
}

async function loadTripReviewSource(tripId: string) {
  return prisma.trip.findUnique({
    include: {
      expenses: {
        select: {
          amount: true,
          currency: true,
          exchangeRate: true,
        },
      },
      itineraryDays: {
        include: { items: { select: { status: true } } },
        orderBy: { date: "asc" },
      },
      notes: {
        orderBy: { updatedAt: "desc" },
        select: {
          content: true,
          tags: true,
          title: true,
        },
        take: 12,
      },
    },
    where: { id: tripId },
  });
}

async function loadUserPreferences(userId: string): Promise<PreferenceForAiPlan[]> {
  return prisma.travelPreference.findMany({
    orderBy: [{ weight: "desc" }, { evidenceCount: "desc" }, { updatedAt: "desc" }],
    select: {
      evidenceCount: true,
      key: true,
      label: true,
      weight: true,
    },
    take: 8,
    where: { userId, visibility: "private" },
  });
}

function parseReviewForm(formData: FormData): TripReviewDraft {
  return normalizeTripReviewDraft({
    actualCostAmount: formValue(formData, "actualCostAmount"),
    actualCostCurrency: formValue(formData, "actualCostCurrency"),
    actualPace: formValue(formData, "actualPace"),
    nextTimeAdvice: formValue(formData, "nextTimeAdvice"),
    placeTags: parseTagGroups(formValue(formData, "placeTags")),
    recommendations: parseLines(formValue(formData, "recommendations")),
    regrets: parseLines(formValue(formData, "regrets")),
    stayTags: parseTagGroups(formValue(formData, "stayTags")),
    summary: formValue(formData, "summary"),
    transportTags: parseTagGroups(formValue(formData, "transportTags")),
    warnings: parseLines(formValue(formData, "warnings")),
  });
}

function reviewDataForWrite(
  review: TripReviewDraft,
  nextTripSuggestions: unknown,
) {
  return {
    actualCostAmount: review.actualCostAmount || null,
    actualCostCurrency: review.actualCostCurrency,
    actualPace: review.actualPace,
    nextTimeAdvice: review.nextTimeAdvice || null,
    nextTripSuggestions: toJsonValue(nextTripSuggestions),
    placeTags: toJsonValue(review.placeTags),
    recommendations: toJsonValue(review.recommendations),
    regrets: toJsonValue(review.regrets),
    stayTags: toJsonValue(review.stayTags),
    summary: review.summary || null,
    transportTags: toJsonValue(review.transportTags),
    warnings: toJsonValue(review.warnings),
  };
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function formValue(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

function revalidateReview(tripId: string) {
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/review`);
}

function redirectToReview(
  tripId: string,
  params: Record<string, string | undefined>,
): never {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  const query = searchParams.toString();
  redirect(`/trips/${tripId}/review${query ? `?${query}` : ""}`);
}
