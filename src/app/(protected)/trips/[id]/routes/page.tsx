import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import {
  findMatchingRouteWeightPreset,
  ROUTE_WEIGHT_PRESETS,
  scoreTransportOptions,
} from "@/lib/route-score";
import {
  formatDateTimeValue,
  formatMinutes,
  formatPrice,
  getTransportModeLabel,
  getTransportStatusLabel,
  getTransportStatusTone,
  parseStoredRouteWeights,
} from "@/lib/routes";
import { toDateInputValue } from "@/lib/trip-management";

import { Notice, TripModuleNav } from "../module-nav";
import { createRoutePlanAction } from "./actions";

type RoutesPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string; message?: string }>;
};

export default async function RoutesPage({
  params,
  searchParams,
}: RoutesPageProps) {
  const { id } = await params;
  const notice = (await searchParams) ?? {};
  const trip = await prisma.trip.findUnique({
    where: { id },
    include: {
      routePlans: {
        include: {
          selectedOption: true,
          transportOptions: {
            orderBy: [{ createdAt: "asc" }],
          },
        },
        orderBy: [{ departDate: "asc" }, { createdAt: "desc" }],
      },
    },
  });

  if (!trip) {
    notFound();
  }

  const createAction = createRoutePlanAction.bind(null, trip.id);

  return (
    <section className="space-y-6">
      <TripModuleNav active="routes" tripId={trip.id} tripTitle={trip.title} />
      <Notice error={notice.error} message={notice.message} />
      <VerificationNotice />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#2f6f73]">Routes</p>
          <h1 className="mt-2 text-3xl font-semibold">交通方案管理</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5d6972]">
            手动录入路线规划和候选交通方案，按时间、费用、舒适度、中转和风险计算推荐分。
          </p>
        </div>
      </div>

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">新建路线规划</h2>
        <RoutePlanForm action={createAction} submitLabel="创建路线规划" />
      </section>

      <section className="space-y-3" data-testid="route-plan-list">
        {trip.routePlans.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#b8c8c4] bg-white p-8 text-center">
            <h2 className="text-xl font-semibold">暂无路线规划</h2>
            <p className="mt-3 text-sm text-[#5d6972]">
              可以先创建一条城市间或门到门路线，再添加火车、飞机、自驾等候选方案。
            </p>
          </div>
        ) : (
          trip.routePlans.map((routePlan) => {
            const weights = parseStoredRouteWeights(routePlan.weights);
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
            const topScore = scores[0];
            const selectedOption = routePlan.selectedOption;
            const selectedScore = selectedOption
              ? scores.find((score) => score.id === selectedOption.id)
              : null;
            const preset = findMatchingRouteWeightPreset(weights);

            return (
              <article
                className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm"
                key={routePlan.id}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">{routePlan.title}</h2>
                    <p className="mt-1 text-sm text-[#5d6972]">
                      {routePlan.fromName} → {routePlan.toName}
                    </p>
                    <p className="mt-2 text-sm text-[#5d6972]">
                      出发日期：{toDateInputValue(routePlan.departDate) || "未设置"} · 权重：
                      {preset?.label ?? "自定义权重"}
                    </p>
                  </div>
                  <Link
                    className="inline-flex w-fit justify-center rounded-md bg-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#285f62]"
                    href={`/trips/${trip.id}/routes/${routePlan.id}`}
                  >
                    查看详情与对比
                  </Link>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <SummaryCard label="候选方案" value={`${routePlan.transportOptions.length} 个`} />
                  <SummaryCard
                    label="最高推荐分"
                    value={topScore ? `${topScore.score} 分` : "待添加方案"}
                  />
                  <SummaryCard
                    label="已选方案"
                    value={
                      selectedOption
                        ? `${getTransportModeLabel(selectedOption.mode)} · ${
                            selectedScore?.score ?? "-"
                          } 分`
                        : "未选择"
                    }
                  />
                </div>

                {selectedOption ? (
                  <div className="mt-4 rounded-md border border-[#b8d8ca] bg-[#f0faf5] p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-[#276044]">
                        当前推荐：{getTransportModeLabel(selectedOption.mode)}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${getTransportStatusTone(
                          selectedOption.status,
                        )}`}
                      >
                        {getTransportStatusLabel(selectedOption.status)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-[#34434c]">
                      {selectedOption.fromName} → {selectedOption.toName} ·{" "}
                      {formatDateTimeValue(selectedOption.departTime)} /{" "}
                      {formatDateTimeValue(selectedOption.arriveTime)} ·{" "}
                      {formatMinutes(selectedOption.doorToDoorMinutes)} ·{" "}
                      {formatPrice(selectedOption.price, selectedOption.currency)}
                    </p>
                    <p className="mt-2 text-xs text-[#5d6972]">
                      请人工核验实际班次和票价。
                    </p>
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </section>
    </section>
  );
}

function RoutePlanForm({
  action,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  submitLabel: string;
}) {
  return (
    <form action={action} className="mt-4 grid gap-4 md:grid-cols-2">
      <Field label="标题" required>
        <input className={inputClassName} name="title" required />
      </Field>
      <Field label="出发日期">
        <input className={inputClassName} name="departDate" type="date" />
      </Field>
      <Field label="起点" required>
        <input className={inputClassName} name="fromName" required />
      </Field>
      <Field label="终点" required>
        <input className={inputClassName} name="toName" required />
      </Field>
      <WeightFields />
      <Field className="md:col-span-2" label="备注">
        <textarea className={`${inputClassName} min-h-24 resize-y`} name="notes" />
      </Field>
      <div className="md:col-span-2">
        <button className={primaryButtonClassName} type="submit">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function WeightFields() {
  return (
    <>
      <Field className="md:col-span-2" label="权重模式">
        <select className={inputClassName} defaultValue="balanced" name="weightPreset">
          {ROUTE_WEIGHT_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
          <option value="custom">自定义权重</option>
        </select>
      </Field>
      <div className="grid gap-3 md:col-span-2 sm:grid-cols-2 lg:grid-cols-7">
        <WeightInput label="时间" name="weightTime" value="0.25" />
        <WeightInput label="费用" name="weightCost" value="0.20" />
        <WeightInput label="舒适" name="weightComfort" value="0.15" />
        <WeightInput label="中转" name="weightTransfer" value="0.15" />
        <WeightInput label="风险" name="weightRisk" value="0.15" />
        <WeightInput label="行李" name="weightLuggage" value="0.05" />
        <WeightInput label="灵活" name="weightFlexibility" value="0.05" />
      </div>
    </>
  );
}

function WeightInput({
  label,
  name,
  value,
}: {
  label: string;
  name: string;
  value: string;
}) {
  return (
    <label>
      <span className="text-xs font-medium text-[#5d6972]">{label}</span>
      <input
        className={`${inputClassName} mt-1`}
        defaultValue={value}
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

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#e0d9cc] bg-[#fbfaf7] p-4">
      <p className="text-xs text-[#66737b]">{label}</p>
      <p className="mt-1 text-lg font-semibold text-[#172026]">{value}</p>
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

const inputClassName =
  "w-full rounded-md border border-[#cfd7d2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#2f6f73] focus:ring-2 focus:ring-[#2f6f73]/20";

const primaryButtonClassName =
  "rounded-md bg-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#285f62]";
