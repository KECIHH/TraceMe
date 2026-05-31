import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import {
  isValidCurrencyCode,
  isValidOptionalNonNegativeAmount,
  normalizeExpenseCategory,
} from "@/lib/budget";
import { getTripAccessForUser } from "@/lib/collaboration";
import { dateKey } from "@/lib/itinerary";
import { prisma } from "@/lib/prisma";
import { validateTodayQuickRecordInput } from "@/lib/today";
import { parseDateInput } from "@/lib/trip-management";

type RouteContext = {
  params: Promise<{ tripId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const user = await requireUser();
  const { tripId } = await context.params;
  const access = await getTripAccessForUser(tripId, user.id);

  if (!access?.canEdit) {
    return NextResponse.json({ error: "Trip not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        recordAmount?: unknown;
        recordCategory?: unknown;
        recordCurrency?: unknown;
        recordPlace?: unknown;
        recordReminder?: unknown;
        recordReminderDate?: unknown;
        recordText?: unknown;
      }
    | null;
  const noteText = textValue(body?.recordText);
  const amount = textValue(body?.recordAmount);
  const placeName = textValue(body?.recordPlace);
  const reminder = textValue(body?.recordReminder);
  const currency = (textValue(body?.recordCurrency) || "CNY").toUpperCase();

  const validationError = validateTodayQuickRecordInput({
    amount,
    noteText,
    placeName,
    reminder,
  });

  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  if (amount && !isValidOptionalNonNegativeAmount(amount)) {
    return NextResponse.json({ error: "金额不能小于 0。" }, { status: 400 });
  }

  if (amount && !isValidCurrencyCode(currency)) {
    return NextResponse.json(
      { error: "货币必须是 3 位字母代码，例如 CNY。" },
      { status: 400 },
    );
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    let placeId: string | undefined;

    if (placeName) {
      const place = await tx.place.create({
        data: {
          name: placeName,
          notes: noteText,
          priority: "MEDIUM",
          sourceName: "今日执行模式",
          tags: ["旅行中", "临时地点"],
          tripId,
          type: "OTHER",
        },
        select: { id: true },
      });
      placeId = place.id;
    }

    if (amount) {
      await tx.expense.create({
        data: {
          amount,
          category: normalizeExpenseCategory(textValue(body?.recordCategory)),
          currency,
          notes: noteText,
          paidAt: now,
          relatedPlaceId: placeId,
          title: noteText?.slice(0, 40) || placeName || "旅行中快速支出",
          tripId,
        },
      });
    }

    if (noteText) {
      await tx.note.create({
        data: {
          content: [
            noteText,
            placeName ? `地点：${placeName}` : null,
            amount ? `金额：${currency} ${amount}` : null,
            reminder ? `提醒：${reminder}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
          tags: ["旅行中", "快速记录"],
          title: `旅行中记录 - ${dateKey(now)}`,
          tripId,
        },
      });
    }

    if (reminder) {
      await tx.checklistItem.create({
        data: {
          category: "旅途中提醒",
          dueDate: parseDateInput(textValue(body?.recordReminderDate)),
          importance: "HIGH",
          notes: noteText,
          title: reminder,
          tripId,
        },
      });
    }
  });

  return NextResponse.json({ message: "快速记录已保存。" });
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
