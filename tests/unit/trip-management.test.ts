import { describe, expect, it } from "vitest";
import type { ChecklistStatus } from "@prisma/client";

import {
  calculateChecklistCompletion,
  getPlaceTypeLabel,
  isValidLatitude,
  isValidLongitude,
  isValidOptionalNonNegativeInteger,
  isValidOptionalNonNegativeNumber,
  isValidOptionalRating,
  isValidOptionalHttpUrl,
  parseDateInput,
} from "@/lib/trip-management";

describe("trip management helpers", () => {
  it("validates optional http URLs", () => {
    expect(isValidOptionalHttpUrl("")).toBe(true);
    expect(isValidOptionalHttpUrl("https://example.com/guide")).toBe(true);
    expect(isValidOptionalHttpUrl("http://example.com")).toBe(true);
    expect(isValidOptionalHttpUrl("ftp://example.com")).toBe(false);
    expect(isValidOptionalHttpUrl("javascript:alert(1)")).toBe(false);
  });

  it("validates latitude and longitude inputs", () => {
    expect(isValidLatitude("35.0116")).toBe(true);
    expect(isValidLatitude("-91")).toBe(false);
    expect(isValidLongitude("135.7681")).toBe(true);
    expect(isValidLongitude("181")).toBe(false);
    expect(isValidLongitude("not-a-number")).toBe(false);
  });

  it("validates place numeric inputs", () => {
    expect(isValidOptionalNonNegativeNumber("")).toBe(true);
    expect(isValidOptionalNonNegativeNumber("120.5")).toBe(true);
    expect(isValidOptionalNonNegativeNumber("-1")).toBe(false);
    expect(isValidOptionalNonNegativeInteger("90")).toBe(true);
    expect(isValidOptionalNonNegativeInteger("90.5")).toBe(false);
    expect(isValidOptionalRating("5")).toBe(true);
    expect(isValidOptionalRating("0")).toBe(false);
    expect(isValidOptionalRating("6")).toBe(false);
  });

  it("strictly parses date inputs", () => {
    expect(parseDateInput("2026-02-28")).toBeInstanceOf(Date);
    expect(parseDateInput("2026-02-31")).toBeNull();
    expect(parseDateInput("2026/02/28")).toBeNull();
  });

  it("calculates checklist completion without skipped items", () => {
    expect(
      calculateChecklistCompletion([
        { status: "DONE" },
        { status: "TODO" },
        { status: "SKIPPED" },
      ] satisfies Array<{ status: ChecklistStatus }>),
    ).toBe(50);
    expect(
      calculateChecklistCompletion([
        { status: "SKIPPED" },
      ] satisfies Array<{ status: ChecklistStatus }>),
    ).toBe(0);
  });

  it("converts place types to Chinese labels", () => {
    expect(getPlaceTypeLabel("ATTRACTION")).toBe("景点");
    expect(getPlaceTypeLabel("RESTAURANT")).toBe("餐厅");
    expect(getPlaceTypeLabel("HOTEL")).toBe("酒店");
    expect(getPlaceTypeLabel("STATION")).toBe("车站");
    expect(getPlaceTypeLabel("AIRPORT")).toBe("机场");
    expect(getPlaceTypeLabel("STORE")).toBe("商店");
    expect(getPlaceTypeLabel("HOSPITAL")).toBe("医院");
    expect(getPlaceTypeLabel("EMBASSY")).toBe("使领馆");
    expect(getPlaceTypeLabel("EMERGENCY")).toBe("紧急地点");
    expect(getPlaceTypeLabel("OTHER")).toBe("其他");
  });
});
