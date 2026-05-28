import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import {
  formatBudget,
  formatDaysUntilDeparture,
  formatTripDate,
  getDaysUntilDeparture,
  getTripDurationDays,
  getTripStatusLabel,
  getTripStatusTone,
} from "@/lib/trips";

import {
  archiveTripAction,
  deleteTripAction,
} from "../actions";
import { ArchiveTripForm, DeleteTripForm } from "../trip-danger-actions";

type TripDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function TripDetailPage({ params }: TripDetailPageProps) {
  const { id } = await params;
  const trip = await prisma.trip.findUnique({
    include: {
      _count: {
        select: {
          checklistItems: true,
          destinations: true,
          notes: true,
          places: true,
        },
      },
    },
    where: { id },
  });

  if (!trip) {
    notFound();
  }

  const durationDays = getTripDurationDays(trip.startDate, trip.endDate);
  const archiveAction = archiveTripAction.bind(null, trip.id);
  const deleteAction = deleteTripAction.bind(null, trip.id);

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link className="text-sm font-medium text-[#2f6f73]" href="/trips">
            返回旅行列表
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold">{trip.title}</h1>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${getTripStatusTone(
                trip.status,
              )}`}
            >
              {getTripStatusLabel(trip.status)}
            </span>
          </div>
          {trip.description ? (
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[#5d6972]">
              {trip.description}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            className="inline-flex justify-center rounded-md bg-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#285f62]"
            href={`/trips/${trip.id}/edit`}
          >
            编辑旅行
          </Link>
          {trip.status !== "ARCHIVED" ? (
            <ArchiveTripForm action={archiveAction} />
          ) : null}
          <DeleteTripForm action={deleteAction} tripTitle={trip.title} />
        </div>
      </div>

      {trip.coverImage ? (
        <div
          className="min-h-56 rounded-lg border border-[#d8d2c6] bg-cover bg-center shadow-sm"
          style={{ backgroundImage: `url(${trip.coverImage})` }}
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <InfoCard label="出发日期" value={formatTripDate(trip.startDate)} />
        <InfoCard label="返回日期" value={formatTripDate(trip.endDate)} />
        <InfoCard
          label="旅行天数"
          value={durationDays ? `${durationDays} 天` : "待定"}
        />
        <InfoCard label="出发城市" value={trip.homeCity || "未设置"} />
        <InfoCard
          label="主要目的地"
          value={trip.mainDestination || "未设置"}
        />
        <InfoCard
          label="总预算"
          value={formatBudget(trip.budgetAmount, trip.baseCurrency)}
        />
        <InfoCard label="默认货币" value={trip.baseCurrency} />
        <InfoCard
          label="状态"
          value={getTripStatusLabel(trip.status)}
        />
        <InfoCard
          label="距离出发"
          value={formatDaysUntilDeparture(getDaysUntilDeparture(trip.startDate))}
        />
      </div>

      <div className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">旅行资料模块</h2>
            <p className="mt-2 text-sm text-[#5d6972]">
              先把目的地、地点库、攻略笔记和准备清单整理起来，后续行程会基于这些资料展开。
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <ModuleLink
            count={trip._count.destinations}
            href={`/trips/${trip.id}/destinations`}
            label="目的地"
          />
          <ModuleLink
            count={trip._count.places}
            href={`/trips/${trip.id}/places`}
            label="地点库"
          />
          <ModuleLink
            count={trip._count.notes}
            href={`/trips/${trip.id}/notes`}
            label="攻略笔记"
          />
          <ModuleLink
            count={trip._count.checklistItems}
            href={`/trips/${trip.id}/checklist`}
            label="准备清单"
          />
          <div className="rounded-md border border-[#e0d9cc] bg-[#fbfaf7] px-4 py-3 text-sm font-medium text-[#7a858c]">
            行程日历 · 后续阶段
          </div>
        </div>
      </div>
    </section>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
      <p className="text-sm text-[#66737b]">{label}</p>
      <p className="mt-2 text-lg font-semibold text-[#172026]">{value}</p>
    </div>
  );
}

function ModuleLink({
  count,
  href,
  label,
}: {
  count: number;
  href: string;
  label: string;
}) {
  return (
    <Link
      className="rounded-md border border-[#e0d9cc] bg-[#fbfaf7] px-4 py-3 text-sm font-medium text-[#34434c] transition hover:border-[#2f6f73] hover:bg-[#edf4f1] hover:text-[#2f6f73]"
      href={href}
    >
      <span className="block">{label}</span>
      <span className="mt-1 block text-xs text-[#66737b]">{count} 条</span>
    </Link>
  );
}
