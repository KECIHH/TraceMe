import type { Prisma } from "@prisma/client";
import { notFound } from "next/navigation";

import { SubmitButton } from "@/components/submit-button";
import { formatDisplayDate, formatEmptyValue } from "@/lib/display-format";
import {
  BUDGET_CATEGORIES,
  calculateBudgetUsagePercent,
  calculateCategoryTotals,
  calculateConvertedSpent,
  calculateRemainingBudget,
  calculateUnconvertedTotals,
  convertExpenseToBase,
  formatMoney,
  normalizeExpenseCategory,
} from "@/lib/budget";
import {
  dedupeLatestRatesByPair,
  formatRateMeta,
  isExchangeRateExpired,
  normalizeCurrencyCode,
} from "@/lib/external/exchange";
import { getExchangeRateProviderHealth } from "@/lib/external/providers";
import { prisma } from "@/lib/prisma";
import { toDateInputValue } from "@/lib/trip-management";

import {
  createExpenseAction,
  deleteExpenseAction,
  updateBudgetAction,
  updateExpenseAction,
} from "../actions";
import { ConfirmSubmitButton } from "../confirm-submit-button";
import {
  refreshExchangeRatesAction,
  saveManualExchangeRateAction,
} from "../external-actions";
import { Notice, TripModuleNav } from "../module-nav";

type BudgetPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string; message?: string }>;
};

type ExpenseWithPlace = Prisma.ExpenseGetPayload<{
  include: { relatedPlace: true };
}>;

type PlaceOption = {
  id: string;
  name: string;
};

export default async function BudgetPage({
  params,
  searchParams,
}: BudgetPageProps) {
  const { id } = await params;
  const queryParams = (await searchParams) ?? {};
  const trip = await prisma.trip.findUnique({
    include: {
      categoryBudgets: { orderBy: { category: "asc" } },
      expenses: {
        include: { relatedPlace: true },
        orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      },
      currencyRates: {
        orderBy: [{ fetchedAt: "desc" }],
        take: 50,
      },
      places: {
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      },
    },
    where: { id },
  });

  if (!trip) {
    notFound();
  }

  const baseCurrency = trip.baseCurrency || "CNY";
  const convertedSpent = calculateConvertedSpent(trip.expenses, baseCurrency);
  const unconvertedTotals = calculateUnconvertedTotals(
    trip.expenses,
    baseCurrency,
  );
  const remainingBudget = calculateRemainingBudget(
    trip.budgetAmount,
    convertedSpent,
  );
  const usagePercent = calculateBudgetUsagePercent(
    trip.budgetAmount,
    convertedSpent,
  );
  const categoryTotals = calculateCategoryTotals(
    trip.expenses,
    trip.categoryBudgets,
    baseCurrency,
  );
  const categoryBudgetMap = new Map(
    trip.categoryBudgets.map((budget) => [budget.category, String(budget.amount)]),
  );
  const largestExpenses = [...trip.expenses]
    .filter((expense) => convertExpenseToBase(expense, baseCurrency) !== null)
    .sort((left, right) => {
      const leftAmount = convertExpenseToBase(left, baseCurrency) ?? 0;
      const rightAmount = convertExpenseToBase(right, baseCurrency) ?? 0;
      return rightAmount - leftAmount;
    })
    .slice(0, 5);
  const createExpense = createExpenseAction.bind(null, trip.id);
  const updateBudget = updateBudgetAction.bind(null, trip.id);
  const refreshRates = refreshExchangeRatesAction.bind(null, trip.id);
  const saveManualRate = saveManualExchangeRateAction.bind(null, trip.id);
  const rateProvider = getExchangeRateProviderHealth();
  const latestCurrencyRates = dedupeLatestRatesByPair(trip.currencyRates).slice(0, 12);
  const foreignCurrencies = Array.from(
    new Set(
      trip.expenses
        .map((expense) => normalizeCurrencyCode(expense.currency))
        .filter((currency) => currency !== baseCurrency),
    ),
  );

  return (
    <section className="space-y-6">
      <TripModuleNav active="budget" tripId={trip.id} tripTitle={trip.title} />
      <Notice error={queryParams.error} message={queryParams.message} />

      <div>
        <p className="text-sm font-semibold text-[#2f6f73]">预算</p>
        <h1 className="mt-2 text-3xl font-semibold">预算与花销</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5d6972]">
          记录总预算、分类预算和实际支出。汇率仅为记录用途，请以实际支付为准。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="总预算"
          value={
            trip.budgetAmount
              ? formatMoney(Number(trip.budgetAmount), baseCurrency)
              : formatEmptyValue(null)
          }
        />
        <SummaryCard
          label="已花费（已折算）"
          value={formatMoney(convertedSpent, baseCurrency)}
        />
        <SummaryCard
          label="剩余预算（已折算）"
          value={
            remainingBudget === null
              ? formatEmptyValue(null)
              : formatMoney(remainingBudget, baseCurrency)
          }
        />
        <SummaryCard label="使用比例（已折算）" value={`${usagePercent}%`} />
      </div>

      {unconvertedTotals.length > 0 ? (
        <p className="rounded-md border border-[#e0d9cc] bg-[#fbfaf7] px-4 py-3 text-sm leading-6 text-[#5d6972]">
          另有未折算支出：
          {unconvertedTotals
            .map((item) => formatMoney(item.amount, item.currency))
            .join("，")}
          。这些金额未计入剩余预算和使用比例；汇率仅为记录用途，请以实际支付为准。
        </p>
      ) : null}

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold">汇率</h2>
            <p className="mt-2 text-sm leading-6 text-[#5d6972]">
              {rateProvider.message} 汇率仅作为记录用途，请以实际支付为准。
            </p>
          </div>
          <form action={refreshRates}>
            <SubmitButton
              className={secondaryButtonClassName}
              data-testid="refresh-exchange-rates"
              pendingLabel="更新中..."
            >
              自动更新汇率
            </SubmitButton>
          </form>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {latestCurrencyRates.length === 0 ? (
            <p className="rounded-md border border-dashed border-[#b8c8c4] p-4 text-sm text-[#5d6972]">
              暂无汇率缓存。可自动更新，或手动填写汇率。
            </p>
          ) : (
            latestCurrencyRates.map((rate) => (
              <div
                className="rounded-md border border-[#e0d9cc] bg-[#fbfaf7] p-3 text-sm"
                data-testid="currency-rate-card"
                key={rate.id}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-[#34434c]">
                    1 {rate.baseCurrency} = {Number(rate.rate).toFixed(4)} {rate.targetCurrency}
                  </span>
                  <span className="rounded-full bg-[#edf4f1] px-2 py-1 text-xs font-medium text-[#2f6f73]">
                    {isExchangeRateExpired(rate.fetchedAt) ? "可能过期" : "缓存可用"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-[#7a858c]">
                  {formatRateMeta(rate)}
                </p>
              </div>
            ))
          )}
        </div>
        <form action={saveManualRate} className="mt-4 grid gap-4 md:grid-cols-4">
          <Field label="原币种">
            <input
              className={inputClassName}
              defaultValue={foreignCurrencies[0] ?? ""}
              maxLength={3}
              name="baseCurrency"
              placeholder="USD"
            />
          </Field>
          <Field label="目标币种">
            <input
              className={inputClassName}
              defaultValue={baseCurrency}
              maxLength={3}
              name="targetCurrency"
            />
          </Field>
          <Field label="汇率">
            <input
              className={inputClassName}
              inputMode="decimal"
              name="manualRate"
              placeholder="7.2000"
              type="text"
            />
          </Field>
          <Field label="有效日期">
            <input className={inputClassName} name="validDate" type="date" />
          </Field>
          <div className="md:col-span-4">
            <SubmitButton className={primaryButtonClassName}>
              保存手动汇率
            </SubmitButton>
          </div>
        </form>
      </section>

      <div className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">预算使用情况</h2>
          <span className="text-sm font-medium text-[#5d6972]">
            {usagePercent}%
          </span>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-[#edf1ef]">
          <div
            className="h-full rounded-full bg-[#2f6f73]"
            style={{ width: `${Math.min(usagePercent, 100)}%` }}
          />
        </div>
      </div>

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">预算设置</h2>
        <form action={updateBudget} className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label={`总预算（${baseCurrency}）`}>
            <input
              className={inputClassName}
              defaultValue={trip.budgetAmount ? String(trip.budgetAmount) : ""}
              min="0"
              name="budgetAmount"
              step="0.01"
              type="number"
            />
          </Field>
          <div className="hidden md:block" />
          {BUDGET_CATEGORIES.map((category) => (
            <Field key={category} label={`${category}预算`}>
              <input
                className={inputClassName}
                defaultValue={categoryBudgetMap.get(category) ?? ""}
                min="0"
                name={`budget-${category}`}
                step="0.01"
                type="number"
              />
            </Field>
          ))}
          <div className="md:col-span-2">
            <SubmitButton className={primaryButtonClassName}>
              保存预算
            </SubmitButton>
          </div>
        </form>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">按分类统计</h2>
          <div className="mt-4 space-y-3">
            {categoryTotals.length === 0 ? (
              <p className="text-sm text-[#5d6972]">暂无分类预算或支出。</p>
            ) : (
              categoryTotals.map((total) => (
                <div
                  className="rounded-md border border-[#e0d9cc] bg-[#fbfaf7] p-3"
                  key={total.name}
                >
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-semibold text-[#34434c]">
                      {total.name}
                    </span>
                    <span className="text-[#5d6972]">
                      {formatMoney(total.convertedSpent, baseCurrency)}
                      {total.budget > 0 ? ` / ${formatMoney(total.budget, baseCurrency)}` : ""}
                    </span>
                  </div>
                  {total.originalTotals.length > 0 ? (
                    <p className="mt-2 text-xs text-[#7a858c]">
                      未折算：
                      {total.originalTotals
                        .map((item) => formatMoney(item.amount, item.currency))
                        .join("，")}
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">最大几笔已折算支出</h2>
          <ExpenseMiniList
            baseCurrency={baseCurrency}
            emptyText="暂无可折算支出。"
            expenses={largestExpenses}
          />
        </div>
      </section>

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">新增支出</h2>
        <ExpenseForm
          action={createExpense}
          baseCurrency={baseCurrency}
          places={trip.places}
          submitLabel="新增支出"
        />
      </section>

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">最近支出</h2>
        <div className="mt-4 space-y-4">
          {trip.expenses.length === 0 ? (
            <p className="text-sm text-[#5d6972]">暂无支出记录。</p>
          ) : (
            trip.expenses.map((expense) => {
              const updateAction = updateExpenseAction.bind(
                null,
                trip.id,
                expense.id,
              );
              const deleteAction = deleteExpenseAction.bind(
                null,
                trip.id,
                expense.id,
              );

              return (
                <article
                  className="rounded-md border border-[#e0d9cc] bg-[#fbfaf7] p-4"
                  data-testid="expense-card"
                  key={expense.id}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="font-semibold">{expense.title}</h3>
                      <p className="mt-1 text-sm text-[#5d6972]">
                        {normalizeExpenseCategory(expense.category)} ·{" "}
                        {formatDate(expense.paidAt)} ·{" "}
                        {expense.relatedPlace?.name ?? "未关联地点"}
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="font-semibold text-[#172026]">
                        {formatMoney(Number(expense.amount), expense.currency)}
                      </p>
                      <p className="mt-1 text-xs text-[#7a858c]">
                        {formatConvertedAmount(expense, baseCurrency)}
                      </p>
                    </div>
                  </div>

                  {expense.notes ? (
                    <p className="mt-3 text-sm leading-6 text-[#5d6972]">
                      {expense.notes}
                    </p>
                  ) : null}

                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-semibold text-[#2f6f73]">
                      编辑支出
                    </summary>
                    <div className="mt-4 border-t border-[#e0d9cc] pt-4">
                      <ExpenseForm
                        action={updateAction}
                        baseCurrency={baseCurrency}
                        expense={expense}
                        places={trip.places}
                        submitLabel="保存支出"
                      />
                    </div>
                  </details>

                  <form action={deleteAction} className="mt-4">
                    <ConfirmSubmitButton
                      className={dangerButtonClassName}
                      message={`确定删除支出“${expense.title}”吗？`}
                    >
                      删除支出
                    </ConfirmSubmitButton>
                  </form>
                </article>
              );
            })
          )}
        </div>
      </section>
    </section>
  );
}

function ExpenseForm({
  action,
  baseCurrency,
  expense,
  places,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  baseCurrency: string;
  expense?: ExpenseWithPlace;
  places: PlaceOption[];
  submitLabel: string;
}) {
  return (
    <form action={action} className="mt-4 grid gap-4 md:grid-cols-2">
      <Field label="标题" required>
        <input
          className={inputClassName}
          defaultValue={expense?.title}
          name="title"
          required
        />
      </Field>
      <Field label="分类">
        <select
          className={inputClassName}
          defaultValue={expense?.category ?? "其他"}
          name="category"
        >
          <option value="">其他</option>
          {BUDGET_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </Field>
      <Field label="金额" required>
        <input
          className={inputClassName}
          defaultValue={expense?.amount ? String(expense.amount) : ""}
          min="0"
          name="amount"
          required
          step="0.01"
          type="number"
        />
      </Field>
      <Field label="货币" required>
        <input
          className={inputClassName}
          defaultValue={expense?.currency ?? baseCurrency}
          maxLength={3}
          name="currency"
          required
        />
      </Field>
      <Field label={`汇率（折算为 ${baseCurrency}，可选）`}>
        <input
          className={inputClassName}
          defaultValue={expense?.exchangeRate ? String(expense.exchangeRate) : ""}
          min="0"
          name="exchangeRate"
          step="0.0001"
          type="number"
        />
      </Field>
      <Field label="支出时间">
        <input
          className={inputClassName}
          defaultValue={toDateInputValue(expense?.paidAt)}
          name="paidAt"
          type="date"
        />
      </Field>
      <Field label="付款人">
        <input
          className={inputClassName}
          defaultValue={expense?.payer ?? ""}
          name="payer"
        />
      </Field>
      <Field label="分摊信息">
        <input
          className={inputClassName}
          defaultValue={formatSplitWith(expense?.splitWith)}
          name="splitWith"
          placeholder="用逗号分隔"
        />
      </Field>
      <Field label="关联地点">
        <select
          className={inputClassName}
          defaultValue={expense?.relatedPlaceId ?? ""}
          name="relatedPlaceId"
        >
          <option value="">不关联</option>
          {places.map((place) => (
            <option key={place.id} value={place.id}>
              {place.name}
            </option>
          ))}
        </select>
      </Field>
      <Field className="md:col-span-2" label="备注">
        <textarea
          className={`${inputClassName} min-h-24 resize-y`}
          defaultValue={expense?.notes ?? ""}
          name="notes"
        />
      </Field>
      <div className="md:col-span-2">
        <SubmitButton className={primaryButtonClassName}>
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}

function ExpenseMiniList({
  baseCurrency,
  emptyText,
  expenses,
}: {
  baseCurrency: string;
  emptyText: string;
  expenses: ExpenseWithPlace[];
}) {
  if (expenses.length === 0) {
    return <p className="mt-4 text-sm text-[#5d6972]">{emptyText}</p>;
  }

  return (
    <ol className="mt-4 space-y-3">
      {expenses.map((expense) => (
        <li
          className="flex items-start justify-between gap-3 rounded-md border border-[#e0d9cc] bg-[#fbfaf7] p-3 text-sm"
          key={expense.id}
        >
          <span>
            <span className="block font-medium text-[#34434c]">
              {expense.title}
            </span>
            <span className="mt-1 block text-xs text-[#7a858c]">
              {normalizeExpenseCategory(expense.category)}
            </span>
          </span>
          <span className="text-right font-semibold text-[#172026]">
            {formatConvertedAmount(expense, baseCurrency)}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Field({
  children,
  className,
  label,
  required,
}: {
  children: React.ReactNode;
  className?: string;
  label: string;
  required?: boolean;
}) {
  return (
    <label className={className}>
      <span className="text-sm font-medium text-[#34434c]">
        {label}
        {required ? <span className="text-[#9b2f1f]"> *</span> : null}
      </span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
      <p className="text-sm text-[#66737b]">{label}</p>
      <p className="mt-2 text-xl font-semibold text-[#172026]">{value}</p>
    </div>
  );
}

function formatConvertedAmount(
  expense: ExpenseWithPlace,
  baseCurrency: string,
): string {
  const converted = convertExpenseToBase(expense, baseCurrency);

  if (converted === null) {
    return "未折算";
  }

  return formatMoney(converted, baseCurrency);
}

function formatDate(date: Date | null): string {
  return formatDisplayDate(date);
}

function formatSplitWith(splitWith: Prisma.JsonValue | null | undefined): string {
  if (!Array.isArray(splitWith)) {
    return "";
  }

  return splitWith.filter((item): item is string => typeof item === "string").join(", ");
}

const inputClassName =
  "w-full rounded-md border border-[#cfd7d2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#2f6f73] focus:ring-2 focus:ring-[#2f6f73]/20";

const primaryButtonClassName =
  "rounded-md bg-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#285f62]";

const secondaryButtonClassName =
  "rounded-md border border-[#2f6f73] px-4 py-2 text-sm font-semibold text-[#2f6f73] transition hover:bg-[#edf4f1]";

const dangerButtonClassName =
  "rounded-md border border-[#d46a55] px-3 py-2 text-sm font-semibold text-[#9b2f1f] transition hover:bg-[#fff2ee]";
