import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit";
import { requireUser } from "@/lib/auth/session";
import {
  generateTripExportFileName,
  generateTripJsonExport,
  generateTripMarkdownExport,
  generateTripPrintableHtml,
  TRIP_EXPORT_INCLUDE,
} from "@/lib/export/trip";
import { prisma } from "@/lib/prisma";

type TripExportRouteProps = {
  params: Promise<{ tripId: string }>;
};

export async function GET(request: Request, { params }: TripExportRouteProps) {
  const user = await requireUser();
  const { tripId } = await params;
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "json";
  const trip = await prisma.trip.findUnique({
    include: TRIP_EXPORT_INCLUDE,
    where: { id: tripId },
  });

  if (!trip) {
    return NextResponse.json({ error: "Trip not found." }, { status: 404 });
  }

  await writeAuditLog({
    action: "trip.exported",
    entityId: trip.id,
    entityType: "Trip",
    metadata: { format },
    request,
    userId: user.id,
  });

  if (format === "markdown" || format === "md") {
    return fileResponse(generateTripMarkdownExport(trip), {
      contentType: "text/markdown; charset=utf-8",
      fileName: generateTripExportFileName(trip.title, "md"),
    });
  }

  if (format === "html") {
    return fileResponse(generateTripPrintableHtml(trip), {
      contentDisposition: "inline",
      contentType: "text/html; charset=utf-8",
      fileName: generateTripExportFileName(trip.title, "html"),
    });
  }

  return fileResponse(JSON.stringify(generateTripJsonExport(trip), null, 2), {
    contentType: "application/json; charset=utf-8",
    fileName: generateTripExportFileName(trip.title, "json"),
  });
}

function fileResponse(
  body: string,
  {
    contentDisposition = "attachment",
    contentType,
    fileName,
  }: {
    contentDisposition?: "attachment" | "inline";
    contentType: string;
    fileName: string;
  },
) {
  return new Response(body, {
    headers: {
      "Content-Disposition": `${contentDisposition}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
