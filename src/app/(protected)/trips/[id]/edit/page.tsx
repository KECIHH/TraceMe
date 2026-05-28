import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { toDateInputValue } from "@/lib/trips";

import { createTripActionState } from "../../action-state";
import { updateTripAction } from "../../actions";
import { TripForm } from "../../trip-form";

type EditTripPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditTripPage({ params }: EditTripPageProps) {
  const { id } = await params;
  const trip = await prisma.trip.findUnique({ where: { id } });

  if (!trip) {
    notFound();
  }

  const updateAction = updateTripAction.bind(null, trip.id);

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-[#2f6f73]">Edit Trip</p>
        <h1 className="mt-2 text-3xl font-semibold">编辑旅行计划</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5d6972]">
          修改旅行的基础信息、日期、状态和预算。
        </p>
      </div>

      <div className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm sm:p-6">
        <TripForm
          action={updateAction}
          cancelHref={`/trips/${trip.id}`}
          initialState={createTripActionState({
            title: trip.title,
            description: trip.description ?? "",
            status: trip.status,
            startDate: toDateInputValue(trip.startDate),
            endDate: toDateInputValue(trip.endDate),
            homeCity: trip.homeCity ?? "",
            mainDestination: trip.mainDestination ?? "",
            baseCurrency: trip.baseCurrency,
            budgetAmount:
              trip.budgetAmount === null ? "" : trip.budgetAmount.toString(),
            coverImage: trip.coverImage ?? "",
          })}
          submitLabel="保存修改"
        />
      </div>
    </section>
  );
}
