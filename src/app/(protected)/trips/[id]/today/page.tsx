import Link from "next/link";
import { notFound } from "next/navigation";

import {
  analyzeItineraryDay,
  formatDateTitle,
  formatTimeInputValue,
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

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <TripModuleNav active="today" tripId={trip.id} tripTitle={trip.title} />
      <Notice error={queryParams.error} message={queryParams.message} />

      <div className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-[#2f6f73]">Today</p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">今日模式</h1>
            <p className="mt-2 text-sm text-[#5d6972]">
              当前时间 {formatTimeInputValue(now)}
            </p>
          </div>
          <Link
            className="w-fit rounded-md border border-[#2f6f73] px-4 py-2 text-sm font-semibold text-[#2f6f73] transition hover:bg-[#edf4f1]"
            href={`/trips/${trip.id}/itinerary`}
          >
            返回行程日历
          </Link>
        </div>
      </div>

      {!fullDisplayDay ? (
        <div className="rounded-lg border border-dashed border-[#b8c8c4] bg-white p-8 text-center">
          <h2 className="text-xl font-semibold">还没有可查看的行程日期</h2>
          <p className="mt-3 text-sm text-[#5d6972]">
            先在行程日历里生成日期并添加当天安排。
          </p>
        </div>
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
            <p className="mt-2 text-sm text-[#5d6972]">
              {[fullDisplayDay.city, fullDisplayDay.theme, fullDisplayDay.weatherSummary]
                .filter(Boolean)
                .join(" · ") || "今天信息待补充"}
            </p>
            {alerts.length > 0 ? (
              <p className="mt-3 rounded-md border border-[#f0d39b] bg-[#fff9e8] px-3 py-2 text-sm text-[#73530f]">
                今天有 {alerts.length} 条提醒，请留意节奏。
              </p>
            ) : null}
          </div>

          <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-[#2f6f73]">下一项</p>
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
                <div className="mt-4 flex flex-wrap gap-2">
                  <StatusButton
                    itemId={nextItem.id}
                    label="已完成"
                    status="DONE"
                    tripId={trip.id}
                  />
                  <StatusButton
                    itemId={nextItem.id}
                    label="跳过"
                    status="SKIPPED"
                    tripId={trip.id}
                  />
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-[#5d6972]">
                今天没有待处理的下一项。
              </p>
            )}
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <Link
              className="rounded-lg border border-[#d8d2c6] bg-white p-4 shadow-sm transition hover:border-[#2f6f73]"
              href={`/trips/${trip.id}/places`}
            >
              <p className="text-sm font-semibold text-[#2f6f73]">
                酒店/住宿信息
              </p>
              <p className="mt-2 text-sm text-[#5d6972]">
                {lodgingItems[0]?.title ??
                  trip.places[0]?.name ??
                  "查看地点库中的住宿信息"}
              </p>
            </Link>
            <Link
              className="rounded-lg border border-[#d8d2c6] bg-white p-4 shadow-sm transition hover:border-[#2f6f73]"
              href={`/trips/${trip.id}/checklist`}
            >
              <p className="text-sm font-semibold text-[#2f6f73]">
                文件票据/准备清单
              </p>
              <p className="mt-2 text-sm text-[#5d6972]">
                {trip.documents[0]?.title ?? "查看票据、证件和准备清单"}
              </p>
            </Link>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">今日全部行程</h2>
            {fullDisplayDay.items.length === 0 ? (
              <p className="rounded-lg border border-[#d8d2c6] bg-white p-5 text-sm text-[#5d6972] shadow-sm">
                这一天还没有行程项。
              </p>
            ) : (
              fullDisplayDay.items.map((item) => (
                <article
                  className="rounded-lg border border-[#d8d2c6] bg-white p-4 shadow-sm"
                  data-testid="today-item-card"
                  key={item.id}
                >
                  <div className="flex gap-3">
                    <div className="w-24 shrink-0 text-sm font-semibold text-[#172026]">
                      {formatTimeRange(item.startTime, item.endTime)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-[#edf4f1] px-2 py-1 text-xs font-medium text-[#2f6f73]">
                          {getItineraryItemTypeLabel(item.type)}
                        </span>
                        <span className="rounded-full bg-[#fff7d6] px-2 py-1 text-xs font-medium text-[#6d5412]">
                          {getItineraryPriorityLabel(item.priority)}
                        </span>
                        <span className="rounded-full bg-[#eef0f2] px-2 py-1 text-xs font-medium text-[#44515a]">
                          {getItineraryStatusLabel(item.status)}
                        </span>
                      </div>
                      <h3 className="mt-2 font-semibold">{item.title}</h3>
                      {item.place ? (
                        <p className="mt-1 text-sm text-[#5d6972]">
                          {item.place.name}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <StatusButton
                          itemId={item.id}
                          label="已完成"
                          status="DONE"
                          tripId={trip.id}
                        />
                        <StatusButton
                          itemId={item.id}
                          label="跳过"
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
    </section>
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
      <button
        className="rounded-md border border-[#cfd7d2] px-3 py-2 text-sm font-semibold text-[#34434c] transition hover:border-[#2f6f73] hover:text-[#2f6f73]"
        type="submit"
      >
        {label}
      </button>
    </form>
  );
}
