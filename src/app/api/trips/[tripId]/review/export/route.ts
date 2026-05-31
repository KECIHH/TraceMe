import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit";
import { requireUser } from "@/lib/auth/session";
import { getTripAccessForUser } from "@/lib/collaboration";
import { generateTripExportFileName } from "@/lib/export/trip";
import { prisma } from "@/lib/prisma";
import { exportTripReviewMarkdown } from "@/lib/trip-review";

type TripReviewExportRouteProps = {
  params: Promise<{ tripId: string }>;
};

export async function GET(
  request: Request,
  { params }: TripReviewExportRouteProps,
) {
  const user = await requireUser();
  const { tripId } = await params;
  const access = await getTripAccessForUser(tripId, user.id);

  if (!access?.canRead) {
    return NextResponse.json({ error: "Trip not found." }, { status: 404 });
  }

  const review = await prisma.tripReview.findFirst({
    include: {
      trip: {
        select: {
          endDate: true,
          mainDestination: true,
          startDate: true,
          title: true,
        },
      },
    },
    where: {
      createdById: user.id,
      status: "final",
      tripId,
    },
  });

  if (!review) {
    return NextResponse.json({ error: "Review not found." }, { status: 404 });
  }

  await writeAuditLog({
    action: "trip.review_exported",
    entityId: review.id,
    entityType: "TripReview",
    metadata: { format: "md", tripId },
    request,
    userId: user.id,
  });

  return fileResponse(exportTripReviewMarkdown(review), {
    contentType: "text/markdown; charset=utf-8",
    fileName: generateTripExportFileName(`${review.trip.title}-review`, "md"),
  });
}

function fileResponse(
  body: string,
  {
    contentType,
    fileName,
  }: {
    contentType: string;
    fileName: string;
  },
) {
  return new Response(body, {
    headers: {
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
