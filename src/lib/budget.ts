export const BUDGET_CATEGORIES = [
  "交通",
  "住宿",
  "餐饮",
  "门票",
  "购物",
  "市内交通",
  "保险",
  "通信",
  "签证证件",
  "其他",
] as const;

export type BudgetCategory = (typeof BUDGET_CATEGORIES)[number];

export type ExpenseForBudget = {
  amount: number | string | { toString(): string };
  category?: string | null;
  currency: string;
  exchangeRate?: number | string | { toString(): string } | null;
};

export type CategoryBudgetForStats = {
  amount: number | string | { toString(): string };
  category: string;
};

export type CurrencyTotal = {
  amount: number;
  currency: string;
};

export type CategoryTotal = {
  budget: number;
  convertedSpent: number;
  name: string;
  originalTotals: CurrencyTotal[];
};

export function normalizeExpenseCategory(value: string | null | undefined): string {
  const category = value?.trim();
  return category && BUDGET_CATEGORIES.includes(category as BudgetCategory)
    ? category
    : "其他";
}

export function isValidNonNegativeAmount(value: string): boolean {
  const amount = Number(value);
  return value.trim() !== "" && Number.isFinite(amount) && amount >= 0;
}

export function isValidOptionalNonNegativeAmount(value: string): boolean {
  if (!value.trim()) {
    return true;
  }

  return isValidNonNegativeAmount(value);
}

export function isValidOptionalPositiveRate(value: string): boolean {
  if (!value.trim()) {
    return true;
  }

  const rate = Number(value);
  return Number.isFinite(rate) && rate > 0;
}

export function isValidCurrencyCode(value: string): boolean {
  return /^[A-Z]{3}$/i.test(value.trim());
}

export function convertExpenseToBase(
  expense: ExpenseForBudget,
  baseCurrency: string,
): number | null {
  const amount = toNumber(expense.amount);
  const currency = expense.currency.trim().toUpperCase();
  const normalizedBaseCurrency = baseCurrency.trim().toUpperCase();

  if (!Number.isFinite(amount)) {
    return null;
  }

  if (currency === normalizedBaseCurrency) {
    return roundMoney(amount);
  }

  const exchangeRate = toOptionalNumber(expense.exchangeRate);

  if (exchangeRate === null || exchangeRate <= 0) {
    return null;
  }

  return roundMoney(amount * exchangeRate);
}

export function calculateConvertedSpent(
  expenses: ExpenseForBudget[],
  baseCurrency: string,
): number {
  return roundMoney(
    expenses.reduce((total, expense) => {
      const converted = convertExpenseToBase(expense, baseCurrency);
      return converted === null ? total : total + converted;
    }, 0),
  );
}

export function calculateUnconvertedTotals(
  expenses: ExpenseForBudget[],
  baseCurrency: string,
): CurrencyTotal[] {
  const totals: CurrencyTotal[] = [];

  for (const expense of expenses) {
    if (convertExpenseToBase(expense, baseCurrency) !== null) {
      continue;
    }

    addOriginalTotal(totals, expense.currency, toNumber(expense.amount));
  }

  return totals;
}

export function calculateRemainingBudget(
  totalBudget: number | string | { toString(): string } | null | undefined,
  convertedSpent: number,
): number | null {
  if (totalBudget === null || totalBudget === undefined || totalBudget === "") {
    return null;
  }

  const budget = toNumber(totalBudget);

  if (!Number.isFinite(budget)) {
    return null;
  }

  return roundMoney(budget - convertedSpent);
}

export function calculateBudgetUsagePercent(
  totalBudget: number | string | { toString(): string } | null | undefined,
  convertedSpent: number,
): number {
  if (totalBudget === null || totalBudget === undefined || totalBudget === "") {
    return 0;
  }

  const budget = toNumber(totalBudget);

  if (!Number.isFinite(budget) || budget <= 0) {
    return 0;
  }

  return Math.round((convertedSpent / budget) * 100);
}

export function calculateCategoryTotals(
  expenses: ExpenseForBudget[],
  categoryBudgets: CategoryBudgetForStats[],
  baseCurrency: string,
): CategoryTotal[] {
  const totals = new Map<string, CategoryTotal>();

  for (const category of BUDGET_CATEGORIES) {
    totals.set(category, {
      budget: 0,
      convertedSpent: 0,
      name: category,
      originalTotals: [],
    });
  }

  for (const budget of categoryBudgets) {
    const category = normalizeExpenseCategory(budget.category);
    const total = ensureCategoryTotal(totals, category);
    total.budget = roundMoney(toNumber(budget.amount));
  }

  for (const expense of expenses) {
    const category = normalizeExpenseCategory(expense.category);
    const total = ensureCategoryTotal(totals, category);
    const converted = convertExpenseToBase(expense, baseCurrency);

    if (converted === null) {
      addOriginalTotal(total.originalTotals, expense.currency, toNumber(expense.amount));
    } else {
      total.convertedSpent = roundMoney(total.convertedSpent + converted);
    }
  }

  return Array.from(totals.values()).filter(
    (total) =>
      total.budget > 0 ||
      total.convertedSpent > 0 ||
      total.originalTotals.length > 0,
  );
}

export function formatMoney(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString("zh-CN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  })}`;
}

function ensureCategoryTotal(
  totals: Map<string, CategoryTotal>,
  category: string,
): CategoryTotal {
  const existing = totals.get(category);

  if (existing) {
    return existing;
  }

  const created = {
    budget: 0,
    convertedSpent: 0,
    name: category,
    originalTotals: [],
  };
  totals.set(category, created);
  return created;
}

function addOriginalTotal(
  totals: CurrencyTotal[],
  currency: string,
  amount: number,
) {
  const normalizedCurrency = currency.trim().toUpperCase() || "CNY";
  const existing = totals.find((total) => total.currency === normalizedCurrency);

  if (existing) {
    existing.amount = roundMoney(existing.amount + amount);
    return;
  }

  totals.push({ amount: roundMoney(amount), currency: normalizedCurrency });
}

function toOptionalNumber(
  value: number | string | { toString(): string } | null | undefined,
): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = toNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNumber(value: number | string | { toString(): string }): number {
  return Number(value.toString());
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
