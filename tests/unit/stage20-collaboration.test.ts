import { describe, expect, it } from "vitest";

import {
  buildTripAccess,
  canAccessDocument,
  canTripRole,
  filterPublicDocuments,
  filterPublicPlace,
  hashSharePassword,
  isTripMemberRole,
  shouldShareLinkBeAccessible,
  verifySharePassword,
} from "@/lib/collaboration";

describe("trip collaboration permissions", () => {
  it("maps member roles to expected capabilities", () => {
    expect(canTripRole("OWNER", "manageMembers")).toBe(true);
    expect(canTripRole("OWNER", "delete")).toBe(true);
    expect(canTripRole("EDITOR", "edit")).toBe(true);
    expect(canTripRole("EDITOR", "manageMembers")).toBe(false);
    expect(canTripRole("VIEWER", "read")).toBe(true);
    expect(canTripRole("VIEWER", "edit")).toBe(false);
  });

  it("recognizes valid member roles", () => {
    expect(isTripMemberRole("OWNER")).toBe(true);
    expect(isTripMemberRole("EDITOR")).toBe(true);
    expect(isTripMemberRole("VIEWER")).toBe(true);
    expect(isTripMemberRole("GUEST")).toBe(false);
  });

  it("allows sensitive document access only with explicit permission", () => {
    const viewer = buildTripAccess({
      canDownloadSensitiveDocuments: false,
      role: "VIEWER",
    });
    const authorizedViewer = buildTripAccess({
      canDownloadSensitiveDocuments: true,
      role: "VIEWER",
    });

    expect(canAccessDocument(viewer, { isSensitive: false })).toBe(true);
    expect(canAccessDocument(viewer, { isSensitive: true })).toBe(false);
    expect(canAccessDocument(authorizedViewer, { isSensitive: true })).toBe(true);
  });
});

describe("share link safety", () => {
  it("rejects disabled, revoked, and expired share links", () => {
    const now = new Date("2026-05-30T10:00:00.000Z");

    expect(
      shouldShareLinkBeAccessible(
        {
          expiresAt: null,
          isEnabled: false,
          passwordHash: null,
          revokedAt: null,
        },
        now,
      ),
    ).toEqual({ ok: false, reason: "disabled" });
    expect(
      shouldShareLinkBeAccessible(
        {
          expiresAt: null,
          isEnabled: true,
          passwordHash: null,
          revokedAt: new Date("2026-05-30T09:00:00.000Z"),
        },
        now,
      ),
    ).toEqual({ ok: false, reason: "revoked" });
    expect(
      shouldShareLinkBeAccessible(
        {
          expiresAt: now,
          isEnabled: true,
          passwordHash: null,
          revokedAt: null,
        },
        now,
      ),
    ).toEqual({ ok: false, reason: "expired" });
  });

  it("reports when a valid link requires a password", () => {
    expect(
      shouldShareLinkBeAccessible({
        expiresAt: new Date("2026-05-31T10:00:00.000Z"),
        isEnabled: true,
        passwordHash: "hashed",
        revokedAt: null,
      }),
    ).toEqual({ ok: true, requiresPassword: true });
  });

  it("verifies share passwords without accepting missing or wrong values", () => {
    const passwordHash = hashSharePassword("correct horse battery");

    expect(verifySharePassword("", passwordHash)).toEqual({
      ok: false,
      reason: "missing_password",
    });
    expect(verifySharePassword("wrong", passwordHash)).toEqual({
      ok: false,
      reason: "wrong_password",
    });
    expect(verifySharePassword("correct horse battery", passwordHash)).toEqual({
      ok: true,
    });
  });
});

describe("public share filtering", () => {
  it("filters sensitive documents and sensitive document types", () => {
    const documents = [
      {
        id: "doc_public",
        isSensitive: false,
        mimeType: "text/plain",
        originalFileName: "notes.txt",
        title: "Public notes",
        type: "OTHER",
      },
      {
        id: "doc_passport",
        isSensitive: false,
        mimeType: "application/pdf",
        originalFileName: "passport.pdf",
        title: "Passport",
        type: "PASSPORT",
      },
      {
        id: "doc_sensitive",
        isSensitive: true,
        mimeType: "application/pdf",
        originalFileName: "ticket.pdf",
        title: "Ticket",
        type: "OTHER",
      },
    ] as Parameters<typeof filterPublicDocuments>[0];

    expect(filterPublicDocuments(documents)).toEqual([
      {
        id: "doc_public",
        mimeType: "text/plain",
        originalFileName: "notes.txt",
        title: "Public notes",
        type: "OTHER",
      },
    ]);
  });

  it("removes lodging booking references from public places", () => {
    const place = filterPublicPlace({
      address: "1 Demo Road",
      createdAt: new Date("2026-05-30T00:00:00.000Z"),
      destinationId: null,
      estimatedCost: null,
      estimatedDurationMin: null,
      id: "place_1",
      lastCheckedAt: null,
      latitude: null,
      longitude: null,
      name: "Demo Hotel",
      notes: null,
      openingHours: null,
      phone: null,
      priceLevel: null,
      priority: "MEDIUM",
      ratingPersonal: null,
      sourceName: null,
      sourceUrl: null,
      stayDetail: {
        bookingReference: "SECRET-ORDER-123",
        breakfastIncluded: true,
        cancellationPolicy: "Free",
        checkInDate: null,
        checkOutDate: null,
        createdAt: new Date("2026-05-30T00:00:00.000Z"),
        id: "stay_1",
        luggageStorage: true,
        notes: null,
        placeId: "place_1",
        totalCost: null,
        bookingStatus: "RESERVED",
        updatedAt: new Date("2026-05-30T00:00:00.000Z"),
      },
      tags: null,
      tripId: "trip_1",
      type: "HOTEL",
      updatedAt: new Date("2026-05-30T00:00:00.000Z"),
      website: null,
    });

    expect(place.stayDetail).not.toHaveProperty("bookingReference");
  });
});
