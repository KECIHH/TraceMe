import type { Prisma, StayBookingStatus } from "@prisma/client";
import { notFound } from "next/navigation";

import { SubmitButton } from "@/components/submit-button";
import {
  formatDisplayDate,
  formatDisplayMoney,
  formatEmptyValue,
} from "@/lib/display-format";
import { prisma } from "@/lib/prisma";
import {
  getStayBookingStatusLabel,
  STAY_BOOKING_STATUS_OPTIONS,
  toDateInputValue,
} from "@/lib/trip-management";

import { createStayAction, updateStayAction } from "../actions";
import { Notice, TripModuleNav } from "../module-nav";

type StaysPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string; message?: string }>;
};

type StayPlace = Prisma.PlaceGetPayload<{
  include: { stayDetail: true };
}>;

export default async function StaysPage({
  params,
  searchParams,
}: StaysPageProps) {
  const { id } = await params;
  const queryParams = (await searchParams) ?? {};
  const trip = await prisma.trip.findUnique({
    include: {
      places: {
        include: { stayDetail: true },
        orderBy: [{ updatedAt: "desc" }],
        where: { type: "HOTEL" },
      },
    },
    where: { id },
  });

  if (!trip) {
    notFound();
  }

  const createAction = createStayAction.bind(null, trip.id);
  const currency = trip.baseCurrency || "CNY";

  return (
    <section className="space-y-6">
      <TripModuleNav active="stays" tripId={trip.id} tripTitle={trip.title} />
      <Notice error={queryParams.error} message={queryParams.message} />

      <div>
        <p className="text-sm font-semibold text-[#2f6f73]">住宿</p>
        <h1 className="mt-2 text-3xl font-semibold">住宿管理</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5d6972]">
          单独整理酒店、民宿和住宿订单，记录入住退房、总价、早餐、行李寄存和取消政策。
        </p>
      </div>

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">新增住宿</h2>
        <StayForm
          action={createAction}
          currency={currency}
          submitLabel="新增住宿"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {trip.places.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#b8c8c4] bg-white p-8 text-center lg:col-span-2">
            <h2 className="text-xl font-semibold">暂无住宿</h2>
            <p className="mt-3 text-sm text-[#5d6972]">
              从这里新增的地点会进入地点库，并标记为酒店类型。
            </p>
          </div>
        ) : (
          trip.places.map((place) => {
            const updateAction = updateStayAction.bind(null, trip.id, place.id);
            const detail = place.stayDetail;
            const bookingStatus = detail?.bookingStatus ?? "CONSIDERING";

            return (
              <article
                className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm"
                data-testid="stay-card"
                key={place.id}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">{place.name}</h2>
                    <p className="mt-1 text-sm text-[#5d6972]">
                      {formatEmptyValue(place.address)}
                    </p>
                  </div>
                  <span className={bookingStatusClassName(bookingStatus)}>
                    {getStayBookingStatusLabel(bookingStatus)}
                  </span>
                </div>

                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <Info label="入住日期" value={formatDate(detail?.checkInDate)} />
                  <Info label="退房日期" value={formatDate(detail?.checkOutDate)} />
                  <Info
                    label="总价"
                    value={
                      detail?.totalCost
                        ? formatAmount(detail.totalCost, currency)
                        : formatEmptyValue(null)
                    }
                  />
                  <Info label="电话" value={formatEmptyValue(place.phone)} />
                  <Info
                    label="早餐"
                    value={detail?.breakfastIncluded ? "含早餐" : "未含/未确认"}
                  />
                  <Info
                    label="行李寄存"
                    value={detail?.luggageStorage ? "可寄存" : "未确认"}
                  />
                  <Info
                    label="订单号"
                    value={formatEmptyValue(detail?.bookingReference)}
                  />
                  <Info
                    label="取消政策"
                    value={formatEmptyValue(detail?.cancellationPolicy)}
                  />
                </dl>

                {detail?.notes || place.notes ? (
                  <p className="mt-4 rounded-md bg-[#fbfaf7] p-3 text-sm leading-6 text-[#5d6972]">
                    {detail?.notes || place.notes}
                  </p>
                ) : null}

                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-semibold text-[#2f6f73]">
                    编辑住宿
                  </summary>
                  <div className="mt-4 border-t border-[#e0d9cc] pt-4">
                    <StayForm
                      action={updateAction}
                      currency={currency}
                      place={place}
                      submitLabel="保存住宿"
                    />
                  </div>
                </details>
              </article>
            );
          })
        )}
      </section>
    </section>
  );
}

function StayForm({
  action,
  currency,
  place,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  currency: string;
  place?: StayPlace;
  submitLabel: string;
}) {
  const detail = place?.stayDetail;

  return (
    <form action={action} className="mt-4 grid gap-4 md:grid-cols-2">
      <Field label="住宿名称" required>
        <input
          className={inputClassName}
          defaultValue={place?.name}
          name="name"
          required
        />
      </Field>
      <Field label="订单状态">
        <select
          className={inputClassName}
          defaultValue={detail?.bookingStatus ?? "CONSIDERING"}
          name="bookingStatus"
        >
          {STAY_BOOKING_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="入住日期">
        <input
          className={inputClassName}
          defaultValue={toDateInputValue(detail?.checkInDate)}
          name="checkInDate"
          type="date"
        />
      </Field>
      <Field label="退房日期">
        <input
          className={inputClassName}
          defaultValue={toDateInputValue(detail?.checkOutDate)}
          name="checkOutDate"
          type="date"
        />
      </Field>
      <Field label={`总价（${currency}）`}>
        <input
          className={inputClassName}
          defaultValue={detail?.totalCost ? String(detail.totalCost) : ""}
          min="0"
          name="totalCost"
          step="0.01"
          type="number"
        />
      </Field>
      <Field label="电话">
        <input
          className={inputClassName}
          defaultValue={place?.phone ?? ""}
          name="phone"
        />
      </Field>
      <Field className="md:col-span-2" label="地址">
        <input
          className={inputClassName}
          defaultValue={place?.address ?? ""}
          name="address"
        />
      </Field>
      <Field label="早餐">
        <label className="flex min-h-10 items-center gap-2 rounded-md border border-[#cfd7d2] px-3 text-sm">
          <input
            defaultChecked={detail?.breakfastIncluded ?? false}
            name="breakfastIncluded"
            type="checkbox"
          />
          含早餐
        </label>
      </Field>
      <Field label="行李寄存">
        <label className="flex min-h-10 items-center gap-2 rounded-md border border-[#cfd7d2] px-3 text-sm">
          <input
            defaultChecked={detail?.luggageStorage ?? false}
            name="luggageStorage"
            type="checkbox"
          />
          可寄存行李
        </label>
      </Field>
      <Field label="订单号">
        <input
          className={inputClassName}
          defaultValue={detail?.bookingReference ?? ""}
          name="bookingReference"
        />
      </Field>
      <Field label="取消政策备注">
        <input
          className={inputClassName}
          defaultValue={detail?.cancellationPolicy ?? ""}
          name="cancellationPolicy"
        />
      </Field>
      <Field className="md:col-span-2" label="住宿备注">
        <textarea
          className={`${inputClassName} min-h-24 resize-y`}
          defaultValue={detail?.notes ?? ""}
          name="notes"
        />
      </Field>
      <Field className="md:col-span-2" label="地点备注">
        <textarea
          className={`${inputClassName} min-h-20 resize-y`}
          defaultValue={place?.notes ?? ""}
          name="placeNotes"
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

function formatAmount(
  amount: Prisma.Decimal | number | string,
  currency: string,
): string {
  return formatDisplayMoney(amount, currency);
}

function bookingStatusClassName(status: StayBookingStatus): string {
  if (status === "CANCELLED") {
    return "w-fit rounded-full bg-[#fff2ee] px-2.5 py-1 text-xs font-medium text-[#9b2f1f]";
  }

  if (status === "RESERVED" || status === "PAID") {
    return "w-fit rounded-full bg-[#e8f6ef] px-2.5 py-1 text-xs font-medium text-[#276044]";
  }

  return "w-fit rounded-full bg-[#e8f2ff] px-2.5 py-1 text-xs font-medium text-[#25547f]";
}

function formatDate(date: Date | null | undefined): string {
  return formatDisplayDate(date);
}

const inputClassName =
  "w-full rounded-md border border-[#cfd7d2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#2f6f73] focus:ring-2 focus:ring-[#2f6f73]/20";

const primaryButtonClassName =
  "rounded-md bg-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#285f62]";
