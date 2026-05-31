import type { ItineraryItemStatus } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SubmitButton } from "@/components/submit-button";
import {
  EmptyState,
  secondaryButtonClassName,
  StatusPill,
} from "@/components/ui";
import { BUDGET_CATEGORIES, calculateConvertedSpent, formatMoney } from "@/lib/budget";
import { requireTripAccess } from "@/lib/collaboration";
import {
  formatDisplayDate,
  formatDisplayTime,
  formatEmptyValue,
} from "@/lib/display-format";
import { formatWeatherSnapshot, toDateKey } from "@/lib/external/weather";
import {
  formatDateTitle,
  formatTimeRange,
  getItineraryItemTypeLabel,
  getItineraryStatusLabel,
  isDateInRange,
} from "@/lib/itinerary";
import { prisma } from "@/lib/prisma";
import {
  getNextTodayStep,
  resolveTodayExecutionDay,
  summarizeTodayForOffline,
} from "@/lib/today";

import { refreshWeatherAction } from "../external-actions";
import { Notice, TripModuleNav } from "../module-nav";
import { TodayAiAdjustmentForm } from "./today-ai-adjustment-form";
import { TodayNetworkBadge } from "./today-network-badge";
import { TodayQuickRecordForm } from "./today-quick-record-form";
import { TodayStatusButton } from "./today-status-button";

type TodayPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string; message?: string }>;
};

export default async function TodayPage({
  params,
  searchParams,
}: TodayPageProps) {
  const { id } = await params;
  const queryParams = (await searchParams) ?? {};
  const { access } = await requireTripAccess(id, "read");
  const canEdit = access.canEdit;

  const now = new Date();
  const trip = await prisma.trip.findUnique({
    include: {
      aiDrafts: {
        orderBy: { createdAt: "desc" },
        take: 3,
        where: { status: "draft", type: "today-adjustment" },
      },
      categoryBudgets: true,
      checklistItems: {
        orderBy: [{ dueDate: "asc" }, { importance: "desc" }, { createdAt: "asc" }],
        take: 80,
      },
      destinations: { orderBy: [{ arrivalDate: "asc" }, { name: "asc" }] },
      documents: {
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, type: true },
        take: 3,
      },
      expenses: {
        include: { relatedPlace: { select: { name: true } } },
        orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
        take: 60,
      },
      itineraryDays: {
        include: {
          items: {
            include: {
              place: { select: { id: true, name: true, type: true } },
            },
            orderBy: [
              { sortOrder: "asc" },
              { startTime: "asc" },
              { createdAt: "asc" },
            ],
          },
        },
        orderBy: { date: "asc" },
      },
      places: {
        orderBy: [{ type: "asc" }, { updatedAt: "desc" }, { name: "asc" }],
        select: { address: true, id: true, name: true, phone: true, type: true },
        take: 80,
      },
      transports: {
        orderBy: [{ departTime: "asc" }, { createdAt: "asc" }],
        take: 40,
      },
      weatherSnapshots: {
        orderBy: { fetchedAt: "desc" },
      },
    },
    where: { id },
  });

  if (!trip) {
    notFound();
  }

  const { day: todayDay, isExactToday } = resolveTodayExecutionDay(
    now,
    trip.itineraryDays,
  );
  const inTripRange = isDateInRange(now, trip.startDate, trip.endDate);
  const nextStep = todayDay ? getNextTodayStep(now, todayDay.items) : null;
  const todayKey = todayDay ? toDateKey(todayDay.date) : toDateKey(now);
  const weatherSnapshot = todayDay
    ? trip.weatherSnapshots.find(
        (snapshot) => toDateKey(snapshot.date) === toDateKey(todayDay.date),
      ) ?? null
    : null;
  const currentDestinations = trip.destinations.filter((destination) =>
    isDateCovered(todayDay?.date ?? now, destination.arrivalDate, destination.departureDate),
  );
  const todayTransports = trip.transports.filter((transport) =>
    [transport.departTime, transport.arriveTime].some(
      (date) => date && toDateKey(date) === todayKey,
    ),
  );
  const lodging = trip.places.filter((place) => place.type === "HOTEL").slice(0, 4);
  const dueChecklist = trip.checklistItems
    .filter((item) => item.status === "TODO")
    .filter((item) => !item.dueDate || toDateKey(item.dueDate) <= todayKey)
    .slice(0, 6);
  const todayExpenses = trip.expenses.filter((expense) =>
    expense.paidAt ? toDateKey(expense.paidAt) === todayKey : false,
  );
  const spentToday = calculateConvertedSpent(todayExpenses, trip.baseCurrency);
  const offlinePreview = summarizeTodayForOffline({
    checklist: trip.checklistItems,
    day: todayDay,
    expenses: todayExpenses,
    now,
  });
  const refreshWeather = refreshWeatherAction.bind(null, trip.id);

  return (
    <section className="mx-auto max-w-3xl space-y-5 pb-24 sm:pb-6">
      <TripModuleNav active="today" tripId={trip.id} tripTitle={trip.title} />
      <Notice error={queryParams.error} message={queryParams.message} />

      <div className="rounded-lg border border-[#b8d8ca] bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-[#2f6f73]">今日执行</p>
          <TodayNetworkBadge />
        </div>
        <h1 className="mt-2 text-3xl font-semibold">{trip.title}</h1>
        <p className="mt-2 text-sm leading-6 text-[#5d6972]">
          {formatDisplayDate(now)} / {formatDisplayTime(now)}
        </p>
      </div>

      {!todayDay ? (
        <EmptyState
          actionHref={`/trips/${trip.id}/itinerary`}
          actionLabel="生成行程日期"
          description="先在行程日历里生成日期并添加当天安排，今日执行页会自动读取。"
          title="还没有可查看的今日行程"
        />
      ) : (
        <>
          <section className="rounded-lg border border-[#d8d2c6] bg-white p-4 shadow-sm sm:p-5">
            <p className="text-sm text-[#66737b]">
              {isExactToday
                ? "今天"
                : inTripRange
                  ? "旅行日期内最近一天"
                  : "最近行程日"}
            </p>
            <h2 className="mt-1 text-2xl font-semibold">
              {formatDateTitle(todayDay.date)}
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <InfoTile label="目的地" value={formatList(currentDestinations.map((item) => item.name)) || trip.mainDestination} />
              <InfoTile label="城市" value={todayDay.city} />
              <InfoTile
                label="天气"
                value={
                  weatherSnapshot
                    ? formatWeatherSnapshot(weatherSnapshot)
                    : todayDay.weatherSummary
                }
              />
            </div>
            <form action={refreshWeather} className="mt-4">
              <input name="returnTo" type="hidden" value={`/trips/${trip.id}/today`} />
              <input name="forceRefresh" type="hidden" value="true" />
              <SubmitButton
                className={secondaryButtonClassName}
                data-testid="today-refresh-weather"
                pendingLabel="刷新中..."
              >
                刷新天气
              </SubmitButton>
            </form>
            <p className="mt-3 text-xs text-[#7a858c]">
              外部数据仅供参考，请人工核验。
            </p>
          </section>

          <section className="rounded-lg border border-[#2f6f73] bg-[#fbfffd] p-4 shadow-sm sm:p-5">
            <p className="text-sm font-semibold text-[#2f6f73]">下一步去哪</p>
            <p className="sr-only">下一项行程</p>
            {nextStep ? (
              <div className="mt-3" data-testid="today-next-step">
                <p className="text-sm font-semibold text-[#172026]">
                  {formatTimeRange(nextStep.item.startTime, nextStep.item.endTime)}
                </p>
                <h2 className="mt-2 text-2xl font-semibold">{nextStep.item.title}</h2>
                <p className="mt-2 text-sm text-[#5d6972]">
                  {getItineraryItemTypeLabel(nextStep.item.type)}
                  {nextStep.item.place ? ` / ${nextStep.item.place.name}` : ""}
                  {nextStep.reason === "delayed" ? " / 已延后，优先确认" : ""}
                </p>
                {nextStep.item.transportToNext ? (
                  <p className="mt-3 rounded-md bg-white px-3 py-2 text-sm text-[#34434c]">
                    交通：{nextStep.item.transportToNext}
                  </p>
                ) : null}
                {canEdit ? (
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <TodayStatusButton
                      itemId={nextStep.item.id}
                      label="完成"
                      status="DONE"
                      testId="today-complete-item"
                      tripId={trip.id}
                    />
                    <TodayStatusButton
                      itemId={nextStep.item.id}
                      label="跳过"
                      status="SKIPPED"
                      testId="today-skip-item"
                      tripId={trip.id}
                    />
                    <TodayStatusButton
                      itemId={nextStep.item.id}
                      label="延后"
                      status="DELAYED"
                      testId="today-delay-item"
                      tripId={trip.id}
                    />
                  </div>
                ) : (
                  <ReadOnlyNotice />
                )}
              </div>
            ) : (
              <p className="mt-3 rounded-md bg-white px-4 py-5 text-sm text-[#5d6972]">
                今天没有待执行行程。
              </p>
            )}
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <InfoTile
              label="今日交通"
              value={
                todayTransports[0]
                  ? `${todayTransports[0].fromName} → ${todayTransports[0].toName}`
                  : null
              }
            />
            <InfoTile
              label="住宿"
              value={lodging[0] ? [lodging[0].name, lodging[0].address].filter(Boolean).join(" / ") : null}
            />
            <InfoTile
              label="清单"
              value={
                dueChecklist.length > 0
                  ? `${dueChecklist.length} 项待处理`
                  : "暂无到期清单"
              }
            />
            <InfoTile
              label="今日支出"
              value={formatMoney(spentToday, trip.baseCurrency)}
            />
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">今日全部行程</h2>
            {todayDay.items.length === 0 ? (
              <EmptyState
                actionHref={`/trips/${trip.id}/itinerary`}
                actionLabel="添加今日行程"
                description="今天还没有行程项。"
                title="暂无今日行程"
              />
            ) : (
              todayDay.items.map((item) => (
                <article
                  className={[
                    "rounded-lg border p-4 shadow-sm",
                    item.status === "DONE"
                      ? "border-[#d8d2c6] bg-white opacity-70"
                      : item.status === "SKIPPED"
                        ? "border-[#f0d39b] bg-[#fff9e8]"
                        : item.status === "DELAYED"
                          ? "border-[#b8d8ca] bg-[#f0faf5]"
                          : "border-[#d8d2c6] bg-white",
                  ].join(" ")}
                  data-testid="today-item-card"
                  key={item.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#172026]">
                        {formatTimeRange(item.startTime, item.endTime)}
                      </p>
                      <h3 className="mt-1 break-words text-lg font-semibold">
                        {item.title}
                      </h3>
                      <p className="mt-1 text-sm text-[#5d6972]">
                        {item.place?.name ?? getItineraryItemTypeLabel(item.type)}
                      </p>
                    </div>
                    <StatusPill tone={statusTone(item.status)}>
                      {getItineraryStatusLabel(item.status)}
                    </StatusPill>
                  </div>
                  {canEdit ? (
                    <div className="mt-3 grid grid-cols-4 gap-2">
                      <TodayStatusButton itemId={item.id} label="完成" status="DONE" tripId={trip.id} />
                      <TodayStatusButton itemId={item.id} label="跳过" status="SKIPPED" tripId={trip.id} />
                      <TodayStatusButton itemId={item.id} label="延后" status="DELAYED" tripId={trip.id} />
                      <TodayStatusButton itemId={item.id} label="恢复" status="PLANNED" tripId={trip.id} />
                    </div>
                  ) : null}
                </article>
              ))
            )}
          </section>
        </>
      )}

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-xl font-semibold">快速记录</h2>
        {canEdit ? (
          <TodayQuickRecordForm
            baseCurrency={trip.baseCurrency}
            categories={BUDGET_CATEGORIES}
            tripId={trip.id}
          />
        ) : (
          <ReadOnlyNotice />
        )}
      </section>

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">AI 调整草稿</h2>
            <p className="mt-1 text-sm text-[#5d6972]">
              建议进入草稿，不直接覆盖原计划。
            </p>
          </div>
          <Link className={secondaryButtonClassName} href={`/trips/${trip.id}/ai`}>
            查看草稿
          </Link>
        </div>
        {canEdit ? <TodayAiAdjustmentForm tripId={trip.id} /> : <ReadOnlyNotice />}
        <div className="mt-4 space-y-3">
          {trip.aiDrafts.length === 0 ? (
            <p className="rounded-md border border-dashed border-[#b8c8c4] p-4 text-sm text-[#5d6972]">
              暂无今日调整草稿。
            </p>
          ) : (
            trip.aiDrafts.map((draft) => (
              <article
                className="rounded-md border border-[#e0d9cc] bg-[#fbfaf7] p-4"
                data-testid="today-ai-draft-card"
                key={draft.id}
              >
                <h3 className="font-semibold">{draft.title}</h3>
                <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-[#5d6972]">
                  {draft.contentText}
                </p>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-xl font-semibold">离线摘要</h2>
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <InfoTile label="下一步" value={offlinePreview.nextStep?.title ?? null} />
          <InfoTile label="待办清单" value={`${offlinePreview.checklistOpen.length} 项`} />
          <InfoTile label="今日支出" value={`${offlinePreview.spentToday.length} 笔`} />
          <InfoTile label="缓存入口" value="点击顶部“刷新离线缓存”" />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <QuickLink
          description={
            lodging[0]?.name ??
            "查看住宿清单和酒店地址"
          }
          href={`/trips/${trip.id}/stays`}
          title="酒店/住宿入口"
        />
        <QuickLink
          description={trip.documents[0]?.title ?? "查看票据、证件和订单文件"}
          href={`/trips/${trip.id}/documents`}
          title="文件票据入口"
        />
        <QuickLink
          description={
            todayTransports[0]
              ? `${todayTransports[0].fromName} → ${todayTransports[0].toName}`
              : "查看路线规划和候选交通方案"
          }
          href={`/trips/${trip.id}/routes`}
          title="交通方案入口"
        />
        <QuickLink
          description="查看攻略笔记、紧急备注和临时信息"
          href={`/trips/${trip.id}/notes`}
          title="紧急备注入口"
        />
      </section>
    </section>
  );
}

function InfoTile({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="rounded-lg border border-[#d8d2c6] bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-[#7a858c]">{label}</p>
      <p className="mt-1 break-words font-semibold text-[#34434c]">
        {formatEmptyValue(value)}
      </p>
    </div>
  );
}

function QuickLink({
  description,
  href,
  title,
}: {
  description: string;
  href: string;
  title: string;
}) {
  return (
    <Link
      className="rounded-lg border border-[#d8d2c6] bg-white p-4 shadow-sm transition hover:border-[#2f6f73] hover:bg-[#f8fbfa]"
      href={href}
    >
      <p className="text-sm font-semibold text-[#2f6f73]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[#5d6972]">{description}</p>
    </Link>
  );
}

function ReadOnlyNotice() {
  return (
    <p
      className="mt-3 rounded-md border border-[#e0d9cc] bg-[#fbfaf7] px-3 py-2 text-sm text-[#5d6972]"
      data-testid="today-readonly-notice"
    >
      你当前只有查看权限，无法修改今日行程或新增记录。
    </p>
  );
}

function statusTone(
  status: ItineraryItemStatus,
): "muted" | "neutral" | "success" | "warning" {
  if (status === "DONE") {
    return "success";
  }
  if (status === "SKIPPED" || status === "DELAYED") {
    return "warning";
  }
  return "muted";
}

function isDateCovered(
  date: Date,
  startDate: Date | null,
  endDate: Date | null,
): boolean {
  if (!startDate && !endDate) {
    return false;
  }

  const target = toDateKey(date);
  const start = startDate ? toDateKey(startDate) : target;
  const end = endDate ? toDateKey(endDate) : target;

  return target >= start && target <= end;
}

function formatList(values: string[]): string | null {
  return values.length > 0 ? values.join(" / ") : null;
}
