import Link from "next/link";
import { notFound } from "next/navigation";

import { SubmitButton } from "@/components/submit-button";
import {
  EmptyState,
  secondaryButtonClassName,
  StatusPill,
} from "@/components/ui";
import {
  formatDisplayDate,
  formatDisplayTime,
  formatEmptyValue,
} from "@/lib/display-format";
import { formatWeatherSnapshot, toDateKey } from "@/lib/external/weather";
import {
  analyzeItineraryDay,
  formatDateTitle,
  formatTimeRange,
  getItineraryItemTypeLabel,
  getItineraryPriorityLabel,
  getItineraryStatusLabel,
  getNearestItineraryDay,
  getNextItineraryItem,
  getTodayDateMatch,
  isDateInRange,
} from "@/lib/itinerary";
import { prisma } from "@/lib/prisma";

import { Notice, TripModuleNav } from "../module-nav";
import { refreshWeatherAction } from "../external-actions";
import { updateItineraryItemStatusAction } from "../itinerary/actions";

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
  const now = new Date();
  const trip = await prisma.trip.findUnique({
    include: {
      documents: {
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, type: true },
        take: 3,
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
        orderBy: { name: "asc" },
        select: { id: true, name: true, address: true, type: true },
        where: { type: "HOTEL" },
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

  const exactToday = getTodayDateMatch(now, trip.itineraryDays);
  const nearestDay = getNearestItineraryDay(now, trip.itineraryDays);
  const displayDay = exactToday ?? nearestDay;
  const fullDisplayDay = displayDay
    ? trip.itineraryDays.find((day) => day.id === displayDay.id) ?? null
    : null;
  const inTripRange = isDateInRange(now, trip.startDate, trip.endDate);
  const alerts = fullDisplayDay ? analyzeItineraryDay(fullDisplayDay.items) : [];
  const nextItem = fullDisplayDay
    ? getNextItineraryItem(now, fullDisplayDay.items) ??
      fullDisplayDay.items.find((item) => item.status === "PLANNED") ??
      null
    : null;
  const lodgingItems =
    fullDisplayDay?.items.filter((item) => item.type === "LODGING") ?? [];
  const weatherSnapshot = fullDisplayDay
    ? trip.weatherSnapshots.find(
        (snapshot) => toDateKey(snapshot.date) === toDateKey(fullDisplayDay.date),
      ) ?? null
    : null;
  const refreshWeather = refreshWeatherAction.bind(null, trip.id);

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <TripModuleNav active="today" tripId={trip.id} tripTitle={trip.title} />
      <Notice error={queryParams.error} message={queryParams.message} />

      <div className="rounded-lg border border-[#b8d8ca] bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-[#2f6f73]">今日模式</p>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">{trip.title}</h1>
            <p className="mt-2 text-sm leading-6 text-[#5d6972]">
              {formatDisplayDate(now)} · 当前时间 {formatDisplayTime(now)}
            </p>
          </div>
          <Link
            className={secondaryButtonClassName}
            href={`/trips/${trip.id}/itinerary`}
          >
            返回行程日历
          </Link>
        </div>
      </div>

      {!fullDisplayDay ? (
        <EmptyState
          actionHref={`/trips/${trip.id}/itinerary`}
          actionLabel="生成行程日期"
          description="先在行程日历里生成日期并添加当天安排，之后这里会自动显示最接近今天的一天。"
          title="还没有可查看的今日行程"
        />
      ) : (
        <>
          <div className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
            <p className="text-sm text-[#66737b]">
              {exactToday
                ? "今天在旅行日期中"
                : inTripRange
                  ? "今天在旅行日期内，但还没有生成今天的行程日期"
                  : "当前不在旅行日期范围内，显示最近一天"}
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              {formatDateTitle(fullDisplayDay.date)}
            </h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <TodayInfo label="今日城市" value={fullDisplayDay.city} />
              <TodayInfo label="主题" value={fullDisplayDay.theme} />
              <TodayInfo
                label="天气"
                value={
                  weatherSnapshot
                    ? formatWeatherSnapshot(weatherSnapshot)
                    : fullDisplayDay.weatherSummary
                }
              />
            </dl>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-[#7a858c]">
                外部数据仅供参考，请人工核验。
              </p>
              <form action={refreshWeather}>
                <input name="returnTo" type="hidden" value={`/trips/${trip.id}/today`} />
                <input name="forceRefresh" type="hidden" value="true" />
                <SubmitButton
                  className={secondaryButtonClassName}
                  data-testid="today-refresh-weather"
                  pendingLabel="刷新中..."
                >
                  手动刷新天气
                </SubmitButton>
              </form>
            </div>
            {alerts.length > 0 ? (
              <p className="mt-3 rounded-md border border-[#f0d39b] bg-[#fff9e8] px-3 py-2 text-sm text-[#73530f]">
                今天有 {alerts.length} 条提醒，请留意节奏。
              </p>
            ) : null}
          </div>

          <section className="rounded-lg border border-[#2f6f73] bg-[#fbfffd] p-5 shadow-sm">
            <p className="text-sm font-semibold text-[#2f6f73]">下一项行程</p>
            {nextItem ? (
              <div className="mt-3">
                <p className="text-sm font-semibold text-[#172026]">
                  {formatTimeRange(nextItem.startTime, nextItem.endTime)}
                </p>
                <h2 className="mt-2 text-2xl font-semibold">{nextItem.title}</h2>
                <p className="mt-2 text-sm text-[#5d6972]">
                  {getItineraryItemTypeLabel(nextItem.type)}
                  {nextItem.place ? ` · ${nextItem.place.name}` : ""}
                </p>
                <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
                  <StatusButton
                    itemId={nextItem.id}
                    label="一键标记完成"
                    status="DONE"
                    tripId={trip.id}
                  />
                  <StatusButton
                    itemId={nextItem.id}
                    label="一键标记跳过"
                    status="SKIPPED"
                    tripId={trip.id}
                  />
                </div>
              </div>
            ) : (
              <p className="mt-3 rounded-md bg-white px-4 py-5 text-sm text-[#5d6972]">
                今天没有待处理的下一项，可以慢慢走，或去行程日历补充安排。
              </p>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">今日全部行程</h2>
            {fullDisplayDay.items.length === 0 ? (
              <EmptyState
                actionHref={`/trips/${trip.id}/itinerary`}
                actionLabel="添加今日行程"
                description="今天暂时没有行程项，可以添加交通、餐饮、景点或住宿安排。"
                title="暂无今日行程"
              />
            ) : (
              fullDisplayDay.items.map((item) => (
                <article
                  className={[
                    "rounded-lg border p-4 shadow-sm",
                    item.status === "DONE"
                      ? "border-[#d8d2c6] bg-white opacity-65"
                      : item.status === "SKIPPED"
                        ? "border-[#f0d39b] bg-[#fff9e8]"
                        : "border-[#d8d2c6] bg-white",
                  ].join(" ")}
                  data-testid="today-item-card"
                  key={item.id}
                >
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="shrink-0 text-sm font-semibold text-[#172026] sm:w-24">
                      {formatTimeRange(item.startTime, item.endTime)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap gap-2">
                        <StatusPill>
                          {getItineraryItemTypeLabel(item.type)}
                        </StatusPill>
                        <StatusPill tone="warning">
                          {getItineraryPriorityLabel(item.priority)}
                        </StatusPill>
                        <StatusPill
                          tone={
                            item.status === "DONE"
                              ? "success"
                              : item.status === "SKIPPED"
                                ? "warning"
                                : "muted"
                          }
                        >
                          {getItineraryStatusLabel(item.status)}
                        </StatusPill>
                      </div>
                      <h3 className="mt-2 font-semibold">{item.title}</h3>
                      {item.place ? (
                        <p className="mt-1 text-sm text-[#5d6972]">
                          {item.place.name}
                        </p>
                      ) : null}
                      <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap">
                        <StatusButton
                          itemId={item.id}
                          label="一键标记完成"
                          status="DONE"
                          tripId={trip.id}
                        />
                        <StatusButton
                          itemId={item.id}
                          label="一键标记跳过"
                          status="SKIPPED"
                          tripId={trip.id}
                        />
                      </div>
                    </div>
                  </div>
                </article>
              ))
            )}
          </section>
        </>
      )}

      <section className="grid gap-3 sm:grid-cols-2">
        <QuickLink
          description={
            lodgingItems[0]?.title ??
            trip.places[0]?.name ??
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
          description="查看路线规划和候选交通方案"
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

function TodayInfo({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="rounded-md border border-[#e0d9cc] bg-[#fbfaf7] px-3 py-2">
      <dt className="text-xs text-[#7a858c]">{label}</dt>
      <dd className="mt-1 font-semibold text-[#34434c]">
        {formatEmptyValue(value)}
      </dd>
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

function StatusButton({
  itemId,
  label,
  status,
  tripId,
}: {
  itemId: string;
  label: string;
  status: "DONE" | "SKIPPED";
  tripId: string;
}) {
  const action = updateItineraryItemStatusAction.bind(
    null,
    tripId,
    itemId,
    status,
    "today",
  );

  return (
    <form action={action}>
      <SubmitButton
        className={[
          "w-full rounded-md border px-3 py-2.5 text-sm font-semibold transition sm:w-auto",
          status === "DONE"
            ? "border-[#2f6f73] text-[#2f6f73] hover:bg-[#edf4f1]"
            : "border-[#d49a42] text-[#7a4b12] hover:bg-[#fff8ec]",
        ].join(" ")}
        pendingLabel="处理中..."
      >
        {label}
      </SubmitButton>
    </form>
  );
}
