import Link from "next/link";

import { SubmitButton } from "@/components/submit-button";
import { AI_DRAFT_NOTICE } from "@/lib/ai";
import {
  type StructuredTripPlan,
  defaultAiPlanInput,
  normalizeAiPlanInput,
  validateStructuredTripPlan,
  type AiPlanInput,
} from "@/lib/ai-plan";
import { formatMoney } from "@/lib/budget";
import { prisma } from "@/lib/prisma";

import { createAiPlanActionState } from "./action-state";
import {
  applyAiPlanDraftAction,
  createAiPlanDraftAction,
  discardAiPlanDraftAction,
  regenerateAiPlanDraftAction,
} from "./actions";
import { AiPlanForm } from "./ai-plan-form";

type AiPlanPageProps = {
  searchParams?: Promise<{
    draftId?: string;
    edit?: string;
    error?: string;
    message?: string;
  }>;
};

export default async function AiPlanPage({ searchParams }: AiPlanPageProps) {
  const query = (await searchParams) ?? {};
  const draft = query.draftId
    ? await prisma.aiPlanDraft.findUnique({ where: { id: query.draftId } })
    : null;

  if (!draft || query.edit === "1") {
    const initialValues = draft ? jsonToAiPlanInput(draft.inputJson) : defaultAiPlanInput;

    return (
      <section className="space-y-6">
        <PageHeader />
        <Notice error={query.error} message={query.message} />
        <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm sm:p-6">
          <AiPlanForm
            action={createAiPlanDraftAction}
            initialState={createAiPlanActionState(initialValues)}
          />
        </section>
      </section>
    );
  }

  const validation = validateStructuredTripPlan(draft.draftJson);
  const plan = validation.ok ? validation.plan : null;

  return (
    <section className="space-y-6">
      <PageHeader />
      <Notice error={query.error} message={query.message} />

      <div className="rounded-md border border-[#f0d39b] bg-[#fff9e8] px-4 py-3 text-sm leading-6 text-[#73530f]">
        {AI_DRAFT_NOTICE} 当前内容是 AI 草稿，确认前不会写入正式 Trip、Destination、Place、Itinerary、Checklist、Budget、Route、Note 数据。
      </div>

      {draft.status !== "draft" ? (
        <div className="rounded-md border border-[#f1b8aa] bg-[#fff2ee] px-4 py-3 text-sm text-[#9b2f1f]">
          当前草稿状态：{draft.status}
          {draft.errorMessage ? `；${draft.errorMessage}` : ""}
        </div>
      ) : null}

      {!plan ? (
        <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold">草稿无法预览</h2>
          <p className="mt-3 text-sm leading-6 text-[#5d6972]">
            {validation.ok ? "" : validation.errors.join("；")}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link className={secondaryButtonClassName} href={`/trips/ai-plan?draftId=${draft.id}&edit=1`}>
              返回修改输入
            </Link>
            <form action={regenerateAiPlanDraftAction.bind(null, draft.id)}>
              <SubmitButton className={primaryButtonClassName} pendingLabel="重新生成中...">
                重新生成
              </SubmitButton>
            </form>
          </div>
        </section>
      ) : (
        <PlanPreview draftId={draft.id} plan={plan} status={draft.status} />
      )}
    </section>
  );
}

function PageHeader() {
  return (
    <div>
      <Link className="text-sm font-medium text-[#2f6f73]" href="/trips/new">
        返回旅行创建
      </Link>
      <p className="mt-4 text-sm font-semibold text-[#2f6f73]">AI Plan</p>
      <h1 className="mt-2 text-3xl font-semibold">AI 生成旅行计划</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-[#5d6972]">
        输入少量基础信息，由 AI 生成结构化草稿。预览确认后，系统会一次性写入现有旅行模块，后续仍可手动编辑。
      </p>
    </div>
  );
}

function PlanPreview({
  draftId,
  plan,
  status,
}: {
  draftId: string;
  plan: StructuredTripPlan;
  status: string;
}) {
  const confirmAction = applyAiPlanDraftAction.bind(null, draftId);
  const regenerateAction = regenerateAiPlanDraftAction.bind(null, draftId);
  const discardAction = discardAiPlanDraftAction.bind(null, draftId);

  return (
    <div className="space-y-6" data-testid="ai-plan-preview">
      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#2f6f73]">旅行摘要</p>
            <h2 className="mt-2 text-2xl font-semibold">{plan.trip.title}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[#5d6972]">
              {plan.trip.description}
            </p>
          </div>
          <div className="rounded-md border border-[#e0d9cc] bg-[#fbfaf7] p-4 text-sm">
            <p className="font-semibold">{plan.trip.theme}</p>
            <p className="mt-2 text-[#5d6972]">
              {plan.trip.homeCity} → {plan.trip.mainDestination}
            </p>
            <p className="mt-1 text-[#5d6972]">
              {plan.trip.startDate} 至 {plan.trip.endDate}
            </p>
            <p className="mt-1 text-[#5d6972]">
              {formatMoney(plan.budget.totalAmount, plan.budget.currency)}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold">每日行程</h2>
        <div className="mt-4 space-y-4">
          {plan.itineraryDays.map((day, index) => (
            <article
              className="rounded-md border border-[#e0d9cc] bg-[#fbfaf7] p-4"
              data-testid="ai-plan-day"
              key={day.date}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#edf4f1] px-2.5 py-1 text-xs font-semibold text-[#2f6f73]">
                  Day {index + 1}
                </span>
                <h3 className="font-semibold">{day.title}</h3>
              </div>
              <p className="mt-2 text-sm text-[#5d6972]">
                {day.date} · {day.city} · {day.theme}
              </p>
              <ol className="mt-3 space-y-2">
                {day.items.map((item) => (
                  <li
                    className="rounded-md border border-[#e0d9cc] bg-white p-3 text-sm"
                    key={`${day.date}-${item.sortOrder}-${item.title}`}
                  >
                    <span className="font-semibold">
                      {item.startTime ?? "--:--"}-{item.endTime ?? "--:--"} · {item.title}
                    </span>
                    <span className="ml-2 text-[#5d6972]">
                      {item.type} · {formatMoney(Number(item.costEstimate ?? 0), plan.budget.currency)}
                    </span>
                    {item.notes ? (
                      <p className="mt-1 text-[#5d6972]">{item.notes}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <PreviewList
          items={plan.places.map((place) => ({
            body: `${place.type} · ${place.reason} · ${place.notes ?? "需人工核验"}`,
            title: place.name,
          }))}
          testId="ai-plan-place"
          title="推荐地点"
        />
        <PreviewList
          items={plan.transportOptions.map((option) => ({
            body: `${option.mode} · ${option.fromName} → ${option.toName} · ${option.notes}`,
            title: "交通建议",
          }))}
          title="交通建议"
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <PreviewList
          items={plan.categoryBudgets.map((budget) => ({
            body: budget.notes ?? "AI 分类预算建议",
            title: `${budget.category}：${formatMoney(budget.amount, plan.budget.currency)}`,
          }))}
          testId="ai-plan-budget"
          title="预算拆分"
        />
        <PreviewList
          items={plan.checklistItems.map((item) => ({
            body: `${item.category} · ${item.importance}${item.notes ? ` · ${item.notes}` : ""}`,
            title: item.title,
          }))}
          testId="ai-plan-checklist"
          title="准备清单"
        />
      </section>

      <PreviewList
        items={[
          ...plan.notes.map((note) => ({
            body: note.content,
            title: note.title,
          })),
          ...plan.verificationChecklist.map((item) => ({
            body: "需用户通过官方渠道人工核验。",
            title: item,
          })),
        ]}
        title="注意事项与人工核验"
      />

      <div className="sticky bottom-4 rounded-lg border border-[#d8d2c6] bg-white/95 p-4 shadow-lg backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Link className={secondaryButtonClassName} href={`/trips/ai-plan?draftId=${draftId}&edit=1`}>
            返回修改输入
          </Link>
          <form action={regenerateAction}>
            <SubmitButton className={secondaryButtonClassName} pendingLabel="重新生成中...">
              重新生成
            </SubmitButton>
          </form>
          <form action={discardAction}>
            <SubmitButton className={dangerButtonClassName} pendingLabel="丢弃中...">
              丢弃草稿
            </SubmitButton>
          </form>
          <form action={confirmAction}>
            <SubmitButton
              className={primaryButtonClassName}
              disabled={status !== "draft"}
              pendingLabel="正在创建旅行..."
            >
              确认创建旅行
            </SubmitButton>
          </form>
        </div>
      </div>
    </div>
  );
}

function PreviewList({
  items,
  testId,
  title,
}: {
  items: Array<{ body: string; title: string }>;
  testId?: string;
  title: string;
}) {
  return (
    <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-4 space-y-3">
        {items.map((item, index) => (
          <article
            className="rounded-md border border-[#e0d9cc] bg-[#fbfaf7] p-4"
            data-testid={testId}
            key={`${item.title}-${index}`}
          >
            <h3 className="font-semibold">{item.title}</h3>
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#5d6972]">
              {item.body}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Notice({ error, message }: { error?: string; message?: string }) {
  if (!error && !message) {
    return null;
  }

  return (
    <p
      className={[
        "rounded-md border px-4 py-3 text-sm",
        error
          ? "border-[#f1b8aa] bg-[#fff2ee] text-[#9b2f1f]"
          : "border-[#b8d8ca] bg-[#f0faf5] text-[#276044]",
      ].join(" ")}
    >
      {error ?? message}
    </p>
  );
}

function jsonToAiPlanInput(value: unknown): AiPlanInput {
  if (!isRecord(value)) {
    return defaultAiPlanInput;
  }

  return normalizeAiPlanInput({
    avoid: stringValue(value.avoid),
    budgetAmount: stringValue(value.budgetAmount),
    companions: stringValue(value.companions),
    destination: stringValue(value.destination),
    endDate: stringValue(value.endDate),
    homeCity: stringValue(value.homeCity),
    mustVisit: stringValue(value.mustVisit),
    pace: stringValue(value.pace) as AiPlanInput["pace"],
    people: stringValue(value.people),
    preferences: stringArray(value.preferences),
    startDate: stringValue(value.startDate),
    stayPreferences: stringArray(value.stayPreferences),
    transportPreferences: stringArray(value.transportPreferences),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

const primaryButtonClassName =
  "inline-flex justify-center rounded-md bg-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#285f62] disabled:cursor-not-allowed disabled:bg-[#90aaa9]";

const secondaryButtonClassName =
  "inline-flex justify-center rounded-md border border-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-[#2f6f73] transition hover:bg-[#edf4f1]";

const dangerButtonClassName =
  "inline-flex justify-center rounded-md border border-[#d46a55] px-4 py-2.5 text-sm font-semibold text-[#9b2f1f] transition hover:bg-[#fff2ee]";
