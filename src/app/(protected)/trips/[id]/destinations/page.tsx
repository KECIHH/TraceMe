import { notFound } from "next/navigation";

import { SubmitButton } from "@/components/submit-button";
import { formatDisplayDate, formatEmptyValue } from "@/lib/display-format";
import { prisma } from "@/lib/prisma";
import { toDateInputValue } from "@/lib/trip-management";

import {
  createDestinationAction,
  deleteDestinationAction,
  updateDestinationAction,
} from "../actions";
import { ConfirmSubmitButton } from "../confirm-submit-button";
import { Notice, TripModuleNav } from "../module-nav";

type DestinationsPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string; message?: string }>;
};

export default async function DestinationsPage({
  params,
  searchParams,
}: DestinationsPageProps) {
  const { id } = await params;
  const notice = (await searchParams) ?? {};
  const trip = await prisma.trip.findUnique({
    where: { id },
    include: {
      destinations: {
        include: { _count: { select: { places: true } } },
        orderBy: [{ arrivalDate: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!trip) {
    notFound();
  }

  const createAction = createDestinationAction.bind(null, trip.id);

  return (
    <section className="space-y-6">
      <TripModuleNav active="destinations" tripId={trip.id} tripTitle={trip.title} />
      <Notice error={notice.error} message={notice.message} />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#2f6f73]">目的地</p>
          <h1 className="mt-2 text-3xl font-semibold">目的地管理</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5d6972]">
            为这次旅行拆分城市、国家或区域，并记录抵离日期、时区和坐标。
          </p>
        </div>
      </div>

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">新增目的地</h2>
        <DestinationForm action={createAction} submitLabel="新增目的地" />
      </section>

      <section className="space-y-3">
        {trip.destinations.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#b8c8c4] bg-white p-8 text-center">
            <h2 className="text-xl font-semibold">暂无目的地</h2>
            <p className="mt-3 text-sm text-[#5d6972]">
              可以先添加城市或地区，后续地点库会关联到这些目的地。
            </p>
          </div>
        ) : (
          trip.destinations.map((destination) => {
            const updateAction = updateDestinationAction.bind(
              null,
              trip.id,
              destination.id,
            );
            const deleteAction = deleteDestinationAction.bind(
              null,
              trip.id,
              destination.id,
            );

            return (
              <article
                className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm"
                key={destination.id}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">{destination.name}</h2>
                    <p className="mt-1 text-sm text-[#5d6972]">
                      {[destination.country, destination.region]
                        .filter(Boolean)
                        .join(" · ") || "国家和地区待补充"}
                    </p>
                  </div>
                  <span className="w-fit rounded-full bg-[#edf4f1] px-2.5 py-1 text-xs font-medium text-[#2f6f73]">
                    关联地点 {destination._count.places}
                  </span>
                </div>

                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <Info label="时区" value={formatEmptyValue(destination.timezone)} />
                  <Info label="到达" value={formatDisplayDate(destination.arrivalDate)} />
                  <Info label="离开" value={formatDisplayDate(destination.departureDate)} />
                  <Info
                    label="坐标"
                    value={
                      destination.latitude !== null && destination.longitude !== null
                        ? `${destination.latitude}, ${destination.longitude}`
                        : formatEmptyValue(null)
                    }
                  />
                </dl>

                {destination.notes ? (
                  <p className="mt-4 rounded-md bg-[#fbfaf7] p-3 text-sm leading-6 text-[#5d6972]">
                    {destination.notes}
                  </p>
                ) : null}

                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-semibold text-[#2f6f73]">
                    编辑目的地
                  </summary>
                  <div className="mt-4 border-t border-[#e0d9cc] pt-4">
                    <DestinationForm
                      action={updateAction}
                      destination={destination}
                      submitLabel="保存目的地"
                    />
                  </div>
                </details>

                <form action={deleteAction} className="mt-4">
                  <ConfirmSubmitButton
                    className="rounded-md border border-[#d46a55] px-3 py-2 text-sm font-semibold text-[#9b2f1f] transition hover:bg-[#fff2ee]"
                    message={`确定删除目的地“${destination.name}”吗？`}
                  >
                    删除目的地
                  </ConfirmSubmitButton>
                </form>
              </article>
            );
          })
        )}
      </section>
    </section>
  );
}

function DestinationForm({
  action,
  destination,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  destination?: {
    name: string;
    country: string | null;
    region: string | null;
    timezone: string | null;
    arrivalDate: Date | null;
    departureDate: Date | null;
    latitude: number | null;
    longitude: number | null;
    notes: string | null;
  };
  submitLabel: string;
}) {
  return (
    <form action={action} className="mt-4 grid gap-4 md:grid-cols-2">
      <Field label="名称" required>
        <input className={inputClassName} defaultValue={destination?.name} name="name" required />
      </Field>
      <Field label="国家">
        <input className={inputClassName} defaultValue={destination?.country ?? ""} name="country" />
      </Field>
      <Field label="省/州/地区">
        <input className={inputClassName} defaultValue={destination?.region ?? ""} name="region" />
      </Field>
      <Field label="时区">
        <input className={inputClassName} defaultValue={destination?.timezone ?? ""} name="timezone" placeholder="Asia/Tokyo" />
      </Field>
      <Field label="到达日期">
        <input className={inputClassName} defaultValue={toDateInputValue(destination?.arrivalDate)} name="arrivalDate" type="date" />
      </Field>
      <Field label="离开日期">
        <input className={inputClassName} defaultValue={toDateInputValue(destination?.departureDate)} name="departureDate" type="date" />
      </Field>
      <Field label="纬度">
        <input className={inputClassName} defaultValue={destination?.latitude ?? ""} name="latitude" step="any" type="number" />
      </Field>
      <Field label="经度">
        <input className={inputClassName} defaultValue={destination?.longitude ?? ""} name="longitude" step="any" type="number" />
      </Field>
      <Field className="md:col-span-2" label="备注">
        <textarea className={`${inputClassName} min-h-24 resize-y`} defaultValue={destination?.notes ?? ""} name="notes" />
      </Field>
      <div className="md:col-span-2">
        <SubmitButton className={primaryButtonClassName}>
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
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

const inputClassName =
  "w-full rounded-md border border-[#cfd7d2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#2f6f73] focus:ring-2 focus:ring-[#2f6f73]/20";

const primaryButtonClassName =
  "rounded-md bg-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#285f62]";
