import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { getTripAccessForUser } from "@/lib/collaboration";
import { isItineraryStatus } from "@/lib/itinerary";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ itemId: string; tripId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const user = await requireUser();
  const { itemId, tripId } = await context.params;
  const access = await getTripAccessForUser(tripId, user.id);

  if (!access?.canEdit) {
    return NextResponse.json({ error: "Trip not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as { status?: unknown } | null;
  const status = typeof body?.status === "string" ? body.status : "";

  if (!isItineraryStatus(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const result = await prisma.itineraryItem.updateMany({
    data: { status },
    where: { id: itemId, tripId },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
