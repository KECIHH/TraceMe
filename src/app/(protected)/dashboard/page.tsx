import type { Prisma } from "@prisma/client";
import Link from "next/link";

import { requireUser } from "@/lib/auth/session";
import { visibleTripsWhere } from "@/lib/collaboration";
import { prisma } from "@/lib/prisma";
import {
  formatBudget,
  formatDaysUntilDeparture,
  formatTripDateRange,
  getDaysUntilDeparture,
  getTripStatusLabel,
  getTripStatusTone,
} from "@/lib/trips";

export default async function DashboardPage() {
  const user = await requireUser();
  const tripWhere = visibleTripsWhere(user.id);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [totalTrips, planningTrips, completedTrips, recentTrips, upcomingTrips] =
    await Promise.all([
      prisma.trip.count({ where: tripWhere }),
      prisma.trip.count({ where: { ...tripWhere, status: "PLANNING" } }),
      prisma.trip.count({ where: { ...tripWhere, status: "COMPLETED" } }),
      prisma.trip.findMany({
        where: tripWhere,
        orderBy: { updatedAt: "desc" },
        take: 4,
      }),
      prisma.trip.findMany({
        where: {
          ...tripWhere,
          startDate: { gte: today },
          status: { notIn: ["COMPLETED", "ARCHIVED"] },
        },
        orderBy: { startDate: "asc" },
        take: 4,
      }),
    ]);

  const hasTrips = totalTrips > 0;

  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#2f6f73]">工作台</p>
          <h1 className="mt-2 text-3xl font-semibold">旅行工作台</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5d6972]">
            这里集中展示最近更新和即将出发的旅行，方便你快速回到规划现场。
          </p>
        </div>
        <Link
          className="inline-flex justify-center rounded-md bg-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#285f62]"
          href="/trips/new"
        >
          创建旅行
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="旅行总数" value={totalTrips} />
        <StatCard label="规划中" value={planningTrips} />
        <StatCard label="已完成" value={completedTrips} />
      </div>

      {!hasTrips ? (
        <div className="rounded-lg border border-dashed border-[#b8c8c4] bg-white p-8 text-center">
          <h2 className="text-xl font-semibold">还没有旅行计划</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[#5d6972]">
            从一次灵感、一个目的地或一张机票开始，把路线、预算和准备事项慢慢收拢到这里。
          </p>
          <Link
            className="mt-5 inline-flex rounded-md bg-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#285f62]"
            href="/trips/new"
          >
            创建第一个旅行
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <TripPanel title="最近的旅行计划" trips={recentTrips} />
          <TripPanel title="即将出发的旅行" trips={upcomingTrips} />
        </div>
      )}
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
      <p className="text-sm text-[#66737b]">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  );
}

function TripPanel({
  title,
  trips,
}: {
  title: string;
  trips: Prisma.TripGetPayload<Record<string, never>>[];
}) {
  return (
    <div className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Link className="text-sm font-medium text-[#2f6f73]" href="/trips">
          查看全部
        </Link>
      </div>

      {trips.length === 0 ? (
        <p className="mt-5 rounded-md bg-[#f6f4ef] px-4 py-5 text-sm text-[#5d6972]">
          暂无符合条件的旅行。
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {trips.map((trip) => (
            <Link
              className="block rounded-md border border-[#e0d9cc] p-4 transition hover:border-[#2f6f73] hover:bg-[#f8fbfa]"
              href={`/trips/${trip.id}`}
              key={trip.id}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-semibold">{trip.title}</h3>
                  <p className="mt-1 text-sm text-[#5d6972]">
                    {trip.mainDestination || "目的地待定"} ·{" "}
                    {formatTripDateRange(trip.startDate, trip.endDate)}
                  </p>
                </div>
                <span
                  className={`w-fit rounded-full px-2.5 py-1 text-xs font-medium ${getTripStatusTone(
                    trip.status,
                  )}`}
                >
                  {getTripStatusLabel(trip.status)}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#66737b]">
                <span>{formatBudget(trip.budgetAmount, trip.baseCurrency)}</span>
                <span>
                  {formatDaysUntilDeparture(
                    getDaysUntilDeparture(trip.startDate),
                  )}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
