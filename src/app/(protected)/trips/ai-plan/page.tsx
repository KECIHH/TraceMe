import Link from "next/link";

import { SubmitButton } from "@/components/submit-button";
import { AI_DRAFT_NOTICE } from "@/lib/ai";
import { requireUser } from "@/lib/auth/session";
import {
  buildAiPlanChangePreview,
  defaultAiPlanInput,
  getSelectedAiPlanOption,
  normalizeAiPlanInput,
  validateAiPlanWorkspace,
  type AiPlanInput,
  type AiPlanOption,
  type AiPlanWorkspace,
  type StructuredTripPlan,
} from "@/lib/ai-plan";
import { formatMoney } from "@/lib/budget";
import { prisma } from "@/lib/prisma";

import { createAiPlanActionState } from "./action-state";
import {
  applyAiPlanDraftAction,
  createAiPlanDraftAction,
  discardAiPlanDraftAction,
  regenerateAiPlanDraftAction,
  reviseAiPlanDraftAction,
  rollbackAiPlanDraftAction,
  selectAiPlanOptionAction,
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
  const user = await requireUser();
  const query = (await searchParams) ?? {};
  const draft = query.draftId
    ? await prisma.aiPlanDraft.findFirst({
        where: { createdById: user.id, id: query.draftId },
      })
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

  const validation = validateAiPlanWorkspace(draft.draftJson);
  const workspace = validation.ok ? validation.workspace : null;

  return (
    <section className="space-y-6">
      <PageHeader />
      <Notice error={query.error} message={query.message} />

      <div className="rounded-md border border-[#f0d39b] bg-[#fff9e8] px-4 py-3 text-sm leading-6 text-[#73530f]">
        {AI_DRAFT_NOTICE} 当前内容是 AI 草稿，确认前不会写入正式 Trip、Destination、Place、Itinerary、Checklist、Budget、Route、Note 数据。票价、营业时间、预约、签证或政策信息都需要人工核验。
      </div>

      {draft.status !== "draft" ? (
        <div className="rounded-md border border-[#f1b8aa] bg-[#fff2ee] px-4 py-3 text-sm text-[#9b2f1f]">
          当前草稿状态：{draft.status}
          {draft.errorMessage ? `；${draft.errorMessage}` : ""}
        </div>
      ) : null}

      {!workspace ? (
        <InvalidDraft
          draftId={draft.id}
          errors={validation.ok ? [] : validation.errors}
        />
      ) : (
        <PlanWorkspacePreview
          draftId={draft.id}
          status={draft.status}
          workspace={workspace}
        />
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
      <h1 className="mt-2 text-3xl font-semibold">先说需求，再由 AI 生成计划</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-[#5d6972]">
        输入旅行目标、人数、预算、天数、偏好、禁忌和节奏后，AI 会给出可比较方案。选定一个方案进入草稿，继续追问和局部修改，最后在变更预览中确认写入正式旅行数据。
      </p>
    </div>
  );
}

function InvalidDraft({ draftId, errors }: { draftId: string; errors: string[] }) {
  return (
    <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold">草稿无法预览</h2>
      <p className="mt-3 text-sm leading-6 text-[#5d6972]">
        {errors.length > 0 ? errors.join("；") : "AI 草稿结构无效。"}
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link className={secondaryButtonClassName} href={`/trips/ai-plan?draftId=${draftId}&edit=1`}>
          返回修改输入
        </Link>
        <form action={regenerateAiPlanDraftAction.bind(null, draftId)}>
          <SubmitButton className={primaryButtonClassName} pendingLabel="重新生成中...">
            重新生成
          </SubmitButton>
        </form>
      </div>
    </section>
  );
}

function PlanWorkspacePreview({
  draftId,
  status,
  workspace,
}: {
  draftId: string;
  status: string;
  workspace: AiPlanWorkspace;
}) {
  const selected = getSelectedAiPlanOption(workspace);
  const plan = selected.plan;
  const preview = buildAiPlanChangePreview(plan);
  const canEdit = status === "draft";
  const confirmAction = applyAiPlanDraftAction.bind(null, draftId);
  const regenerateAction = regenerateAiPlanDraftAction.bind(null, draftId);
  const discardAction = discardAiPlanDraftAction.bind(null, draftId);

  return (
    <div className="space-y-6" data-testid="ai-plan-preview">
      <OptionComparison
        canEdit={canEdit}
        draftId={draftId}
        options={workspace.options}
        selectedOptionId={workspace.selectedOptionId}
      />

      <SelectedPlanSummary option={selected} />
      <PlanDetail plan={plan} />

      <section className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
        <DraftRevision canEdit={canEdit} draftId={draftId} />
        <ChangePreview preview={preview} />
      </section>

      <VersionHistory
        canEdit={canEdit}
        draftId={draftId}
        workspace={workspace}
      />

      <div className="sticky bottom-4 rounded-lg border border-[#d8d2c6] bg-white/95 p-4 shadow-lg backdrop-blur">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-sm leading-6 text-[#5d6972]">
            当前选中：<span className="font-semibold text-[#34434c]">{selected.title}</span>。确认后才会写入正式 Trip 数据。
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
            <Link className={secondaryButtonClassName} href={`/trips/ai-plan?draftId=${draftId}&edit=1`}>
              修改需求
            </Link>
            <Link
              className={secondaryButtonClassName}
              href={`/api/ai-plan-drafts/${draftId}/download?format=md&disposition=inline`}
              target="_blank"
            >
              预览完整方案
            </Link>
            <Link
              className={secondaryButtonClassName}
              href={`/api/ai-plan-drafts/${draftId}/download?format=md`}
            >
              下载方案
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
                disabled={!canEdit}
                pendingLabel="正在写入 Trip..."
              >
                确认写入 Trip
              </SubmitButton>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

function OptionComparison({
  canEdit,
  draftId,
  options,
  selectedOptionId,
}: {
  canEdit: boolean;
  draftId: string;
  options: AiPlanOption[];
  selectedOptionId: string;
}) {
  return (
    <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#2f6f73]">方案比较</p>
          <h2 className="mt-1 text-2xl font-semibold">AI 生成的可选方案</h2>
        </div>
        <p className="text-sm text-[#5d6972]">评分越高越贴合当前输入，仍需人工确认真实信息。</p>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {options.map((option, index) => {
          const selected = option.id === selectedOptionId;

          return (
            <article
              className={[
                "rounded-md border p-4",
                selected
                  ? "border-[#2f6f73] bg-[#edf4f1]"
                  : "border-[#e0d9cc] bg-[#fbfaf7]",
              ].join(" ")}
              data-testid="ai-plan-option"
              key={option.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#5d6972]">
                    方案 {index + 1}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold">{option.title}</h3>
                </div>
                {selected ? (
                  <span className="rounded-md bg-[#2f6f73] px-2 py-1 text-xs font-semibold text-white">
                    已选
                  </span>
                ) : null}
              </div>
              <p className="mt-3 text-sm leading-6 text-[#5d6972]">{option.summary}</p>
              <div className="mt-4 space-y-2">
                <ScoreRow label="综合" value={option.score.overall} />
                <ScoreRow label="轻松度" value={option.score.ease} />
                <ScoreRow label="预算匹配" value={option.score.budgetMatch} />
                <ScoreRow label="路线合理" value={option.score.routeRationality} />
                <ScoreRow label="亲子/老人" value={option.score.familyElderFriendly} />
              </div>
              <ul className="mt-4 space-y-2 text-sm leading-6 text-[#5d6972]">
                {option.tradeoffs.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <form action={selectAiPlanOptionAction.bind(null, draftId)} className="mt-4">
                <input name="optionId" type="hidden" value={option.id} />
                <SubmitButton
                  className={selected ? mutedButtonClassName : primaryButtonClassName}
                  disabled={!canEdit || selected}
                  pendingLabel="选择中..."
                >
                  {selected ? "当前方案" : "选择此方案"}
                </SubmitButton>
              </form>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid grid-cols-[5.25rem_1fr_2.5rem] items-center gap-2 text-sm">
      <span className="text-[#5d6972]">{label}</span>
      <span className="h-2 rounded-full bg-[#e0d9cc]">
        <span
          className="block h-2 rounded-full bg-[#2f6f73]"
          style={{ width: `${Math.max(0, Math.min(value, 100))}%` }}
        />
      </span>
      <span className="text-right font-semibold text-[#34434c]">{value}</span>
    </div>
  );
}

function SelectedPlanSummary({ option }: { option: AiPlanOption }) {
  const plan = option.plan;

  return (
    <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#2f6f73]">计划草稿</p>
          <h2 className="mt-2 text-2xl font-semibold">{plan.trip.title}</h2>
          <p className="mt-3 max-w-3xl whitespace-pre-line text-sm leading-6 text-[#5d6972]">
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
          <p className="mt-2 text-xs leading-5 text-[#73530f]">
            AI 草稿，需要确认后写入正式数据。
          </p>
        </div>
      </div>
    </section>
  );
}

function PlanDetail({ plan }: { plan: StructuredTripPlan }) {
  return (
    <>
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
                <span className="rounded-md bg-[#edf4f1] px-2.5 py-1 text-xs font-semibold text-[#2f6f73]">
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
          items={plan.transportOptions.map((option) => ({
            body: `${option.mode} · ${option.fromName} → ${option.toName} · ${option.notes}`,
            title: "交通建议",
          }))}
          testId="ai-plan-transport"
          title="交通建议"
        />
        <PreviewList
          items={plan.categoryBudgets.map((budget) => ({
            body: budget.notes ?? "AI 分类预算建议，非实时价格。",
            title: `${budget.category}：${formatMoney(budget.amount, plan.budget.currency)}`,
          }))}
          testId="ai-plan-budget"
          title="预算估算"
        />
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
          ...(plan.riskReminders ?? []).map((item) => ({
            body: "不得视为实时确定信息。",
            title: item,
          })),
          ...plan.verificationChecklist.map((item) => ({
            body: "需用户通过官方渠道人工核验。",
            title: item,
          })),
        ]}
        testId="ai-plan-risk"
        title="风险提醒与人工核验"
      />
    </>
  );
}

function DraftRevision({
  canEdit,
  draftId,
}: {
  canEdit: boolean;
  draftId: string;
}) {
  return (
    <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold">追问和局部修改</h2>
      <p className="mt-2 text-sm leading-6 text-[#5d6972]">
        对当前草稿提出调整，例如更轻松、少换乘、压低预算或照顾老人。修改仍停留在 AI 草稿层，确认前不会写入正式 Trip。
      </p>
      <form action={reviseAiPlanDraftAction.bind(null, draftId)} className="mt-4 space-y-3">
        <label className="block">
          <span className="text-sm font-medium text-[#34434c]">追问或局部修改</span>
          <textarea
            className={`${inputClassName} mt-2 min-h-28 resize-y`}
            disabled={!canEdit}
            name="changeRequest"
            placeholder="例如：第二天更轻松一点，预算压到 8000 以内，交通尽量少换乘。"
          />
        </label>
        <SubmitButton
          className={primaryButtonClassName}
          disabled={!canEdit}
          pendingLabel="调整中..."
        >
          调整 AI 草稿
        </SubmitButton>
      </form>
    </section>
  );
}

function ChangePreview({
  preview,
}: {
  preview: ReturnType<typeof buildAiPlanChangePreview>;
}) {
  const rows = [
    ["Trip", preview.trips],
    ["Destination", preview.destinations],
    ["ItineraryDay", preview.itineraryDays],
    ["ItineraryItem", preview.itineraryItems],
    ["Place", preview.places],
    ["TransportOption", preview.transportOptions],
    ["RoutePlan", preview.routePlans],
    ["ChecklistItem", preview.checklistItems],
    ["CategoryBudget", preview.categoryBudgets],
    ["Expense", preview.expenses],
    ["Note", preview.notes],
  ];

  return (
    <section
      className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm"
      data-testid="ai-change-preview"
    >
      <h2 className="text-xl font-semibold">写入前变更预览</h2>
      <p className="mt-2 text-sm leading-6 text-[#5d6972]">
        点击确认后才会创建以下正式数据；确认前只是 AI 草稿。
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {rows.map(([label, value]) => (
          <div className="rounded-md border border-[#e0d9cc] bg-[#fbfaf7] p-3" key={label}>
            <dt className="text-xs text-[#5d6972]">{label}</dt>
            <dd className="mt-1 text-xl font-semibold text-[#34434c]">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function VersionHistory({
  canEdit,
  draftId,
  workspace,
}: {
  canEdit: boolean;
  draftId: string;
  workspace: AiPlanWorkspace;
}) {
  const versions = [...workspace.versions].reverse();

  return (
    <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold">AI 生成版本历史</h2>
      <p className="mt-2 text-sm leading-6 text-[#5d6972]">
        方案选择、追问修改和回滚都会保留记录，方便对比和恢复草稿。
      </p>
      <div className="mt-4 space-y-3">
        {versions.map((version) => (
          <article
            className="rounded-md border border-[#e0d9cc] bg-[#fbfaf7] p-4"
            data-testid="ai-plan-version"
            key={version.id}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="font-semibold">{version.title}</h3>
                <p className="mt-1 text-sm text-[#5d6972]">
                  {formatVersionTime(version.createdAt)} · 综合评分 {version.score.overall}
                </p>
                <p className="mt-2 text-sm leading-6 text-[#5d6972]">
                  {version.changeRequest ? `修改：${version.changeRequest}` : version.summary}
                </p>
              </div>
              <form action={rollbackAiPlanDraftAction.bind(null, draftId)}>
                <input name="versionId" type="hidden" value={version.id} />
                <SubmitButton
                  className={secondaryButtonClassName}
                  disabled={!canEdit}
                  pendingLabel="回滚中..."
                >
                  回滚到此版本
                </SubmitButton>
              </form>
            </div>
          </article>
        ))}
      </div>
    </section>
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
    travelGoal: stringValue(value.travelGoal),
  });
}

function formatVersionTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", { hour12: false });
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
  "inline-flex justify-center rounded-md border border-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-[#2f6f73] transition hover:bg-[#edf4f1] disabled:cursor-not-allowed disabled:border-[#90aaa9] disabled:text-[#90aaa9]";

const dangerButtonClassName =
  "inline-flex justify-center rounded-md border border-[#d46a55] px-4 py-2.5 text-sm font-semibold text-[#9b2f1f] transition hover:bg-[#fff2ee]";

const mutedButtonClassName =
  "inline-flex justify-center rounded-md border border-[#cfd7d2] bg-[#f4f1ea] px-4 py-2.5 text-sm font-semibold text-[#5d6972] disabled:cursor-not-allowed";

const inputClassName =
  "w-full rounded-md border border-[#cfd7d2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#2f6f73] focus:ring-2 focus:ring-[#2f6f73]/20 disabled:bg-[#f4f1ea]";
