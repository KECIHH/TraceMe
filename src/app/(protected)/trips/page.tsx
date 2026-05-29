import type { Prisma, TripStatus } from "@prisma/client";
import Link from "next/link";

import { SubmitButton } from "@/components/submit-button";
import { formatEmptyValue } from "@/lib/display-format";
import { prisma } from "@/lib/prisma";
import {
  formatBudget,
  formatDaysUntilDeparture,
  formatTripDateRange,
  getDaysUntilDeparture,
  getTripStatusLabel,
  getTripStatusTone,
  isTripStatus,
  TRIP_STATUS_OPTIONS,
} from "@/lib/trips";

type TripsPageProps = {
  searchParams?: Promise<{
    q?: string;
    status?: string;
    sort?: string;
  }>;
};

export default async function TripsPage({ searchParams }: TripsPageProps) {
  const params = (await searchParams) ?? {};
  const query = params.q?.trim() ?? "";
  const status = params.status && isTripStatus(params.status) ? params.status : "";
  const sort = params.sort === "desc" ? "desc" : "asc";
  const where: Prisma.TripWhereInput = {};

  if (query) {
    where.OR = [
      { title: { contains: query } },
      { mainDestination: { contains: query } },
      { homeCity: { contains: query } },
      { description: { contains: query } },
    ];
  }

  if (status) {
    where.status = status as TripStatus;
  }

  const trips = await prisma.trip.findMany({
    where,
    orderBy: [{ startDate: sort }, { updatedAt: "desc" }],
  });

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#2f6f73]">旅行计划</p>
          <h1 className="mt-2 text-3xl font-semibold">旅行计划</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5d6972]">
            管理你的旅行灵感、日期、预算和状态，后续模块都会围绕旅行计划展开。
          </p>
        </div>
        <Link
          className="inline-flex justify-center rounded-md bg-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#285f62]"
          href="/trips/new"
        >
          创建新旅行
        </Link>
      </div>

      <form
        action="/trips"
        className="grid gap-3 rounded-lg border border-[#d8d2c6] bg-white p-4 shadow-sm md:grid-cols-[1fr_180px_180px_auto]"
      >
        <input
          className="rounded-md border border-[#cfd7d2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#2f6f73] focus:ring-2 focus:ring-[#2f6f73]/20"
          defaultValue={query}
          name="q"
          placeholder="搜索旅行名称、目的地、城市"
          type="search"
        />
        <select
          className="rounded-md border border-[#cfd7d2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#2f6f73] focus:ring-2 focus:ring-[#2f6f73]/20"
          defaultValue={status}
          name="status"
        >
          <option value="">全部状态</option>
          {TRIP_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border border-[#cfd7d2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#2f6f73] focus:ring-2 focus:ring-[#2f6f73]/20"
          defaultValue={sort}
          name="sort"
        >
          <option value="asc">出发日期升序</option>
          <option value="desc">出发日期降序</option>
        </select>
        <SubmitButton
          className="rounded-md border border-[#2f6f73] px-4 py-2 text-sm font-semibold text-[#2f6f73] transition hover:bg-[#edf4f1]"
          pendingLabel="筛选中..."
        >
          筛选
        </SubmitButton>
      </form>

      {trips.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#b8c8c4] bg-white p-8 text-center">
          <h2 className="text-xl font-semibold">
            {query || status ? "没有匹配的旅行" : "暂无旅行计划"}
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[#5d6972]">
            {query || status
              ? "试试调整搜索词或状态筛选。"
              : "创建一个旅行计划后，这里会显示日期、目的地、预算和距离出发天数。"}
          </p>
          <Link
            className="mt-5 inline-flex rounded-md bg-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#285f62]"
            href="/trips/new"
          >
            创建第一个旅行
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {trips.map((trip) => (
            <Link
              className="block rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm transition hover:border-[#2f6f73] hover:bg-[#f8fbfa]"
              href={`/trips/${trip.id}`}
              key={trip.id}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{trip.title}</h2>
                  <p className="mt-1 text-sm text-[#5d6972]">
                    {trip.mainDestination || "目的地待定"}
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

              <dl className="mt-4 grid gap-3 text-sm text-[#5d6972] sm:grid-cols-2">
                <Info label="日期" value={formatTripDateRange(trip.startDate, trip.endDate)} />
                <Info
                  label="预算"
                  value={formatBudget(trip.budgetAmount, trip.baseCurrency)}
                />
                <Info
                  label="出发城市"
                  value={formatEmptyValue(trip.homeCity)}
                />
                <Info
                  label="距离出发"
                  value={formatDaysUntilDeparture(
                    getDaysUntilDeparture(trip.startDate),
                  )}
                />
              </dl>
            </Link>
          ))}
        </div>
      )}
    </section>
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
