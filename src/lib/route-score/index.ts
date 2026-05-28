export type RouteScoreDimension =
  | "time"
  | "cost"
  | "comfort"
  | "transfer"
  | "risk"
  | "luggage"
  | "flexibility";

export type RouteScoreWeights = Record<RouteScoreDimension, number>;

export type RouteWeightPresetId =
  | "balanced"
  | "budget"
  | "fast"
  | "easy"
  | "family"
  | "backpacker"
  | "business";

export type RouteWeightPreset = {
  id: RouteWeightPresetId;
  label: string;
  weights: RouteScoreWeights;
};

export type ScorableTransportOption = {
  id: string;
  doorToDoorMinutes: number | null;
  price: number | null;
  transferCount: number | null;
  comfortScore: number | null;
  riskScore: number | null;
  luggageFriendlyScore: number | null;
  flexibilityScore: number | null;
};

export type TransportOptionScore = {
  id: string;
  score: number;
  isIncomplete: boolean;
  missingRequiredFields: Array<"time" | "cost">;
  dimensions: Record<RouteScoreDimension, number | null>;
};

export const DEFAULT_ROUTE_SCORE_WEIGHTS: RouteScoreWeights = {
  time: 0.25,
  cost: 0.2,
  comfort: 0.15,
  transfer: 0.15,
  risk: 0.15,
  luggage: 0.05,
  flexibility: 0.05,
};

export const ROUTE_WEIGHT_PRESETS: RouteWeightPreset[] = [
  {
    id: "balanced",
    label: "综合推荐",
    weights: DEFAULT_ROUTE_SCORE_WEIGHTS,
  },
  {
    id: "budget",
    label: "省钱优先",
    weights: {
      time: 0.15,
      cost: 0.45,
      comfort: 0.1,
      transfer: 0.1,
      risk: 0.1,
      luggage: 0.05,
      flexibility: 0.05,
    },
  },
  {
    id: "fast",
    label: "省时间优先",
    weights: {
      time: 0.45,
      cost: 0.12,
      comfort: 0.12,
      transfer: 0.13,
      risk: 0.1,
      luggage: 0.03,
      flexibility: 0.05,
    },
  },
  {
    id: "easy",
    label: "少折腾优先",
    weights: {
      time: 0.18,
      cost: 0.1,
      comfort: 0.18,
      transfer: 0.3,
      risk: 0.14,
      luggage: 0.06,
      flexibility: 0.04,
    },
  },
  {
    id: "family",
    label: "老人儿童友好",
    weights: {
      time: 0.18,
      cost: 0.08,
      comfort: 0.25,
      transfer: 0.2,
      risk: 0.17,
      luggage: 0.08,
      flexibility: 0.04,
    },
  },
  {
    id: "backpacker",
    label: "背包穷游",
    weights: {
      time: 0.12,
      cost: 0.42,
      comfort: 0.08,
      transfer: 0.1,
      risk: 0.12,
      luggage: 0.08,
      flexibility: 0.08,
    },
  },
  {
    id: "business",
    label: "商务出行",
    weights: {
      time: 0.36,
      cost: 0.08,
      comfort: 0.18,
      transfer: 0.12,
      risk: 0.12,
      luggage: 0.04,
      flexibility: 0.1,
    },
  },
];

export function normalizeHigherIsBetter(
  value: number | null | undefined,
  min: number,
  max: number,
): number | null {
  if (!isFiniteNumber(value)) {
    return null;
  }

  if (max <= min) {
    return 100;
  }

  return clampScore(((value - min) / (max - min)) * 100);
}

export function normalizeLowerIsBetter(
  value: number | null | undefined,
  min: number,
  max: number,
): number | null {
  if (!isFiniteNumber(value)) {
    return null;
  }

  if (max <= min) {
    return 100;
  }

  return clampScore(((max - value) / (max - min)) * 100);
}

export function normalizeWeights(
  weights: Partial<RouteScoreWeights> | null | undefined,
): RouteScoreWeights {
  const merged = { ...DEFAULT_ROUTE_SCORE_WEIGHTS, ...weights };
  const sanitized = Object.fromEntries(
    routeScoreDimensions.map((key) => [
      key,
      Math.max(isFiniteNumber(merged[key]) ? merged[key] : 0, 0),
    ]),
  ) as RouteScoreWeights;
  const sum = sumWeights(sanitized);

  if (sum <= 0) {
    return DEFAULT_ROUTE_SCORE_WEIGHTS;
  }

  return Object.fromEntries(
    routeScoreDimensions.map((key) => [key, sanitized[key] / sum]),
  ) as RouteScoreWeights;
}

export function scoreTransportOptions(
  options: ScorableTransportOption[],
  weights?: Partial<RouteScoreWeights> | null,
): TransportOptionScore[] {
  const normalizedWeights = normalizeWeights(weights);
  const ranges = buildRanges(options);

  return options
    .map((option) => scoreTransportOption(option, ranges, normalizedWeights))
    .sort((left, right) => right.score - left.score);
}

export function getRouteWeightPreset(
  presetId: string | null | undefined,
): RouteWeightPreset {
  return (
    ROUTE_WEIGHT_PRESETS.find((preset) => preset.id === presetId) ??
    ROUTE_WEIGHT_PRESETS[0]
  );
}

export function findMatchingRouteWeightPreset(
  weights: Partial<RouteScoreWeights> | null | undefined,
): RouteWeightPreset | null {
  const normalized = normalizeWeights(weights);

  return (
    ROUTE_WEIGHT_PRESETS.find((preset) =>
      routeScoreDimensions.every(
        (key) => Math.abs(normalized[key] - normalizeWeights(preset.weights)[key]) < 0.0001,
      ),
    ) ?? null
  );
}

function scoreTransportOption(
  option: ScorableTransportOption,
  ranges: Record<RouteScoreDimension, Range>,
  weights: RouteScoreWeights,
): TransportOptionScore {
  const dimensions: Record<RouteScoreDimension, number | null> = {
    time: normalizeLowerIsBetter(
      option.doorToDoorMinutes,
      ranges.time.min,
      ranges.time.max,
    ),
    cost: normalizeLowerIsBetter(option.price, ranges.cost.min, ranges.cost.max),
    comfort: normalizeHigherIsBetter(option.comfortScore, 0, 100),
    transfer: normalizeLowerIsBetter(
      option.transferCount,
      ranges.transfer.min,
      ranges.transfer.max,
    ),
    risk: normalizeHigherIsBetter(
      isFiniteNumber(option.riskScore) ? 100 - option.riskScore : null,
      0,
      100,
    ),
    luggage: normalizeHigherIsBetter(option.luggageFriendlyScore, 0, 100),
    flexibility: normalizeHigherIsBetter(option.flexibilityScore, 0, 100),
  };
  const usableWeightSum = routeScoreDimensions.reduce(
    (sum, key) => sum + (dimensions[key] === null ? 0 : weights[key]),
    0,
  );
  const score =
    usableWeightSum > 0
      ? routeScoreDimensions.reduce(
          (sum, key) =>
            sum + ((dimensions[key] ?? 0) * weights[key]) / usableWeightSum,
          0,
        )
      : 0;
  const missingRequiredFields: Array<"time" | "cost"> = [];

  if (dimensions.time === null) {
    missingRequiredFields.push("time");
  }

  if (dimensions.cost === null) {
    missingRequiredFields.push("cost");
  }

  return {
    id: option.id,
    score: Math.round(score),
    isIncomplete: missingRequiredFields.length > 0,
    missingRequiredFields,
    dimensions,
  };
}

function buildRanges(
  options: ScorableTransportOption[],
): Record<RouteScoreDimension, Range> {
  return {
    time: range(options.map((option) => option.doorToDoorMinutes)),
    cost: range(options.map((option) => option.price)),
    comfort: { min: 0, max: 100 },
    transfer: range(options.map((option) => option.transferCount)),
    risk: { min: 0, max: 100 },
    luggage: { min: 0, max: 100 },
    flexibility: { min: 0, max: 100 },
  };
}

function range(values: Array<number | null | undefined>): Range {
  const finiteValues = values.filter(isFiniteNumber);

  if (finiteValues.length === 0) {
    return { min: 0, max: 0 };
  }

  return {
    min: Math.min(...finiteValues),
    max: Math.max(...finiteValues),
  };
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sumWeights(weights: RouteScoreWeights): number {
  return routeScoreDimensions.reduce((sum, key) => sum + weights[key], 0);
}

type Range = {
  min: number;
  max: number;
};

const routeScoreDimensions: RouteScoreDimension[] = [
  "time",
  "cost",
  "comfort",
  "transfer",
  "risk",
  "luggage",
  "flexibility",
];
