"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  formDataToTripValues,
  parseDateInput,
  validateTripFormValues,
  type ValidTripFormValues,
} from "@/lib/trips";

import type { TripActionState } from "./action-state";

export async function createTripAction(
  _previousState: TripActionState,
  formData: FormData,
): Promise<TripActionState> {
  await requireUser();

  const values = formDataToTripValues(formData);
  const validation = validateTripFormValues(values);

  if (!validation.ok) {
    return {
      values: validation.values,
      errors: validation.errors,
      message: "请修正表单中的问题。",
    };
  }

  const trip = await prisma.trip.create({
    data: toTripWriteData(validation.values),
  });

  revalidatePath("/dashboard");
  revalidatePath("/trips");
  redirect(`/trips/${trip.id}`);
}

export async function updateTripAction(
  tripId: string,
  _previousState: TripActionState,
  formData: FormData,
): Promise<TripActionState> {
  await requireUser();

  const values = formDataToTripValues(formData);
  const validation = validateTripFormValues(values);

  if (!validation.ok) {
    return {
      values: validation.values,
      errors: validation.errors,
      message: "请修正表单中的问题。",
    };
  }

  try {
    await prisma.trip.update({
      where: { id: tripId },
      data: toTripWriteData(validation.values),
    });
  } catch (error) {
    if (isPrismaNotFoundError(error)) {
      return {
        values: validation.values,
        errors: {},
        message: "旅行计划不存在或已被删除。",
      };
    }

    throw error;
  }

  revalidatePath("/dashboard");
  revalidatePath("/trips");
  revalidatePath(`/trips/${tripId}`);
  redirect(`/trips/${tripId}`);
}

export async function archiveTripAction(tripId: string) {
  await requireUser();

  try {
    await prisma.trip.update({
      where: { id: tripId },
      data: { status: "ARCHIVED" },
    });
  } catch (error) {
    if (isPrismaNotFoundError(error)) {
      redirect("/trips");
    }

    throw error;
  }

  revalidatePath("/dashboard");
  revalidatePath("/trips");
  revalidatePath(`/trips/${tripId}`);
  redirect(`/trips/${tripId}`);
}

export async function deleteTripAction(tripId: string) {
  await requireUser();

  try {
    await prisma.trip.delete({
      where: { id: tripId },
    });
  } catch (error) {
    if (isPrismaNotFoundError(error)) {
      redirect("/trips");
    }

    throw error;
  }

  revalidatePath("/dashboard");
  revalidatePath("/trips");
  redirect("/trips");
}

function toTripWriteData(values: ValidTripFormValues) {
  const budget = values.budgetAmount.trim();

  return {
    title: values.title.trim(),
    description: emptyToNull(values.description),
    status: values.status,
    startDate: parseDateInput(values.startDate),
    endDate: parseDateInput(values.endDate),
    homeCity: emptyToNull(values.homeCity),
    mainDestination: emptyToNull(values.mainDestination),
    baseCurrency: values.baseCurrency.trim().toUpperCase() || "CNY",
    budgetAmount: budget ? budget : null,
    coverImage: emptyToNull(values.coverImage),
  };
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isPrismaNotFoundError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  );
}
