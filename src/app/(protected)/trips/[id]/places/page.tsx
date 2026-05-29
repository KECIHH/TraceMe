import type { PlaceType, Prisma, Priority } from "@prisma/client";
import { notFound } from "next/navigation";

import { SubmitButton } from "@/components/submit-button";
import { formatDisplayMoney, formatEmptyValue } from "@/lib/display-format";
import { prisma } from "@/lib/prisma";
import {
  formatTags,
  getPlaceTypeLabel,
  getPriorityLabel,
  PLACE_TYPE_OPTIONS,
  PRIORITY_OPTIONS,
  toDateInputValue,
} from "@/lib/trip-management";

import {
  createPlaceAction,
  deletePlaceAction,
  updatePlaceAction,
} from "../actions";
import { ConfirmSubmitButton } from "../confirm-submit-button";
import { Notice, TripModuleNav } from "../module-nav";

type PlacesPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    error?: string;
    message?: string;
    priority?: string;
    q?: string;
    type?: string;
  }>;
};

export default async function PlacesPage({
  params,
  searchParams,
}: PlacesPageProps) {
  const { id } = await params;
  const queryParams = (await searchParams) ?? {};
  const query = queryParams.q?.trim() ?? "";
  const type = PLACE_TYPE_OPTIONS.some((option) => option.value === queryParams.type)
    ? (queryParams.type as PlaceType)
    : "";
  const priority = PRIORITY_OPTIONS.some(
    (option) => option.value === queryParams.priority,
  )
    ? (queryParams.priority as Priority)
    : "";
  const placeWhere: Prisma.PlaceWhereInput = { tripId: id };

  if (type) {
    placeWhere.type = type;
  }

  if (priority) {
    placeWhere.priority = priority;
  }

  if (query) {
    placeWhere.OR = [
      { name: { contains: query } },
      { address: { contains: query } },
      { sourceName: { contains: query } },
      { notes: { contains: query } },
    ];
  }

  const trip = await prisma.trip.findUnique({
    where: { id },
    include: {
      destinations: { orderBy: { createdAt: "asc" } },
      places: {
        include: {
          destination: true,
          _count: { select: { itineraryItems: true } },
        },
        orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
        where: placeWhere,
      },
    },
  });

  if (!trip) {
    notFound();
  }

  const createAction = createPlaceAction.bind(null, trip.id);

  return (
    <section className="space-y-6">
      <TripModuleNav active="places" tripId={trip.id} tripTitle={trip.title} />
      <Notice error={queryParams.error} message={queryParams.message} />

      <div>
        <p className="text-sm font-semibold text-[#2f6f73]">地点库</p>
        <h1 className="mt-2 text-3xl font-semibold">地点库</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5d6972]">
          汇总景点、餐厅、酒店、交通节点、购物点和紧急地点，按类型、优先级和关键词快速筛选。
        </p>
      </div>

      <form
        action={`/trips/${trip.id}/places`}
        className="grid gap-3 rounded-lg border border-[#d8d2c6] bg-white p-4 shadow-sm md:grid-cols-[1fr_160px_160px_auto]"
      >
        <input
          className={inputClassName}
          defaultValue={query}
          name="q"
          placeholder="搜索地点、地址、备注"
          type="search"
        />
        <select className={inputClassName} defaultValue={type} name="type">
          <option value="">全部类型</option>
          {PLACE_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select className={inputClassName} defaultValue={priority} name="priority">
          <option value="">全部优先级</option>
          {PRIORITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <SubmitButton className={secondaryButtonClassName} pendingLabel="筛选中...">
          筛选地点
        </SubmitButton>
      </form>

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">新增地点</h2>
        <PlaceForm
          action={createAction}
          destinations={trip.destinations}
          submitLabel="新增地点"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {trip.places.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#b8c8c4] bg-white p-8 text-center lg:col-span-2">
            <h2 className="text-xl font-semibold">暂无匹配地点</h2>
            <p className="mt-3 text-sm text-[#5d6972]">
              添加地点后可以在这里用卡片视图快速查看类型、优先级、来源和关联目的地。
            </p>
          </div>
        ) : (
          trip.places.map((place) => {
            const updateAction = updatePlaceAction.bind(null, trip.id, place.id);
            const deleteAction = deletePlaceAction.bind(null, trip.id, place.id);
            const tags = formatTags(place.tags);

            return (
              <article
                className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm"
                key={place.id}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold">{place.name}</h2>
                      <span className="rounded-full bg-[#edf4f1] px-2.5 py-1 text-xs font-medium text-[#2f6f73]">
                        {getPlaceTypeLabel(place.type)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[#5d6972]">
                      {place.destination?.name ?? "未关联目的地"}
                    </p>
                  </div>
                  <span className="w-fit rounded-full bg-[#fff7d6] px-2.5 py-1 text-xs font-medium text-[#6d5412]">
                    {getPriorityLabel(place.priority)}
                  </span>
                </div>

                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <Info label="地址" value={formatEmptyValue(place.address)} />
                  <Info label="电话" value={formatEmptyValue(place.phone)} />
                  <Info
                    label="预估花费"
                    value={formatDisplayMoney(place.estimatedCost)}
                  />
                  <Info
                    label="建议时长"
                    value={
                      place.estimatedDurationMin
                        ? `${place.estimatedDurationMin} 分钟`
                        : formatEmptyValue(null)
                    }
                  />
                  <Info
                    label="个人评分"
                    value={
                      place.ratingPersonal
                        ? `${place.ratingPersonal}/5`
                        : formatEmptyValue(null)
                    }
                  />
                  <Info
                    label="行程引用"
                    value={`${place._count.itineraryItems} 个行程项`}
                  />
                </dl>

                {tags ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {tags.split(", ").map((tag) => (
                      <span
                        className="rounded-full bg-[#f1e8f5] px-2.5 py-1 text-xs text-[#6a4078]"
                        key={tag}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}

                {place.notes ? (
                  <p className="mt-4 rounded-md bg-[#fbfaf7] p-3 text-sm leading-6 text-[#5d6972]">
                    {place.notes}
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-3 text-sm">
                  {place.website ? (
                    <a className="font-medium text-[#2f6f73]" href={place.website}>
                      官网
                    </a>
                  ) : null}
                  {place.sourceUrl ? (
                    <a className="font-medium text-[#2f6f73]" href={place.sourceUrl}>
                      来源{place.sourceName ? `：${place.sourceName}` : ""}
                    </a>
                  ) : null}
                </div>

                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-semibold text-[#2f6f73]">
                    编辑地点
                  </summary>
                  <div className="mt-4 border-t border-[#e0d9cc] pt-4">
                    <PlaceForm
                      action={updateAction}
                      destinations={trip.destinations}
                      place={place}
                      submitLabel="保存地点"
                    />
                  </div>
                </details>

                <form action={deleteAction} className="mt-4">
                  <ConfirmSubmitButton
                    className={dangerButtonClassName}
                    message={`确定删除地点“${place.name}”吗？`}
                  >
                    删除地点
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

function PlaceForm({
  action,
  destinations,
  place,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  destinations: Array<{ id: string; name: string }>;
  place?: {
    name: string;
    type: PlaceType;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    phone: string | null;
    website: string | null;
    sourceUrl: string | null;
    sourceName: string | null;
    lastCheckedAt: Date | null;
    openingHours: Prisma.JsonValue | null;
    estimatedCost: Prisma.Decimal | null;
    estimatedDurationMin: number | null;
    ratingPersonal: number | null;
    priority: Priority;
    tags: Prisma.JsonValue | null;
    notes: string | null;
    destinationId: string | null;
  };
  submitLabel: string;
}) {
  return (
    <form action={action} className="mt-4 grid gap-4 md:grid-cols-2">
      <Field label="名称" required>
        <input className={inputClassName} defaultValue={place?.name} name="name" required />
      </Field>
      <Field label="类型">
        <select className={inputClassName} defaultValue={place?.type ?? "OTHER"} name="type">
          {PLACE_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="优先级">
        <select className={inputClassName} defaultValue={place?.priority ?? "MEDIUM"} name="priority">
          {PRIORITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="关联目的地">
        <select className={inputClassName} defaultValue={place?.destinationId ?? ""} name="destinationId">
          <option value="">不关联</option>
          {destinations.map((destination) => (
            <option key={destination.id} value={destination.id}>
              {destination.name}
            </option>
          ))}
        </select>
      </Field>
      <Field className="md:col-span-2" label="地址">
        <input className={inputClassName} defaultValue={place?.address ?? ""} name="address" />
      </Field>
      <Field label="电话">
        <input className={inputClassName} defaultValue={place?.phone ?? ""} name="phone" />
      </Field>
      <Field label="官网">
        <input className={inputClassName} defaultValue={place?.website ?? ""} name="website" placeholder="https://..." type="url" />
      </Field>
      <Field label="来源链接">
        <input className={inputClassName} defaultValue={place?.sourceUrl ?? ""} name="sourceUrl" placeholder="https://..." type="url" />
      </Field>
      <Field label="来源名称">
        <input className={inputClassName} defaultValue={place?.sourceName ?? ""} name="sourceName" />
      </Field>
      <Field label="上次核验时间">
        <input className={inputClassName} defaultValue={toDateInputValue(place?.lastCheckedAt)} name="lastCheckedAt" type="date" />
      </Field>
      <Field label="营业时间">
        <input className={inputClassName} defaultValue={typeof place?.openingHours === "string" ? place.openingHours : ""} name="openingHours" />
      </Field>
      <Field label="预估花费">
        <input className={inputClassName} defaultValue={place?.estimatedCost ? String(place.estimatedCost) : ""} min="0" name="estimatedCost" step="0.01" type="number" />
      </Field>
      <Field label="建议游玩时长（分钟）">
        <input className={inputClassName} defaultValue={place?.estimatedDurationMin ?? ""} min="0" name="estimatedDurationMin" type="number" />
      </Field>
      <Field label="个人评分（1-5）">
        <input className={inputClassName} defaultValue={place?.ratingPersonal ?? ""} max="5" min="1" name="ratingPersonal" type="number" />
      </Field>
      <Field label="纬度">
        <input className={inputClassName} defaultValue={place?.latitude ?? ""} name="latitude" step="any" type="number" />
      </Field>
      <Field label="经度">
        <input className={inputClassName} defaultValue={place?.longitude ?? ""} name="longitude" step="any" type="number" />
      </Field>
      <Field className="md:col-span-2" label="标签">
        <input className={inputClassName} defaultValue={formatTags(place?.tags)} name="tags" placeholder="亲子, 雨天备用" />
      </Field>
      <Field className="md:col-span-2" label="备注">
        <textarea className={`${inputClassName} min-h-24 resize-y`} defaultValue={place?.notes ?? ""} name="notes" />
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

const secondaryButtonClassName =
  "rounded-md border border-[#2f6f73] px-4 py-2 text-sm font-semibold text-[#2f6f73] transition hover:bg-[#edf4f1]";

const dangerButtonClassName =
  "rounded-md border border-[#d46a55] px-3 py-2 text-sm font-semibold text-[#9b2f1f] transition hover:bg-[#fff2ee]";
