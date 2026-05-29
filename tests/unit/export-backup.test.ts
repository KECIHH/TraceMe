import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  escapeHtml,
  generateTripJsonExport,
  generateTripMarkdownExport,
  generateTripPrintableHtml,
  type TripExportSource,
} from "@/lib/export/trip";
import {
  formatBackupFileSize,
  generateBackupFileName,
  generateBackupManifest,
  resolveBackupPath,
} from "@/lib/backup";

describe("trip export generation", () => {
  it("generates a complete JSON export structure without document contents", () => {
    const exported = generateTripJsonExport(sampleTrip(), fixedDate);

    expect(exported).toMatchObject({
      exportType: "trip",
      exportedAt: "2026-05-29T01:02:03.000Z",
      schemaVersion: 1,
    });
    expect(exported.trip).toMatchObject({
      title: "Kyoto <Spring>",
      destinations: [{ name: "Kyoto" }],
      places: [
        expect.objectContaining({
          foodDetail: expect.objectContaining({ notes: "Try tofu" }),
          stayDetail: expect.objectContaining({ bookingReference: "ABC123" }),
        }),
      ],
      documents: [
        expect.objectContaining({
          filePath: "ticket.pdf",
          originalFileName: "ticket.pdf",
          title: "Ticket",
        }),
      ],
    });
    expect(JSON.stringify(exported)).not.toContain("%PDF");
  });

  it("generates Markdown with the expected travel sections", () => {
    const markdown = generateTripMarkdownExport(sampleTrip());

    expect(markdown).toContain("# Kyoto <Spring>");
    expect(markdown).toContain("## 每日行程");
    expect(markdown).toContain("## 交通方案");
    expect(markdown).toContain("## 住宿");
    expect(markdown).toContain("## 美食");
    expect(markdown).toContain("## 准备清单");
    expect(markdown).toContain("## 预算花销");
    expect(markdown).toContain("## 注意事项");
    expect(markdown).toContain("## 笔记");
  });

  it("escapes printable HTML to avoid injection", () => {
    const html = generateTripPrintableHtml(sampleTrip());

    expect(escapeHtml("<script>alert('x')</script>")).toBe(
      "&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;",
    );
    expect(html).toContain("Kyoto &lt;Spring&gt;");
    expect(html).toContain("window.print()");
    expect(html).not.toContain("<script>alert");
  });
});

describe("backup helpers", () => {
  it("generates backup file names", () => {
    expect(generateBackupFileName(fixedLocalDate)).toBe(
      "travel-planner-backup-20260529-010203.zip",
    );
  });

  it("generates backup manifests", () => {
    const manifest = generateBackupManifest({
      createdAt: fixedDate,
      files: [{ path: "database/dev.db", size: 1024 }],
    });

    expect(manifest).toMatchObject({
      app: "TraceMe",
      createdAt: "2026-05-29T01:02:03.000Z",
      format: "zip",
      schemaVersion: 1,
    });
    expect(manifest.excluded).toContain(".env");
    expect(manifest.files).toEqual([{ path: "database/dev.db", size: 1024 }]);
    expect(manifest.privacyWarning).toContain("AI");
  });

  it("formats backup file sizes", () => {
    expect(formatBackupFileSize(0)).toBe("0 B");
    expect(formatBackupFileSize(512)).toBe("512 B");
    expect(formatBackupFileSize(1024)).toBe("1.0 KB");
    expect(formatBackupFileSize(1024 * 1024 * 2)).toBe("2.0 MB");
  });

  it("rejects unsafe backup paths", () => {
    expect(() => resolveBackupPath("../backup.zip")).toThrow(
      "Unsafe backup file name.",
    );
    expect(() => resolveBackupPath("nested/backup.zip")).toThrow(
      "Unsafe backup file name.",
    );
    expect(resolveBackupPath("travel-planner-backup-20260529-010203.zip")).toContain(
      "storage",
    );
  });
});

const fixedDate = new Date("2026-05-29T01:02:03.000Z");
const fixedLocalDate = new Date(2026, 4, 29, 1, 2, 3);

function sampleTrip(): TripExportSource {
  return {
    baseCurrency: "CNY",
    budgetAmount: new Prisma.Decimal(12000),
    categoryBudgets: [],
    checklistItems: [
      {
        category: "证件",
        createdAt: fixedDate,
        dueDate: null,
        id: "check-1",
        importance: "HIGH",
        notes: null,
        quantity: 1,
        status: "DONE",
        title: "Passport",
        tripId: "trip-1",
        updatedAt: fixedDate,
      },
    ],
    coverImage: null,
    createdAt: fixedDate,
    description: "Spring trip",
    destinations: [
      {
        arrivalDate: fixedDate,
        country: "Japan",
        createdAt: fixedDate,
        departureDate: fixedDate,
        id: "dest-1",
        latitude: null,
        longitude: null,
        name: "Kyoto",
        notes: null,
        region: null,
        timezone: "Asia/Tokyo",
        tripId: "trip-1",
        updatedAt: fixedDate,
      },
    ],
    documents: [
      {
        createdAt: fixedDate,
        filePath: "ticket.pdf",
        fileSize: 100,
        id: "doc-1",
        isEncrypted: false,
        isSensitive: true,
        mimeType: "application/pdf",
        notes: null,
        originalFileName: "ticket.pdf",
        relatedDate: fixedDate,
        title: "Ticket",
        tripId: "trip-1",
        type: "ITINERARY",
        updatedAt: fixedDate,
      },
    ],
    endDate: fixedDate,
    expenses: [
      {
        amount: new Prisma.Decimal(80),
        category: "餐饮",
        createdAt: fixedDate,
        currency: "CNY",
        exchangeRate: null,
        id: "expense-1",
        notes: null,
        paidAt: fixedDate,
        payer: null,
        relatedPlaceId: null,
        splitWith: null,
        title: "Lunch",
        tripId: "trip-1",
        updatedAt: fixedDate,
      },
    ],
    homeCity: "Shanghai",
    id: "trip-1",
    itineraryDays: [
      {
        city: "Kyoto",
        createdAt: fixedDate,
        date: fixedDate,
        id: "day-1",
        items: [
          {
            bookingStatus: "BOOKED",
            costEstimate: new Prisma.Decimal(50),
            createdAt: fixedDate,
            dayId: "day-1",
            durationMin: 60,
            endTime: fixedDate,
            id: "item-1",
            notes: "Arrive early",
            place: {
              address: "Market street",
              id: "place-1",
              name: "Nishiki Market",
              type: "RESTAURANT",
            },
            placeId: "place-1",
            priority: "HIGH",
            sortOrder: 1,
            startTime: fixedDate,
            status: "PLANNED",
            title: "Market lunch",
            transportToNext: null,
            tripId: "trip-1",
            type: "DINING",
            updatedAt: fixedDate,
          },
        ],
        notes: null,
        theme: "Food",
        title: "Day 1",
        tripId: "trip-1",
        updatedAt: fixedDate,
        weatherSummary: null,
      },
    ],
    itineraryItems: [],
    mainDestination: "Kyoto",
    notes: [
      {
        content: "Book early",
        createdAt: fixedDate,
        id: "note-1",
        sourceUrl: null,
        tags: ["booking"],
        title: "Tips",
        tripId: "trip-1",
        updatedAt: fixedDate,
      },
    ],
    places: [
      {
        address: "Market street",
        createdAt: fixedDate,
        destination: { id: "dest-1", name: "Kyoto" },
        destinationId: "dest-1",
        estimatedCost: new Prisma.Decimal(80),
        estimatedDurationMin: 60,
        foodDetail: {
          averageCost: new Prisma.Decimal(80),
          createdAt: fixedDate,
          foodStatus: "WANT_TO_TRY",
          id: "food-1",
          notes: "Try tofu",
          placeId: "place-1",
          recommendedDishes: ["tofu"],
          reservationNeeded: false,
          updatedAt: fixedDate,
        },
        id: "place-1",
        lastCheckedAt: null,
        latitude: null,
        longitude: null,
        name: "Nishiki Market",
        notes: null,
        openingHours: null,
        phone: null,
        priceLevel: null,
        priority: "HIGH",
        ratingPersonal: null,
        sourceName: null,
        sourceUrl: null,
        stayDetail: {
          bookingReference: "ABC123",
          bookingStatus: "RESERVED",
          breakfastIncluded: true,
          cancellationPolicy: null,
          checkInDate: fixedDate,
          checkOutDate: fixedDate,
          createdAt: fixedDate,
          id: "stay-1",
          luggageStorage: true,
          notes: "Late check-in",
          placeId: "place-1",
          totalCost: new Prisma.Decimal(1000),
          updatedAt: fixedDate,
        },
        tags: ["food"],
        tripId: "trip-1",
        type: "RESTAURANT",
        updatedAt: fixedDate,
        website: null,
      },
    ],
    routePlans: [
      {
        createdAt: fixedDate,
        departDate: fixedDate,
        fromName: "Shanghai",
        id: "route-1",
        notes: null,
        resultJson: null,
        selectedOption: null,
        selectedOptionId: null,
        title: "Flight",
        toName: "Kyoto",
        transportOptions: [],
        tripId: "trip-1",
        updatedAt: fixedDate,
        weights: null,
      },
    ],
    startDate: fixedDate,
    status: "PLANNING",
    title: "Kyoto <Spring>",
    transports: [
      {
        arriveTime: fixedDate,
        bookingUrl: null,
        comfortScore: 4,
        createdAt: fixedDate,
        currency: "CNY",
        departTime: fixedDate,
        doorToDoorMinutes: 120,
        flexibilityScore: 3,
        fromName: "Shanghai",
        id: "transport-1",
        luggageFriendlyScore: 3,
        mode: "FLIGHT",
        notes: null,
        price: new Prisma.Decimal(1200),
        provider: "Air",
        riskScore: 2,
        routePlanId: null,
        status: "CANDIDATE",
        toName: "Kyoto",
        trainOrFlightNo: "MU1",
        transferCount: 0,
        tripId: "trip-1",
        updatedAt: fixedDate,
      },
    ],
    updatedAt: fixedDate,
  } as unknown as TripExportSource;
}
