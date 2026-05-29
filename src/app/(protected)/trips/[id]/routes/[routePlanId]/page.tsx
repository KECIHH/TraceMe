import Link from "next/link";
import { notFound } from "next/navigation";

import { SubmitButton } from "@/components/submit-button";
import { formatDisplayDate, formatEmptyValue } from "@/lib/display-format";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_ROUTE_SCORE_WEIGHTS,
  findMatchingRouteWeightPreset,
  ROUTE_WEIGHT_PRESETS,
  scoreTransportOptions,
  type RouteScoreWeights,
} from "@/lib/route-score";
import {
  formatDateTimeInputValue,
  formatDateTimeValue,
  formatMinutes,
  formatPrice,
  getTransportModeLabel,
  getTransportStatusLabel,
  getTransportStatusTone,
  parseStoredRouteWeights,
  TRANSPORT_MODE_OPTIONS,
  TRANSPORT_STATUS_OPTIONS,
} from "@/lib/routes";
import { toDateInputValue } from "@/lib/trip-management";

import { ConfirmSubmitButton } from "../../confirm-submit-button";
import { Notice, TripModuleNav } from "../../module-nav";
import {
  createTransportOptionAction,
  deleteRoutePlanAction,
  deleteTransportOptionAction,
  selectTransportOptionAction,
  updateRoutePlanAction,
  updateTransportOptionAction,
} from "../actions";

type RoutePlanDetailPageProps = {
  params: Promise<{ id: string; routePlanId: string }>;
  searchParams?: Promise<{ error?: string; message?: string }>;
};

export default async function RoutePlanDetailPage({
  params,
  searchParams,
}: RoutePlanDetailPageProps) {
  const { id, routePlanId } = await params;
  const notice = (await searchParams) ?? {};
  const trip = await prisma.trip.findUnique({
    where: { id },
    include: {
      routePlans: {
        where: { id: routePlanId },
        include: {
          transportOptions: {
            orderBy: [{ createdAt: "asc" }],
          },
        },
      },
    },
  });

  if (!trip || trip.routePlans.length === 0) {
    notFound();
  }

  const routePlan = trip.routePlans[0];
  const weights = parseStoredRouteWeights(routePlan.weights);
  const normalizedWeights = {
    ...DEFAULT_ROUTE_SCORE_WEIGHTS,
    ...(weights ?? {}),
  };
  const scores = scoreTransportOptions(
    routePlan.transportOptions.map((option) => ({
      id: option.id,
      doorToDoorMinutes: option.doorToDoorMinutes,
      price: option.price === null ? null : Number(option.price),
      transferCount: option.transferCount,
      comfortScore: option.comfortScore,
      riskScore: option.riskScore,
      luggageFriendlyScore: option.luggageFriendlyScore,
      flexibilityScore: option.flexibilityScore,
    })),
    weights,
  );
  const scoreById = new Map(scores.map((score) => [score.id, score]));
  const updatePlanAction = updateRoutePlanAction.bind(null, trip.id, routePlan.id);
  const deletePlanAction = deleteRoutePlanAction.bind(null, trip.id, routePlan.id);
  const createOptionAction = createTransportOptionAction.bind(
    null,
    trip.id,
    routePlan.id,
  );
  const activePreset = findMatchingRouteWeightPreset(weights);

  return (
    <section className="space-y-6">
      <TripModuleNav active="routes" tripId={trip.id} tripTitle={trip.title} />
      <Notice error={notice.error} message={notice.message} />
      <VerificationNotice />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            className="text-sm font-medium text-[#2f6f73]"
            href={`/trips/${trip.id}/routes`}
          >
            返回交通方案列表
          </Link>
          <h1 className="mt-3 text-3xl font-semibold">{routePlan.title}</h1>
          <p className="mt-2 text-sm text-[#5d6972]">
            {routePlan.fromName} → {routePlan.toName} · 出发日期：
            {formatDisplayDate(routePlan.departDate)} · 权重：
            {activePreset?.label ?? "自定义权重"}
          </p>
        </div>
        <form action={deletePlanAction}>
          <ConfirmSubmitButton
            className="rounded-md border border-[#d46a55] px-3 py-2 text-sm font-semibold text-[#9b2f1f] transition hover:bg-[#fff2ee]"
            message={`确定删除路线规划“${routePlan.title}”吗？相关交通方案也会删除。`}
          >
            删除路线规划
          </ConfirmSubmitButton>
        </form>
      </div>

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">路线详情与权重设置</h2>
        <RoutePlanForm
          action={updatePlanAction}
          routePlan={{
            title: routePlan.title,
            fromName: routePlan.fromName,
            toName: routePlan.toName,
            departDate: routePlan.departDate,
            notes: routePlan.notes,
          }}
          selectedPreset={activePreset?.id ?? "custom"}
          submitLabel="保存路线规划和权重"
          weights={normalizedWeights}
        />
      </section>

      <section
        className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm"
        data-testid="add-transport-option"
      >
        <h2 className="text-lg font-semibold">添加交通方案</h2>
        <TransportOptionForm
          action={createOptionAction}
          defaultCurrency={trip.baseCurrency}
          defaultFromName={routePlan.fromName}
          defaultToName={routePlan.toName}
          submitLabel="添加交通方案"
        />
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">交通方案列表</h2>
            <p className="mt-1 text-sm text-[#5d6972]">
              风险评分定义为风险程度：0 代表低风险，100 代表高风险；评分时会转换为安全得分。
            </p>
          </div>
        </div>

        {routePlan.transportOptions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#b8c8c4] bg-white p-8 text-center">
            <h2 className="text-xl font-semibold">暂无交通方案</h2>
            <p className="mt-3 text-sm text-[#5d6972]">
              添加至少一个方案后即可看到推荐分；即使只有一个方案也会计算分数。
            </p>
          </div>
        ) : (
          routePlan.transportOptions.map((option) => {
            const score = scoreById.get(option.id);
            const updateAction = updateTransportOptionAction.bind(
              null,
              trip.id,
              routePlan.id,
              option.id,
            );
            const deleteAction = deleteTransportOptionAction.bind(
              null,
              trip.id,
              routePlan.id,
              option.id,
            );
            const selectAction = selectTransportOptionAction.bind(
              null,
              trip.id,
              routePlan.id,
              option.id,
            );
            const isSelected = routePlan.selectedOptionId === option.id;

            return (
              <article
                className={[
                  "rounded-lg border bg-white p-5 shadow-sm",
                  isSelected ? "border-[#7bb99c]" : "border-[#d8d2c6]",
                ].join(" ")}
                data-testid="transport-option-card"
                id={`option-${option.id}`}
                key={option.id}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-xl font-semibold">
                        {getTransportModeLabel(option.mode)}
                      </h3>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${getTransportStatusTone(
                          option.status,
                        )}`}
                      >
                        {getTransportStatusLabel(option.status)}
                      </span>
                      {isSelected ? (
                        <span className="rounded-full bg-[#2f6f73] px-2.5 py-1 text-xs font-medium text-white">
                          当前推荐
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-[#5d6972]">
                      {option.fromName} → {option.toName}
                    </p>
                    <p className="mt-2 text-sm text-[#5d6972]">
                      {option.provider || "承运方待补充"}
                      {option.trainOrFlightNo ? ` · ${option.trainOrFlightNo}` : ""}
                    </p>
                  </div>
                  <div className="text-left lg:text-right">
                    <p className="text-sm text-[#66737b]">推荐分</p>
                    <p className="mt-1 text-3xl font-semibold text-[#2f6f73]">
                      {score ? score.score : "-"}
                    </p>
                    {score?.isIncomplete ? (
                      <p className="mt-1 text-xs text-[#9b2f1f]">
                        评分不完整：缺少{score.missingRequiredFields.includes("time") ? "时间" : ""}
                        {score.missingRequiredFields.length === 2 ? "和" : ""}
                        {score.missingRequiredFields.includes("cost") ? "价格" : ""}
                      </p>
                    ) : null}
                  </div>
                </div>

                <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <Info label="出发/到达" value={`${formatDateTimeValue(option.departTime)} / ${formatDateTimeValue(option.arriveTime)}`} />
                  <Info label="总耗时" value={formatMinutes(option.doorToDoorMinutes)} />
                  <Info label="价格" value={formatPrice(option.price, option.currency)} />
                      <Info
                        label="中转次数"
                        value={formatEmptyValue(option.transferCount)}
                      />
                  <Info label="舒适度" value={formatScore(option.comfortScore)} />
                  <Info label="风险评分" value={formatScore(option.riskScore)} />
                  <Info label="行李友好度" value={formatScore(option.luggageFriendlyScore)} />
                  <Info label="退改灵活度" value={formatScore(option.flexibilityScore)} />
                </dl>

                {option.bookingUrl ? (
                  <Link
                    className="mt-4 inline-flex text-sm font-medium text-[#2f6f73]"
                    href={option.bookingUrl}
                    target="_blank"
                  >
                    打开预订链接
                  </Link>
                ) : null}
                {option.notes ? (
                  <p className="mt-4 rounded-md bg-[#fbfaf7] p-3 text-sm leading-6 text-[#5d6972]">
                    {option.notes}
                  </p>
                ) : null}
                <p className="mt-4 text-xs text-[#9b2f1f]">
                  请人工核验实际班次和票价。
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <form action={selectAction}>
                    <SubmitButton
                      className="rounded-md bg-[#2f6f73] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#285f62]"
                      pendingLabel="选择中..."
                    >
                      选择为推荐方案
                    </SubmitButton>
                  </form>
                  <form action={deleteAction}>
                    <ConfirmSubmitButton
                      className="rounded-md border border-[#d46a55] px-3 py-2 text-sm font-semibold text-[#9b2f1f] transition hover:bg-[#fff2ee]"
                      message={
                        isSelected
                          ? `“${getTransportModeLabel(option.mode)}”是当前已选择方案，确定删除吗？`
                          : `确定删除“${getTransportModeLabel(option.mode)}”方案吗？`
                      }
                    >
                      删除方案
                    </ConfirmSubmitButton>
                  </form>
                </div>

                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-semibold text-[#2f6f73]">
                    编辑交通方案
                  </summary>
                  <div className="mt-4 border-t border-[#e0d9cc] pt-4">
                    <TransportOptionForm
                      action={updateAction}
                      defaultCurrency={trip.baseCurrency}
                      option={option}
                      submitLabel="保存交通方案"
                    />
                  </div>
                </details>
              </article>
            );
          })
        )}
      </section>

      {routePlan.transportOptions.length > 0 ? (
        <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold">横向对比</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[900px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[#e0d9cc] text-[#66737b]">
                  <th className="py-3 pr-4">方案</th>
                  <th className="py-3 pr-4">时间</th>
                  <th className="py-3 pr-4">价格</th>
                  <th className="py-3 pr-4">中转</th>
                  <th className="py-3 pr-4">舒适度</th>
                  <th className="py-3 pr-4">风险评分</th>
                  <th className="py-3 pr-4">行李</th>
                  <th className="py-3 pr-4">灵活度</th>
                  <th className="py-3 pr-4">总分</th>
                </tr>
              </thead>
              <tbody>
                {routePlan.transportOptions.map((option) => {
                  const score = scoreById.get(option.id);

                  return (
                    <tr className="border-b border-[#f0ece4]" key={option.id}>
                      <td className="py-3 pr-4 font-medium">
                        {getTransportModeLabel(option.mode)}
                      </td>
                      <td className="py-3 pr-4">{formatMinutes(option.doorToDoorMinutes)}</td>
                      <td className="py-3 pr-4">{formatPrice(option.price, option.currency)}</td>
                      <td className="py-3 pr-4">{formatEmptyValue(option.transferCount)}</td>
                      <td className="py-3 pr-4">{formatScore(option.comfortScore)}</td>
                      <td className="py-3 pr-4">{formatScore(option.riskScore)}</td>
                      <td className="py-3 pr-4">{formatScore(option.luggageFriendlyScore)}</td>
                      <td className="py-3 pr-4">{formatScore(option.flexibilityScore)}</td>
                      <td className="py-3 pr-4 font-semibold text-[#2f6f73]">
                        {score ? `${score.score} 分` : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </section>
  );
}

function RoutePlanForm({
  action,
  routePlan,
  selectedPreset,
  submitLabel,
  weights,
}: {
  action: (formData: FormData) => Promise<void>;
  routePlan: {
    title: string;
    fromName: string;
    toName: string;
    departDate: Date | null;
    notes: string | null;
  };
  selectedPreset: string;
  submitLabel: string;
  weights: RouteScoreWeights;
}) {
  return (
    <form action={action} className="mt-4 grid gap-4 md:grid-cols-2">
      <Field label="标题" required>
        <input className={inputClassName} defaultValue={routePlan.title} name="title" required />
      </Field>
      <Field label="出发日期">
        <input className={inputClassName} defaultValue={toDateInputValue(routePlan.departDate)} name="departDate" type="date" />
      </Field>
      <Field label="起点" required>
        <input className={inputClassName} defaultValue={routePlan.fromName} name="fromName" required />
      </Field>
      <Field label="终点" required>
        <input className={inputClassName} defaultValue={routePlan.toName} name="toName" required />
      </Field>
      <Field className="md:col-span-2" label="权重模式">
        <select className={inputClassName} defaultValue={selectedPreset} name="weightPreset">
          {ROUTE_WEIGHT_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
          <option value="custom">自定义权重</option>
        </select>
      </Field>
      <div className="grid gap-3 md:col-span-2 sm:grid-cols-2 lg:grid-cols-7">
        <WeightInput label="时间" name="weightTime" value={weights.time} />
        <WeightInput label="费用" name="weightCost" value={weights.cost} />
        <WeightInput label="舒适" name="weightComfort" value={weights.comfort} />
        <WeightInput label="中转" name="weightTransfer" value={weights.transfer} />
        <WeightInput label="风险" name="weightRisk" value={weights.risk} />
        <WeightInput label="行李" name="weightLuggage" value={weights.luggage} />
        <WeightInput label="灵活" name="weightFlexibility" value={weights.flexibility} />
      </div>
      <Field className="md:col-span-2" label="备注">
        <textarea
          className={`${inputClassName} min-h-24 resize-y`}
          defaultValue={routePlan.notes ?? ""}
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

function TransportOptionForm({
  action,
  defaultCurrency,
  defaultFromName = "",
  defaultToName = "",
  option,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  defaultCurrency: string;
  defaultFromName?: string;
  defaultToName?: string;
  option?: {
    fromName: string;
    toName: string;
    mode: string;
    provider: string | null;
    trainOrFlightNo: string | null;
    departTime: Date | null;
    arriveTime: Date | null;
    doorToDoorMinutes: number | null;
    price: unknown;
    currency: string | null;
    transferCount: number | null;
    comfortScore: number | null;
    riskScore: number | null;
    luggageFriendlyScore: number | null;
    flexibilityScore: number | null;
    bookingUrl: string | null;
    status: string;
    notes: string | null;
  };
  submitLabel: string;
}) {
  return (
    <form action={action} className="mt-4 grid gap-4 md:grid-cols-2">
      <Field label="起点" required>
        <input className={inputClassName} defaultValue={option?.fromName ?? defaultFromName} name="fromName" required />
      </Field>
      <Field label="终点" required>
        <input className={inputClassName} defaultValue={option?.toName ?? defaultToName} name="toName" required />
      </Field>
      <Field label="交通方式">
        <select className={inputClassName} defaultValue={option?.mode ?? "TRAIN"} name="mode">
          {TRANSPORT_MODE_OPTIONS.map((mode) => (
            <option key={mode.value} value={mode.value}>
              {mode.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="状态">
        <select className={inputClassName} defaultValue={option?.status ?? "CANDIDATE"} name="status">
          {TRANSPORT_STATUS_OPTIONS.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="承运方/平台">
        <input className={inputClassName} defaultValue={option?.provider ?? ""} name="provider" />
      </Field>
      <Field label="车次/航班号">
        <input className={inputClassName} defaultValue={option?.trainOrFlightNo ?? ""} name="trainOrFlightNo" />
      </Field>
      <Field label="出发时间">
        <input className={inputClassName} defaultValue={formatDateTimeInputValue(option?.departTime)} name="departTime" type="datetime-local" />
      </Field>
      <Field label="到达时间">
        <input className={inputClassName} defaultValue={formatDateTimeInputValue(option?.arriveTime)} name="arriveTime" type="datetime-local" />
      </Field>
      <Field label="门到门总耗时，分钟">
        <input className={inputClassName} defaultValue={option?.doorToDoorMinutes ?? ""} min="0" name="doorToDoorMinutes" step="1" type="number" />
      </Field>
      <Field label="价格">
        <input className={inputClassName} defaultValue={option?.price === null || option?.price === undefined ? "" : String(option.price)} min="0" name="price" step="0.01" type="number" />
      </Field>
      <Field label="货币">
        <input className={inputClassName} defaultValue={option?.currency ?? defaultCurrency} maxLength={3} name="currency" />
      </Field>
      <Field label="中转次数">
        <input className={inputClassName} defaultValue={option?.transferCount ?? ""} min="0" name="transferCount" step="1" type="number" />
      </Field>
      <Field label="舒适度评分，0-100">
        <input className={inputClassName} defaultValue={option?.comfortScore ?? ""} max="100" min="0" name="comfortScore" step="1" type="number" />
      </Field>
      <Field label="风险评分，0-100，越高风险越高">
        <input className={inputClassName} defaultValue={option?.riskScore ?? ""} max="100" min="0" name="riskScore" step="1" type="number" />
      </Field>
      <Field label="行李友好度，0-100">
        <input className={inputClassName} defaultValue={option?.luggageFriendlyScore ?? ""} max="100" min="0" name="luggageFriendlyScore" step="1" type="number" />
      </Field>
      <Field label="退改灵活度，0-100">
        <input className={inputClassName} defaultValue={option?.flexibilityScore ?? ""} max="100" min="0" name="flexibilityScore" step="1" type="number" />
      </Field>
      <Field className="md:col-span-2" label="预订链接">
        <input className={inputClassName} defaultValue={option?.bookingUrl ?? ""} name="bookingUrl" type="url" />
      </Field>
      <Field className="md:col-span-2" label="备注">
        <textarea className={`${inputClassName} min-h-24 resize-y`} defaultValue={option?.notes ?? ""} name="notes" />
      </Field>
      <div className="md:col-span-2">
        <SubmitButton className={primaryButtonClassName}>
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}

function WeightInput({
  label,
  name,
  value,
}: {
  label: string;
  name: string;
  value: number;
}) {
  return (
    <label>
      <span className="text-xs font-medium text-[#5d6972]">{label}</span>
      <input
        className={`${inputClassName} mt-1`}
        defaultValue={value.toFixed(2)}
        min="0"
        name={name}
        step="0.01"
        type="number"
      />
    </label>
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[#7a858c]">{label}</dt>
      <dd className="mt-1 font-medium text-[#34434c]">{value}</dd>
    </div>
  );
}

function VerificationNotice() {
  return (
    <div className="rounded-md border border-[#f0d99a] bg-[#fff9e8] px-4 py-3 text-sm leading-6 text-[#6d5412]">
      本阶段不接入实时票务 API，不爬取第三方平台。所有班次、价格、时间由用户手动录入；
      请以官方渠道和购票平台实际信息为准。
    </div>
  );
}

function formatScore(value: number | null | undefined): string {
  return formatEmptyValue(value);
}

const inputClassName =
  "w-full rounded-md border border-[#cfd7d2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#2f6f73] focus:ring-2 focus:ring-[#2f6f73]/20";

const primaryButtonClassName =
  "rounded-md bg-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#285f62]";
