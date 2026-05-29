import type { FoodStatus, Prisma } from "@prisma/client";
import { notFound } from "next/navigation";

import { SubmitButton } from "@/components/submit-button";
import { formatDisplayMoney, formatEmptyValue } from "@/lib/display-format";
import { prisma } from "@/lib/prisma";
import {
  FOOD_STATUS_OPTIONS,
  formatTags,
  getFoodStatusLabel,
} from "@/lib/trip-management";

import { createFoodAction, updateFoodAction } from "../actions";
import { Notice, TripModuleNav } from "../module-nav";

type FoodsPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string; message?: string }>;
};

type FoodPlace = Prisma.PlaceGetPayload<{
  include: { foodDetail: true };
}>;

export default async function FoodsPage({
  params,
  searchParams,
}: FoodsPageProps) {
  const { id } = await params;
  const queryParams = (await searchParams) ?? {};
  const trip = await prisma.trip.findUnique({
    include: {
      places: {
        include: { foodDetail: true },
        orderBy: [{ updatedAt: "desc" }],
        where: { type: "RESTAURANT" },
      },
    },
    where: { id },
  });

  if (!trip) {
    notFound();
  }

  const createAction = createFoodAction.bind(null, trip.id);
  const currency = trip.baseCurrency || "CNY";

  return (
    <section className="space-y-6">
      <TripModuleNav active="foods" tripId={trip.id} tripTitle={trip.title} />
      <Notice error={queryParams.error} message={queryParams.message} />

      <div>
        <p className="text-sm font-semibold text-[#2f6f73]">美食</p>
        <h1 className="mt-2 text-3xl font-semibold">美食管理</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5d6972]">
          单独整理餐厅、美食地点、推荐菜、人均价格、营业时间和吃过/想吃/避雷状态。
        </p>
      </div>

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">新增餐厅</h2>
        <FoodForm
          action={createAction}
          currency={currency}
          submitLabel="新增餐厅"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {trip.places.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#b8c8c4] bg-white p-8 text-center lg:col-span-2">
            <h2 className="text-xl font-semibold">暂无餐厅</h2>
            <p className="mt-3 text-sm text-[#5d6972]">
              从这里新增的地点会进入地点库，并标记为餐厅类型。
            </p>
          </div>
        ) : (
          trip.places.map((place) => {
            const updateAction = updateFoodAction.bind(null, trip.id, place.id);
            const detail = place.foodDetail;
            const dishes = formatTags(detail?.recommendedDishes);
            const foodStatus = detail?.foodStatus ?? "WANT_TO_TRY";

            return (
              <article
                className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm"
                data-testid="food-card"
                key={place.id}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">{place.name}</h2>
                    <p className="mt-1 text-sm text-[#5d6972]">
                      {formatEmptyValue(place.address)}
                    </p>
                  </div>
                  <span className={foodStatusClassName(foodStatus)}>
                    {getFoodStatusLabel(foodStatus)}
                  </span>
                </div>

                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <Info label="推荐菜" value={formatEmptyValue(dishes)} />
                  <Info
                    label="人均价格"
                    value={
                      detail?.averageCost
                        ? formatAmount(detail.averageCost, currency)
                        : formatEmptyValue(null)
                    }
                  />
                  <Info
                    label="营业时间"
                    value={
                      typeof place.openingHours === "string"
                        ? place.openingHours
                        : formatEmptyValue(null)
                    }
                  />
                  <Info
                    label="是否需要预约"
                    value={detail?.reservationNeeded ? "需要" : "不需要/未确认"}
                  />
                  <Info label="电话" value={formatEmptyValue(place.phone)} />
                  <Info label="状态" value={getFoodStatusLabel(foodStatus)} />
                </dl>

                {detail?.notes || place.notes ? (
                  <p className="mt-4 rounded-md bg-[#fbfaf7] p-3 text-sm leading-6 text-[#5d6972]">
                    {detail?.notes || place.notes}
                  </p>
                ) : null}

                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-semibold text-[#2f6f73]">
                    编辑餐厅
                  </summary>
                  <div className="mt-4 border-t border-[#e0d9cc] pt-4">
                    <FoodForm
                      action={updateAction}
                      currency={currency}
                      place={place}
                      submitLabel="保存餐厅"
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

function FoodForm({
  action,
  currency,
  place,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  currency: string;
  place?: FoodPlace;
  submitLabel: string;
}) {
  const detail = place?.foodDetail;

  return (
    <form action={action} className="mt-4 grid gap-4 md:grid-cols-2">
      <Field label="餐厅名称" required>
        <input
          className={inputClassName}
          defaultValue={place?.name}
          name="name"
          required
        />
      </Field>
      <Field label="美食状态">
        <select
          className={inputClassName}
          defaultValue={detail?.foodStatus ?? "WANT_TO_TRY"}
          name="foodStatus"
        >
          {FOOD_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
      <Field className="md:col-span-2" label="地址">
        <input
          className={inputClassName}
          defaultValue={place?.address ?? ""}
          name="address"
        />
      </Field>
      <Field label="电话">
        <input
          className={inputClassName}
          defaultValue={place?.phone ?? ""}
          name="phone"
        />
      </Field>
      <Field label={`人均价格（${currency}）`}>
        <input
          className={inputClassName}
          defaultValue={detail?.averageCost ? String(detail.averageCost) : ""}
          min="0"
          name="averageCost"
          step="0.01"
          type="number"
        />
      </Field>
      <Field label="营业时间">
        <input
          className={inputClassName}
          defaultValue={
            typeof place?.openingHours === "string" ? place.openingHours : ""
          }
          name="openingHours"
          placeholder="例如 11:00-22:00"
        />
      </Field>
      <Field label="推荐菜">
        <input
          className={inputClassName}
          defaultValue={formatTags(detail?.recommendedDishes)}
          name="recommendedDishes"
          placeholder="用逗号分隔"
        />
      </Field>
      <Field label="预约">
        <label className="flex min-h-10 items-center gap-2 rounded-md border border-[#cfd7d2] px-3 text-sm">
          <input
            defaultChecked={detail?.reservationNeeded ?? false}
            name="reservationNeeded"
            type="checkbox"
          />
          需要预约
        </label>
      </Field>
      <Field className="md:col-span-2" label="餐厅备注">
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

function foodStatusClassName(status: FoodStatus): string {
  if (status === "EATEN") {
    return "w-fit rounded-full bg-[#e8f6ef] px-2.5 py-1 text-xs font-medium text-[#276044]";
  }

  if (status === "AVOID") {
    return "w-fit rounded-full bg-[#fff2ee] px-2.5 py-1 text-xs font-medium text-[#9b2f1f]";
  }

  return "w-fit rounded-full bg-[#fff7d6] px-2.5 py-1 text-xs font-medium text-[#6d5412]";
}

const inputClassName =
  "w-full rounded-md border border-[#cfd7d2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#2f6f73] focus:ring-2 focus:ring-[#2f6f73]/20";

const primaryButtonClassName =
  "rounded-md bg-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#285f62]";
