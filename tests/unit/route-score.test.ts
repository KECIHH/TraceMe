import { describe, expect, it } from "vitest";

import {
  getRouteWeightPreset,
  normalizeHigherIsBetter,
  normalizeLowerIsBetter,
  normalizeWeights,
  ROUTE_WEIGHT_PRESETS,
  scoreTransportOptions,
} from "@/lib/route-score";

const baseOption = {
  id: "base",
  doorToDoorMinutes: 120,
  price: 100,
  transferCount: 1,
  comfortScore: 70,
  riskScore: 20,
  luggageFriendlyScore: 70,
  flexibilityScore: 60,
};

describe("route scoring", () => {
  it("normalizes lower-is-better values", () => {
    expect(normalizeLowerIsBetter(10, 10, 30)).toBe(100);
    expect(normalizeLowerIsBetter(30, 10, 30)).toBe(0);
    expect(normalizeLowerIsBetter(20, 10, 30)).toBe(50);
  });

  it("normalizes higher-is-better values", () => {
    expect(normalizeHigherIsBetter(10, 10, 30)).toBe(0);
    expect(normalizeHigherIsBetter(30, 10, 30)).toBe(100);
    expect(normalizeHigherIsBetter(20, 10, 30)).toBe(50);
  });

  it("normalizes weights to a sum of 1", () => {
    const weights = normalizeWeights({
      time: 2,
      cost: 2,
      comfort: 1,
      transfer: 0,
      risk: 0,
      luggage: 0,
      flexibility: 0,
    });
    const sum = Object.values(weights).reduce((total, value) => total + value, 0);

    expect(sum).toBeCloseTo(1);
    expect(weights.time).toBeCloseTo(2 / 5);
    expect(weights.cost).toBeCloseTo(2 / 5);
  });

  it("falls back to default weights when all custom weights are zero", () => {
    expect(
      normalizeWeights({
        time: 0,
        cost: 0,
        comfort: 0,
        transfer: 0,
        risk: 0,
        luggage: 0,
        flexibility: 0,
      }),
    ).toEqual(ROUTE_WEIGHT_PRESETS[0].weights);
  });

  it("scores a single option", () => {
    const [score] = scoreTransportOptions([baseOption]);

    expect(score.id).toBe("base");
    expect(score.score).toBeGreaterThan(70);
    expect(score.isIncomplete).toBe(false);
  });

  it("sorts multiple options by score", () => {
    const scores = scoreTransportOptions([
      {
        ...baseOption,
        id: "slow-expensive",
        doorToDoorMinutes: 300,
        price: 800,
        transferCount: 3,
        comfortScore: 45,
        riskScore: 50,
      },
      {
        ...baseOption,
        id: "fast-cheap",
        doorToDoorMinutes: 90,
        price: 80,
        transferCount: 0,
        comfortScore: 80,
        riskScore: 10,
      },
    ]);

    expect(scores[0].id).toBe("fast-cheap");
    expect(scores[1].id).toBe("slow-expensive");
  });

  it("converts risk degree into a safety score", () => {
    const scores = scoreTransportOptions(
      [
        { ...baseOption, id: "low-risk", riskScore: 10 },
        { ...baseOption, id: "high-risk", riskScore: 90 },
      ],
      { risk: 1, time: 0, cost: 0, comfort: 0, transfer: 0, luggage: 0, flexibility: 0 },
    );

    expect(scores[0].id).toBe("low-risk");
    expect(scores[0].dimensions.risk).toBe(90);
    expect(scores[1].dimensions.risk).toBe(10);
  });

  it("exposes preset weights", () => {
    expect(ROUTE_WEIGHT_PRESETS.map((preset) => preset.label)).toEqual([
      "综合推荐",
      "省钱优先",
      "省时间优先",
      "少折腾优先",
      "老人儿童友好",
      "背包穷游",
      "商务出行",
    ]);
    expect(getRouteWeightPreset("budget").weights.cost).toBeGreaterThan(
      getRouteWeightPreset("budget").weights.time,
    );
  });

  it("marks missing time or cost as incomplete", () => {
    const [score] = scoreTransportOptions([
      { ...baseOption, doorToDoorMinutes: null, price: null },
    ]);

    expect(score.isIncomplete).toBe(true);
    expect(score.missingRequiredFields).toEqual(["time", "cost"]);
  });

  it("handles options where every candidate is missing time and cost", () => {
    const scores = scoreTransportOptions([
      { ...baseOption, id: "first", doorToDoorMinutes: null, price: null },
      { ...baseOption, id: "second", doorToDoorMinutes: null, price: null },
    ]);

    expect(scores).toHaveLength(2);
    expect(scores.every((score) => score.isIncomplete)).toBe(true);
    expect(scores.every((score) => Number.isFinite(score.score))).toBe(true);
  });
});
