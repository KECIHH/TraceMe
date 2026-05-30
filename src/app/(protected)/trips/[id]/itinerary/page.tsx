import type {
  BookingStatus,
  ItineraryItemStatus,
  ItineraryItemType,
  Place,
  Prisma,
  Priority,
} from "@prisma/client";
import { notFound } from "next/navigation";

import { SubmitButton } from "@/components/submit-button";
import { ItineraryDragSort } from "@/components/itinerary-drag-sort";
import { formatDisplayMoney, formatEmptyValue } from "@/lib/display-format";
import {
  buildPolylinePoints,
  createNavigationUrls,
  hasCoordinates,
  PLACE_TYPE_MARKER_STYLES,
  projectPlacesToMap,
} from "@/lib/external/map";
import { formatWeatherSnapshot, toDateKey } from "@/lib/external/weather";
import {
  analyzeItineraryDay,
  BOOKING_STATUS_OPTIONS,
  formatDateInputValue,
  formatDateTitle,
  formatTimeInputValue,
  formatTimeRange,
  getBookingStatusLabel,
  getItineraryItemTypeLabel,
  getItineraryPriorityLabel,
  getItineraryStatusLabel,
  ITINERARY_ITEM_TYPE_OPTIONS,
  ITINERARY_PRIORITY_OPTIONS,
  ITINERARY_STATUS_OPTIONS,
  startOfLocalDay,
} from "@/lib/itinerary";
import { prisma } from "@/lib/prisma";

import { ConfirmSubmitButton } from "../confirm-submit-button";
import { refreshWeatherAction, saveManualWeatherAction } from "../external-actions";
import { Notice, TripModuleNav } from "../module-nav";
import {
  createItineraryItemAction,
  deleteItineraryItemAction,
  generateItineraryDaysAction,
  moveItineraryItemAction,
  reorderItineraryItemsAction,
  sortItineraryDayByStartTimeAction,
  syncItineraryDaysAction,
  updateItineraryDayAction,
  updateItineraryItemAction,
  updateItineraryItemStatusAction,
} from "./actions";

type ItineraryPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string; message?: string }>;
};

type ItineraryItemWithPlace = {
  id: string;
  title: string;
  type: ItineraryItemType;
  startTime: Date | null;
  endTime: Date | null;
  durationMin: number | null;
  costEstimate: Prisma.Decimal | null;
  bookingStatus: BookingStatus;
  priority: Priority;
  status: ItineraryItemStatus;
  transportToNext: string | null;
  notes: string | null;
  sortOrder: number;
  placeId: string | null;
  place: Pick<
    Place,
    "address" | "id" | "latitude" | "longitude" | "name" | "type"
  > | null;
};

export default async function ItineraryPage({
  params,
  searchParams,
}: ItineraryPageProps) {
  const { id } = await params;
  const queryParams = (await searchParams) ?? {};
  const trip = await prisma.trip.findUnique({
    include: {
      itineraryDays: {
        include: {
          items: {
            include: {
              place: {
                select: {
                  address: true,
                  id: true,
                  latitude: true,
                  longitude: true,
                  name: true,
                  type: true,
                },
              },
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
      places: { orderBy: [{ type: "asc" }, { name: "asc" }] },
      weatherSnapshots: { orderBy: { fetchedAt: "desc" } },
    },
    where: { id },
  });

  if (!trip) {
    notFound();
  }

  const generateAction = generateItineraryDaysAction.bind(null, trip.id);
  const syncAction = syncItineraryDaysAction.bind(null, trip.id);
  const refreshWeather = refreshWeatherAction.bind(null, trip.id);
  const saveManualWeather = saveManualWeatherAction.bind(null, trip.id);
  const baseCurrency = trip.baseCurrency || "CNY";
  const rangeStart = trip.startDate ? startOfLocalDay(trip.startDate) : null;
  const rangeEnd = trip.endDate ? startOfLocalDay(trip.endDate) : null;
  const outOfRangeDays = trip.itineraryDays.filter(
    (day) =>
      rangeStart &&
      rangeEnd &&
      (startOfLocalDay(day.date) < rangeStart ||
        startOfLocalDay(day.date) > rangeEnd),
  );

  return (
    <section className="space-y-6">
      <TripModuleNav active="itinerary" tripId={trip.id} tripTitle={trip.title} />
      <Notice error={queryParams.error} message={queryParams.message} />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#2f6f73]">行程日历</p>
          <h1 className="mt-2 text-3xl font-semibold">行程日历</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#5d6972]">
            按天安排景点、餐饮、交通和住宿，自动提示时间冲突、行程过密和转场过赶。
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <form action={refreshWeather}>
            <input name="returnTo" type="hidden" value={`/trips/${trip.id}/itinerary`} />
            <input name="forceRefresh" type="hidden" value="true" />
            <SubmitButton
              className={secondaryButtonClassName}
              data-testid="refresh-weather"
              pendingLabel="刷新中..."
            >
              刷新天气
            </SubmitButton>
          </form>
          <form action={generateAction}>
            <SubmitButton
              className={primaryButtonClassName}
              data-testid="generate-itinerary-days"
              pendingLabel="生成中..."
            >
              生成行程日期
            </SubmitButton>
          </form>
          <form action={syncAction}>
            <SubmitButton className={secondaryButtonClassName} pendingLabel="同步中...">
              同步行程日期
            </SubmitButton>
          </form>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          label="旅行日期"
          value={
            trip.startDate && trip.endDate
              ? `${formatDateInputValue(trip.startDate)} 至 ${formatDateInputValue(
                  trip.endDate,
                )}`
              : formatEmptyValue(null)
          }
        />
        <SummaryCard label="已生成天数" value={`${trip.itineraryDays.length} 天`} />
        <SummaryCard
          label="超出范围日期"
          value={
            outOfRangeDays.length > 0
              ? `${outOfRangeDays.length} 天已保留`
              : "无"
          }
        />
      </div>

      {trip.itineraryDays.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#b8c8c4] bg-white p-8 text-center">
          <h2 className="text-xl font-semibold">还没有行程日期</h2>
          <p className="mt-3 text-sm text-[#5d6972]">
            设置旅行开始和结束日期后，可以一键生成每天的行程卡片。
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {trip.itineraryDays.map((day, dayIndex) => {
            const items = day.items satisfies ItineraryItemWithPlace[];
            const alerts = analyzeItineraryDay(items);
            const dayCost = items.reduce(
              (sum, item) => sum + Number(item.costEstimate ?? 0),
              0,
            );
            const createItemAction = createItineraryItemAction.bind(
              null,
              trip.id,
              day.id,
            );
            const sortAction = sortItineraryDayByStartTimeAction.bind(
              null,
              trip.id,
              day.id,
            );
            const dragSortAction = reorderItineraryItemsAction.bind(
              null,
              trip.id,
              day.id,
            );
            const updateDayAction = updateItineraryDayAction.bind(
              null,
              trip.id,
              day.id,
            );
            const latestWeather = trip.weatherSnapshots.find(
              (snapshot) => toDateKey(snapshot.date) === toDateKey(day.date),
            );
            const routePlaces = items
              .map((item) => item.place)
              .filter((place): place is NonNullable<typeof place> => Boolean(place))
              .filter(hasCoordinates)
              .map((place) => ({
                address: place.address,
                id: place.id,
                latitude: place.latitude,
                longitude: place.longitude,
                name: place.name,
                type: place.type,
              }));
            const projectedRoutePlaces = projectPlacesToMap(routePlaces);
            const isOutOfRange =
              rangeStart &&
              rangeEnd &&
              (startOfLocalDay(day.date) < rangeStart ||
                startOfLocalDay(day.date) > rangeEnd);

            return (
              <article
                className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm"
                data-testid="itinerary-day-card"
                id={`day-${day.id}`}
                key={day.id}
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[#edf4f1] px-2.5 py-1 text-xs font-semibold text-[#2f6f73]">
                        Day {dayIndex + 1}
                      </span>
                      {isOutOfRange ? (
                        <span className="rounded-full bg-[#fff2ee] px-2.5 py-1 text-xs font-semibold text-[#9b2f1f]">
                          超出当前旅行日期
                        </span>
                      ) : null}
                    </div>
                    <h2 className="mt-3 text-2xl font-semibold">
                      {formatDateTitle(day.date)}
                    </h2>
                    <p className="mt-2 text-sm text-[#5d6972]">
                      {[day.city, day.theme, day.weatherSummary]
                        .filter(Boolean)
                        .join(" · ") || "城市、主题和天气待补充"}
                    </p>
                    {latestWeather ? (
                      <p
                        className="mt-2 rounded-md border border-[#b8d8ca] bg-[#f0faf5] px-3 py-2 text-sm text-[#276044]"
                        data-testid="weather-snapshot"
                      >
                        天气快照：{formatWeatherSnapshot(latestWeather)}。外部数据仅供参考，请人工核验。
                      </p>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 xl:min-w-[520px]">
                    <MiniStat label="行程数量" value={`${items.length} 项`} />
                    <MiniStat
                      label="预计花费"
                      value={formatMoney(dayCost, baseCurrency)}
                    />
                    <MiniStat label="提醒数量" value={`${alerts.length} 条`} />
                    <MiniStat label="城市" value={formatEmptyValue(day.city)} />
                  </div>
                </div>

                {alerts.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    {alerts.map((alert) => (
                      <p
                        className="rounded-md border border-[#f0d39b] bg-[#fff9e8] px-3 py-2 text-sm text-[#73530f]"
                        key={`${alert.type}-${alert.itemIds.join("-")}`}
                      >
                        {alert.message}
                      </p>
                    ))}
                  </div>
                ) : null}

                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-semibold text-[#2f6f73]">
                    编辑当天信息
                  </summary>
                  <form
                    action={updateDayAction}
                    className="mt-4 grid gap-4 border-t border-[#e0d9cc] pt-4 md:grid-cols-2"
                  >
                    <Field label="城市">
                      <input
                        className={inputClassName}
                        defaultValue={day.city ?? ""}
                        name="city"
                      />
                    </Field>
                    <Field label="主题">
                      <input
                        className={inputClassName}
                        defaultValue={day.theme ?? ""}
                        name="theme"
                      />
                    </Field>
                    <Field label="天气摘要">
                      <input
                        className={inputClassName}
                        defaultValue={day.weatherSummary ?? ""}
                        name="weatherSummary"
                      />
                    </Field>
                    <Field label="当天备注">
                      <input
                        className={inputClassName}
                        defaultValue={day.notes ?? ""}
                        name="notes"
                      />
                    </Field>
                    <div className="md:col-span-2">
                      <SubmitButton className={primaryButtonClassName}>
                        保存当天信息
                      </SubmitButton>
                    </div>
                  </form>
                </details>

                <details className="mt-4 rounded-md border border-[#e0d9cc] bg-[#fbfaf7] p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-[#2f6f73]">
                    手动天气备注
                  </summary>
                  <form action={saveManualWeather} className="mt-4 grid gap-4 md:grid-cols-3">
                    <Field label="日期">
                      <input
                        className={inputClassName}
                        defaultValue={formatDateInputValue(day.date)}
                        name="date"
                        type="date"
                      />
                    </Field>
                    <Field label="地点">
                      <input
                        className={inputClassName}
                        defaultValue={day.city ?? trip.mainDestination ?? ""}
                        name="locationName"
                      />
                    </Field>
                    <Field label="备注">
                      <input
                        className={inputClassName}
                        defaultValue={day.weatherSummary ?? ""}
                        name="manualNote"
                        placeholder="例如：阵雨，备伞"
                      />
                    </Field>
                    <div className="md:col-span-3">
                      <SubmitButton className={primaryButtonClassName}>
                        保存天气备注
                      </SubmitButton>
                    </div>
                  </form>
                </details>

                <DayRouteMap places={projectedRoutePlaces} />

                <div className="mt-5 flex flex-wrap gap-3">
                  <form action={sortAction}>
                    <SubmitButton className={secondaryButtonClassName} pendingLabel="排序中...">
                      按开始时间排序
                    </SubmitButton>
                  </form>
                </div>

                <div className="mt-5">
                  {items.length === 0 ? (
                    <p className="rounded-md bg-[#fbfaf7] p-4 text-sm text-[#5d6972]">
                      这一天还没有行程项。
                    </p>
                  ) : (
                    <ItineraryDragSort action={dragSortAction}>
                      {items.map((item, index) => (
                        <ItineraryItemCard
                          baseCurrency={baseCurrency}
                          canMoveDown={index < items.length - 1}
                          canMoveUp={index > 0}
                          item={item}
                          key={item.id}
                          places={trip.places}
                          tripId={trip.id}
                        />
                      ))}
                    </ItineraryDragSort>
                  )}
                </div>

                <details className="mt-5 rounded-md border border-[#e0d9cc] bg-[#fbfaf7] p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-[#2f6f73]">
                    添加行程项
                  </summary>
                  <ItineraryItemForm
                    action={createItemAction}
                    places={trip.places}
                    submitLabel="添加行程项"
                  />
                </details>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ItineraryItemCard({
  baseCurrency,
  canMoveDown,
  canMoveUp,
  item,
  places,
  tripId,
}: {
  baseCurrency: string;
  canMoveDown: boolean;
  canMoveUp: boolean;
  item: ItineraryItemWithPlace;
  places: Array<Pick<Place, "id" | "name" | "type">>;
  tripId: string;
}) {
  const updateAction = updateItineraryItemAction.bind(null, tripId, item.id);
  const deleteAction = deleteItineraryItemAction.bind(null, tripId, item.id);
  const moveUpAction = moveItineraryItemAction.bind(null, tripId, item.id, "up");
  const moveDownAction = moveItineraryItemAction.bind(
    null,
    tripId,
    item.id,
    "down",
  );
  const doneAction = updateItineraryItemStatusAction.bind(
    null,
    tripId,
    item.id,
    "DONE",
    "itinerary",
  );
  const skippedAction = updateItineraryItemStatusAction.bind(
    null,
    tripId,
    item.id,
    "SKIPPED",
    "itinerary",
  );

  return (
    <article
      className="rounded-md border border-[#e0d9cc] bg-white p-4"
      data-itinerary-item-id={item.id}
      data-testid="itinerary-item-card"
      draggable
      id={`item-${item.id}`}
    >
      <div className="grid gap-3 lg:grid-cols-[150px_1fr_auto] lg:items-start">
        <div>
          <p className="text-sm font-semibold text-[#172026]">
            {formatTimeRange(item.startTime, item.endTime)}
          </p>
          <p className="mt-1 text-xs text-[#7a858c]">
            排序 {item.sortOrder} · 可拖拽
          </p>
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#edf4f1] px-2.5 py-1 text-xs font-medium text-[#2f6f73]">
              {getItineraryItemTypeLabel(item.type)}
            </span>
            <span className="rounded-full bg-[#fff7d6] px-2.5 py-1 text-xs font-medium text-[#6d5412]">
              {getItineraryPriorityLabel(item.priority)}
            </span>
            <span className="rounded-full bg-[#eef0f2] px-2.5 py-1 text-xs font-medium text-[#44515a]">
              {getItineraryStatusLabel(item.status)}
            </span>
          </div>
          <h3 className="mt-2 text-lg font-semibold">{item.title}</h3>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
            <Info label="地点" value={item.place?.name ?? "未关联"} />
            <Info
              label="预估费用"
              value={formatMoney(item.costEstimate, baseCurrency)}
            />
            <Info label="预约" value={getBookingStatusLabel(item.bookingStatus)} />
            <Info
              label="预计时长"
              value={
                item.durationMin
                  ? `${item.durationMin} 分钟`
                  : formatEmptyValue(null)
              }
            />
          </dl>
          {item.transportToNext ? (
            <p className="mt-3 text-sm text-[#5d6972]">
              去下一站：{item.transportToNext}
            </p>
          ) : null}
          {item.notes ? (
            <p className="mt-3 rounded-md bg-[#fbfaf7] p-3 text-sm leading-6 text-[#5d6972]">
              {item.notes}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <form action={moveUpAction}>
            <button
              className={smallButtonClassName}
              disabled={!canMoveUp}
              type="submit"
            >
              上移
            </button>
          </form>
          <form action={moveDownAction}>
            <button
              className={smallButtonClassName}
              disabled={!canMoveDown}
              type="submit"
            >
              下移
            </button>
          </form>
          <form action={doneAction}>
            <SubmitButton className={smallButtonClassName} pendingLabel="更新中...">
              标记完成
            </SubmitButton>
          </form>
          <form action={skippedAction}>
            <SubmitButton className={smallButtonClassName} pendingLabel="更新中...">
              标记跳过
            </SubmitButton>
          </form>
        </div>
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-semibold text-[#2f6f73]">
          编辑行程项
        </summary>
        <div className="mt-4 border-t border-[#e0d9cc] pt-4">
          <ItineraryItemForm
            action={updateAction}
            item={item}
            places={places}
            submitLabel="保存行程项"
          />
        </div>
      </details>

      <form action={deleteAction} className="mt-4">
        <ConfirmSubmitButton
          className={dangerButtonClassName}
          message={`确定删除行程项“${item.title}”吗？`}
        >
          删除行程项
        </ConfirmSubmitButton>
      </form>
    </article>
  );
}

function ItineraryItemForm({
  action,
  item,
  places,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  item?: ItineraryItemWithPlace;
  places: Array<Pick<Place, "id" | "name" | "type">>;
  submitLabel: string;
}) {
  return (
    <form action={action} className="mt-4 grid gap-4 md:grid-cols-2">
      <Field label="标题" required>
        <input
          className={inputClassName}
          defaultValue={item?.title ?? ""}
          name="title"
          required
        />
      </Field>
      <Field label="类型">
        <select
          className={inputClassName}
          defaultValue={item?.type ?? "CUSTOM"}
          name="type"
        >
          {ITINERARY_ITEM_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="关联地点">
        <select
          className={inputClassName}
          defaultValue={item?.placeId ?? ""}
          name="placeId"
        >
          <option value="">不关联</option>
          {places.map((place) => (
            <option key={place.id} value={place.id}>
              {place.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="开始时间">
        <input
          className={inputClassName}
          defaultValue={formatTimeInputValue(item?.startTime)}
          name="startTime"
          type="time"
        />
      </Field>
      <Field label="结束时间">
        <input
          className={inputClassName}
          defaultValue={formatTimeInputValue(item?.endTime)}
          name="endTime"
          type="time"
        />
      </Field>
      <Field label="预计持续时间（分钟）">
        <input
          className={inputClassName}
          defaultValue={item?.durationMin ?? ""}
          min="0"
          name="durationMin"
          type="number"
        />
      </Field>
      <Field label="预估费用">
        <input
          className={inputClassName}
          defaultValue={item?.costEstimate ? String(item.costEstimate) : ""}
          min="0"
          name="costEstimate"
          step="0.01"
          type="number"
        />
      </Field>
      <Field label="预约状态">
        <select
          className={inputClassName}
          defaultValue={item?.bookingStatus ?? "NOT_REQUIRED"}
          name="bookingStatus"
        >
          {BOOKING_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="优先级">
        <select
          className={inputClassName}
          defaultValue={item?.priority ?? "MEDIUM"}
          name="priority"
        >
          {ITINERARY_PRIORITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="状态">
        <select
          className={inputClassName}
          defaultValue={item?.status ?? "PLANNED"}
          name="status"
        >
          {ITINERARY_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="去下一站交通方式">
        <input
          className={inputClassName}
          defaultValue={item?.transportToNext ?? ""}
          name="transportToNext"
        />
      </Field>
      <Field label="排序">
        <input
          className={inputClassName}
          defaultValue={item?.sortOrder ?? ""}
          name="sortOrder"
          type="number"
        />
      </Field>
      <Field className="md:col-span-2" label="备注">
        <textarea
          className={`${inputClassName} min-h-24 resize-y`}
          defaultValue={item?.notes ?? ""}
          name="notes"
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

function DayRouteMap({
  places,
}: {
  places: Array<{
    address?: string | null;
    id: string;
    latitude: number;
    longitude: number;
    name: string;
    type: Place["type"];
    x: number;
    y: number;
  }>;
}) {
  if (places.length === 0) {
    return (
      <p className="mt-5 rounded-md border border-dashed border-[#b8c8c4] bg-[#fbfaf7] p-4 text-sm text-[#5d6972]">
        当天还没有带坐标的地点，补充地点经纬度后会显示直线连接顺序。
      </p>
    );
  }

  return (
    <div
      className="relative mt-5 h-72 overflow-hidden rounded-md border border-[#cfd7d2] bg-[#eef4f1]"
      data-testid="itinerary-route-map"
    >
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(47,111,115,0.12)_1px,transparent_1px),linear-gradient(rgba(47,111,115,0.12)_1px,transparent_1px)] bg-[size:42px_42px]" />
      {places.length > 1 ? (
        <svg
          aria-hidden="true"
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
        >
          <polyline
            fill="none"
            points={buildPolylinePoints(places)}
            stroke="#2f6f73"
            strokeDasharray="3 2"
            strokeLinecap="round"
            strokeWidth="1.5"
          />
        </svg>
      ) : null}
      {places.map((place, index) => {
        const style = PLACE_TYPE_MARKER_STYLES[place.type];
        const navigationUrls = createNavigationUrls(place);

        return (
          <a
            className={[
              "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white px-2.5 py-1 text-xs font-bold text-white shadow-md",
              style.className,
            ].join(" ")}
            href={navigationUrls.google}
            key={`${place.id}-${index}`}
            rel="noreferrer"
            style={{ left: `${place.x}%`, top: `${place.y}%` }}
            target="_blank"
            title={place.name}
          >
            {index + 1}
          </a>
        );
      })}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
      <p className="text-sm text-[#66737b]">{label}</p>
      <p className="mt-2 text-lg font-semibold text-[#172026]">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#e0d9cc] bg-[#fbfaf7] px-3 py-2">
      <p className="text-xs text-[#7a858c]">{label}</p>
      <p className="mt-1 truncate font-semibold text-[#34434c]">{value}</p>
    </div>
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

function formatMoney(
  value: Prisma.Decimal | number | null,
  currency: string,
): string {
  const amount = Number(value ?? 0);

  if (!amount) {
    return formatDisplayMoney(0, currency);
  }

  return formatDisplayMoney(amount, currency);
}

const inputClassName =
  "w-full rounded-md border border-[#cfd7d2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#2f6f73] focus:ring-2 focus:ring-[#2f6f73]/20";

const primaryButtonClassName =
  "rounded-md bg-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#285f62]";

const secondaryButtonClassName =
  "rounded-md border border-[#2f6f73] px-4 py-2 text-sm font-semibold text-[#2f6f73] transition hover:bg-[#edf4f1]";

const smallButtonClassName =
  "rounded-md border border-[#cfd7d2] px-2.5 py-1.5 text-xs font-semibold text-[#34434c] transition hover:border-[#2f6f73] hover:text-[#2f6f73] disabled:cursor-not-allowed disabled:opacity-40";

const dangerButtonClassName =
  "rounded-md border border-[#d46a55] px-3 py-2 text-sm font-semibold text-[#9b2f1f] transition hover:bg-[#fff2ee]";
