import type { TripReviewStatus } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth/session";
import { formatDisplayDate } from "@/lib/display-format";
import { prisma } from "@/lib/prisma";
import {
  buildNextTripSuggestions,
  canSaveFinalTripReview,
  formatTagGroupsForTextarea,
  linesFromJson,
  nextTripSuggestionsFromJson,
  normalizeTripReviewDraft,
  summarizePreferencesForAiPlan,
  TRIP_REVIEW_COMPLETED_ONLY_MESSAGE,
  tagGroupsFromJson,
  type NextTripSuggestion,
  type PreferenceForAiPlan,
  type TripReviewDraft,
} from "@/lib/trip-review";
import { getTripStatusLabel } from "@/lib/trips";

import { Notice, TripModuleNav } from "../module-nav";
import {
  generateTripReviewDraftAction,
  saveTripReviewAction,
} from "./actions";

type TripReviewPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string; message?: string }>;
};

export default async function TripReviewPage({
  params,
  searchParams,
}: TripReviewPageProps) {
  const { id } = await params;
  const notice = (await searchParams) ?? {};
  const user = await requireUser();
  const trip = await prisma.trip.findUnique({
    include: {
      tripReviews: {
        take: 1,
        where: { createdById: user.id },
      },
    },
    where: { id },
  });

  if (!trip) {
    notFound();
  }

  const review = trip.tripReviews[0] ?? null;
  const preferences = await prisma.travelPreference.findMany({
    orderBy: [{ weight: "desc" }, { evidenceCount: "desc" }, { updatedAt: "desc" }],
    select: {
      evidenceCount: true,
      key: true,
      label: true,
      weight: true,
    },
    take: 12,
    where: { userId: user.id, visibility: "private" },
  });
  const values = reviewToFormValues(review, trip.baseCurrency);
  const suggestions = review
    ? nextTripSuggestionsFromJson(review.nextTripSuggestions)
    : buildNextTripSuggestions(values, preferences);
  const generateAction = generateTripReviewDraftAction.bind(null, trip.id);
  const saveAction = saveTripReviewAction.bind(null, trip.id);
  const canSaveFinalReview = canSaveFinalTripReview(trip.status);

  return (
    <section className="space-y-6">
      <TripModuleNav active="review" tripId={trip.id} tripTitle={trip.title} />
      <Notice error={notice.error} message={notice.message} />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#2f6f73]">Trip Review</p>
          <h1 className="mt-2 text-3xl font-semibold">旅行复盘与个人知识库</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#5d6972]">
            把实际体验、推荐、避雷、花费和节奏沉淀下来。确认保存后，偏好默认仅本人可见，并会用于后续 AI 规划。
          </p>
        </div>
        <div className="rounded-lg border border-[#d8d2c6] bg-white p-4 text-sm shadow-sm">
          <p className="font-semibold text-[#34434c]">{trip.title}</p>
          <p className="mt-2 text-[#5d6972]">
            {trip.mainDestination ?? "未填写目的地"} / {getTripStatusLabel(trip.status)}
          </p>
          <p className="mt-1 text-[#5d6972]">
            复盘状态：{getReviewStatusLabel(review?.status)}
          </p>
          {review?.updatedAt ? (
            <p className="mt-1 text-xs text-[#7a858c]">
              更新于 {formatDisplayDate(review.updatedAt)}
            </p>
          ) : null}
          {review?.status === "final" ? (
            <Link
              className="mt-4 inline-flex justify-center rounded-md border border-[#2f6f73] px-3 py-2 text-sm font-semibold text-[#2f6f73] transition hover:bg-[#edf4f1]"
              href={`/api/trips/${trip.id}/review/export?format=md`}
            >
              导出 Markdown
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.42fr]">
        <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm sm:p-6">
          <form action={saveAction} className="space-y-6">
            <Field label="复盘总结">
              <textarea
                className={`${inputClassName} min-h-32 resize-y`}
                defaultValue={values.summary}
                name="summary"
                placeholder="这次旅行整体感受、执行情况、最值得复用的经验。"
              />
            </Field>

            <div className="grid gap-5 md:grid-cols-3">
              <Field label="实际花费">
                <input
                  className={inputClassName}
                  defaultValue={values.actualCostAmount}
                  min="0"
                  name="actualCostAmount"
                  step="0.01"
                  type="number"
                />
              </Field>
              <Field label="货币">
                <input
                  className={inputClassName}
                  defaultValue={values.actualCostCurrency}
                  maxLength={3}
                  name="actualCostCurrency"
                  placeholder="CNY"
                />
              </Field>
              <Field label="实际节奏">
                <select
                  className={inputClassName}
                  defaultValue={values.actualPace}
                  name="actualPace"
                >
                  <option value="relaxed">轻松</option>
                  <option value="balanced">适中</option>
                  <option value="packed">紧凑</option>
                </select>
              </Field>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <Field label="推荐">
                <textarea
                  className={`${inputClassName} min-h-32 resize-y`}
                  defaultValue={values.recommendations.join("\n")}
                  name="recommendations"
                  placeholder="一行一条，例如：龙井村适合慢逛，体验很好。"
                />
              </Field>
              <Field label="避雷">
                <textarea
                  className={`${inputClassName} min-h-32 resize-y`}
                  defaultValue={values.warnings.join("\n")}
                  name="warnings"
                  placeholder="一行一条，例如：周末热门景点排队过久。"
                />
              </Field>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <Field label="遗憾事项">
                <textarea
                  className={`${inputClassName} min-h-28 resize-y`}
                  defaultValue={values.regrets.join("\n")}
                  name="regrets"
                  placeholder="未预约、转场过多、预算估算不足等。"
                />
              </Field>
              <Field label="下次优化">
                <textarea
                  className={`${inputClassName} min-h-28 resize-y`}
                  defaultValue={values.nextTimeAdvice}
                  name="nextTimeAdvice"
                  placeholder="下次规划时希望 AI 直接遵守的经验。"
                />
              </Field>
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              <Field label="地点标签">
                <textarea
                  className={`${inputClassName} min-h-28 resize-y`}
                  defaultValue={formatTagGroupsForTextarea(values.placeTags)}
                  name="placeTags"
                  placeholder="西湖：适合慢逛、值得再去"
                />
              </Field>
              <Field label="住宿标签">
                <textarea
                  className={`${inputClassName} min-h-28 resize-y`}
                  defaultValue={formatTagGroupsForTextarea(values.stayTags)}
                  name="stayTags"
                  placeholder="湖滨酒店：安静、安全、交通方便"
                />
              </Field>
              <Field label="交通标签">
                <textarea
                  className={`${inputClassName} min-h-28 resize-y`}
                  defaultValue={formatTagGroupsForTextarea(values.transportTags)}
                  name="transportTags"
                  placeholder="高铁：少换乘、确定性高"
                />
              </Field>
            </div>

            <p className="rounded-md border border-[#f0d39b] bg-[#fff9e8] px-4 py-3 text-sm leading-6 text-[#73530f]">
              AI 复盘只使用行程状态、预算汇总和脱敏后的笔记摘要，不读取上传文件内容。导出 Markdown 不包含 aiDraftJson、用户 ID、隐藏字段或文件敏感信息。
            </p>
            {!canSaveFinalReview ? (
              <p className="rounded-md border border-[#f0d39b] bg-[#fff9e8] px-4 py-3 text-sm leading-6 text-[#73530f]">
                {TRIP_REVIEW_COMPLETED_ONLY_MESSAGE}
              </p>
            ) : null}

            <div className="flex flex-col-reverse gap-3 border-t border-[#e0d9cc] pt-6 sm:flex-row sm:justify-end">
              <SubmitButton
                className={secondaryButtonClassName}
                formAction={generateAction}
                pendingLabel="生成中..."
              >
                生成 AI 复盘草稿
              </SubmitButton>
              <SubmitButton
                className={primaryButtonClassName}
                disabled={!canSaveFinalReview}
                pendingLabel="保存中..."
              >
                确认并保存正式复盘
              </SubmitButton>
            </div>
          </form>
        </section>

        <aside className="space-y-6">
          <PreferencePanel preferences={preferences} />
          <SuggestionPanel suggestions={suggestions} />
        </aside>
      </div>
    </section>
  );
}

function PreferencePanel({ preferences }: { preferences: PreferenceForAiPlan[] }) {
  const summary = summarizePreferencesForAiPlan(preferences);

  return (
    <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold">个人偏好</h2>
      <p className="mt-2 text-sm leading-6 text-[#5d6972]">
        默认仅本人可见，后续 AI 规划会读取这些偏好摘要。
      </p>
      {preferences.length === 0 ? (
        <p className="mt-4 rounded-md bg-[#fbfaf7] p-4 text-sm text-[#5d6972]">
          保存正式复盘后，将从推荐、避雷、节奏和标签中提取偏好。
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {preferences.map((preference) => (
              <span
                className="rounded-full bg-[#edf4f1] px-3 py-1 text-xs font-medium text-[#2f6f73]"
                key={preference.key}
              >
                {preference.label}
              </span>
            ))}
          </div>
          <p className="mt-4 text-xs leading-5 text-[#7a858c]">{summary}</p>
        </>
      )}
    </section>
  );
}

function SuggestionPanel({ suggestions }: { suggestions: NextTripSuggestion[] }) {
  return (
    <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold">下一次旅行建议</h2>
      <div className="mt-4 space-y-3">
        {suggestions.map((suggestion) => (
          <article
            className="rounded-md border border-[#e0d9cc] bg-[#fbfaf7] p-4"
            key={`${suggestion.title}-${suggestion.body}`}
          >
            <h3 className="font-semibold text-[#34434c]">{suggestion.title}</h3>
            <p className="mt-2 text-sm leading-6 text-[#5d6972]">
              {suggestion.body}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-[#34434c]">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function reviewToFormValues(
  review:
    | {
        actualCostAmount: unknown;
        actualCostCurrency: string;
        actualPace: string | null;
        nextTimeAdvice: string | null;
        placeTags: unknown;
        recommendations: unknown;
        regrets: unknown;
        stayTags: unknown;
        summary: string | null;
        transportTags: unknown;
        warnings: unknown;
      }
    | null,
  baseCurrency: string,
): TripReviewDraft {
  if (!review) {
    return normalizeTripReviewDraft({ actualCostCurrency: baseCurrency });
  }

  return normalizeTripReviewDraft({
    actualCostAmount:
      review.actualCostAmount && typeof review.actualCostAmount === "object" && "toString" in review.actualCostAmount
        ? review.actualCostAmount.toString()
        : "",
    actualCostCurrency: review.actualCostCurrency,
    actualPace: review.actualPace ?? "",
    nextTimeAdvice: review.nextTimeAdvice ?? "",
    placeTags: tagGroupsFromJson(review.placeTags),
    recommendations: linesFromJson(review.recommendations),
    regrets: linesFromJson(review.regrets),
    stayTags: tagGroupsFromJson(review.stayTags),
    summary: review.summary ?? "",
    transportTags: tagGroupsFromJson(review.transportTags),
    warnings: linesFromJson(review.warnings),
  });
}

function getReviewStatusLabel(status: TripReviewStatus | undefined): string {
  if (status === "final") {
    return "正式复盘";
  }

  if (status === "draft") {
    return "AI 草稿";
  }

  return "未复盘";
}

const inputClassName =
  "w-full rounded-md border border-[#cfd7d2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#2f6f73] focus:ring-2 focus:ring-[#2f6f73]/20";

const primaryButtonClassName =
  "inline-flex justify-center rounded-md bg-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#285f62] disabled:cursor-not-allowed disabled:bg-[#90aaa9]";

const secondaryButtonClassName =
  "inline-flex justify-center rounded-md border border-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-[#2f6f73] transition hover:bg-[#edf4f1] disabled:cursor-not-allowed disabled:border-[#90aaa9] disabled:text-[#90aaa9]";
