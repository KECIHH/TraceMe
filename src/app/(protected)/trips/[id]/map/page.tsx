import { notFound } from "next/navigation";

import {
  buildPolylinePoints,
  createNavigationUrls,
  hasCoordinates,
  PLACE_TYPE_MARKER_STYLES,
  projectPlacesToMap,
  type MapPlace,
} from "@/lib/external/map";
import { createMapProvider, EXTERNAL_DATA_REFERENCE_NOTICE } from "@/lib/external/map-provider";
import { getMapProviderHealth } from "@/lib/external/providers";
import { getPlaceTypeLabel } from "@/lib/trip-management";
import { prisma } from "@/lib/prisma";

import { Notice, TripModuleNav } from "../module-nav";

type TripMapPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string; message?: string }>;
};

export default async function TripMapPage({
  params,
  searchParams,
}: TripMapPageProps) {
  const { id } = await params;
  const queryParams = (await searchParams) ?? {};
  const trip = await prisma.trip.findUnique({
    include: {
      itineraryDays: {
        include: {
          items: {
            include: {
              place: true,
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
        include: { destination: true },
        orderBy: [{ type: "asc" }, { name: "asc" }],
      },
    },
    where: { id },
  });

  if (!trip) {
    notFound();
  }

  const mapPlaces: MapPlace[] = trip.places.filter(hasCoordinates).map((place) => ({
    address: place.address,
    id: place.id,
    latitude: place.latitude,
    longitude: place.longitude,
    name: place.name,
    type: place.type,
  }));
  const projectedPlaces = projectPlacesToMap(mapPlaces);
  const mapProvider = createMapProvider();
  const providerResult = mapProvider.buildPlaceMap(mapPlaces);
  const providerHealth = getMapProviderHealth();
  const dayRoutes = trip.itineraryDays.map((day) => {
    const routePlaces = day.items
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

    return {
      date: day.date,
      id: day.id,
      places: projectPlacesToMap(routePlaces),
      title: day.title || day.city || toDateLabel(day.date),
    };
  });

  return (
    <section className="space-y-6">
      <TripModuleNav active="map" tripId={trip.id} tripTitle={trip.title} />
      <Notice error={queryParams.error} message={queryParams.message} />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#2f6f73]">地图</p>
          <h1 className="mt-2 text-3xl font-semibold">地点地图</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#5d6972]">
            显示已填写经纬度的地点，并提供 Google Maps、Apple Maps、高德和百度的外部导航链接。
          </p>
        </div>
        <p className="rounded-md border border-[#e0d9cc] bg-[#fbfaf7] px-3 py-2 text-sm text-[#5d6972]">
          {EXTERNAL_DATA_REFERENCE_NOTICE}
        </p>
      </div>

      <div className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Provider 状态</h2>
            <p className="mt-1 text-sm text-[#5d6972]">{providerHealth.message}</p>
          </div>
          <span className="rounded-full bg-[#edf4f1] px-3 py-1 text-xs font-semibold text-[#2f6f73]">
            {providerResult.ok ? providerResult.attribution : providerResult.error}
          </span>
        </div>
        {providerHealth.publicKeyAllowed ? (
          <p className="mt-3 rounded-md border border-[#f0d39b] bg-[#fff9e8] px-3 py-2 text-sm text-[#73530f]">
            前端地图 Key 必须在第三方服务后台限制允许域名，服务端 API Key 不得下发到浏览器。
          </p>
        ) : null}
      </div>

      <MapCanvas
        emptyText="暂无可显示坐标的地点。请先在地点详情中填写经纬度。"
        places={projectedPlaces}
      />

      <section className="grid gap-4 lg:grid-cols-2">
        {trip.places.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[#b8c8c4] bg-white p-6 text-center text-sm text-[#5d6972]">
            还没有地点。先去地点库新增地点后，地图会自动显示。
          </p>
        ) : (
          trip.places.map((place) => (
            <article
              className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm"
              data-testid="map-place-card"
              key={place.id}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{place.name}</h2>
                  <p className="mt-1 text-sm text-[#5d6972]">
                    {getPlaceTypeLabel(place.type)} / {place.destination?.name ?? "未关联目的地"}
                  </p>
                </div>
                <span className="rounded-full bg-[#edf4f1] px-2.5 py-1 text-xs font-medium text-[#2f6f73]">
                  {hasCoordinates(place)
                    ? `${place.latitude.toFixed(5)}, ${place.longitude.toFixed(5)}`
                    : "未填写坐标"}
                </span>
              </div>
              <p className="mt-3 text-sm text-[#5d6972]">
                {place.address || "暂无地址"}
              </p>
              <NavigationLinks place={place} />
            </article>
          ))
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">每日路线顺序</h2>
        {dayRoutes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[#b8c8c4] bg-white p-6 text-sm text-[#5d6972]">
            还没有行程日历。生成行程后，这里会按当天地点顺序显示直线连接。
          </p>
        ) : (
          dayRoutes.map((day) => (
            <article
              className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm"
              key={day.id}
            >
              <h3 className="font-semibold">{day.title}</h3>
              <p className="mt-1 text-sm text-[#5d6972]">{toDateLabel(day.date)}</p>
              <div className="mt-4">
                <MapCanvas
                  compact
                  emptyText="当天还没有带坐标的地点。"
                  places={day.places}
                  showPolyline
                />
              </div>
            </article>
          ))
        )}
      </section>
    </section>
  );
}

function MapCanvas({
  compact = false,
  emptyText,
  places,
  showPolyline = false,
}: {
  compact?: boolean;
  emptyText: string;
  places: Array<MapPlace & { x: number; y: number }>;
  showPolyline?: boolean;
}) {
  return (
    <div
      className={[
        "relative overflow-hidden rounded-lg border border-[#cfd7d2] bg-[#eef4f1]",
        compact ? "h-72" : "h-[520px]",
      ].join(" ")}
      data-testid="trip-map-canvas"
    >
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(47,111,115,0.12)_1px,transparent_1px),linear-gradient(rgba(47,111,115,0.12)_1px,transparent_1px)] bg-[size:48px_48px]" />
      {showPolyline && places.length > 1 ? (
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
      {places.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-[#5d6972]">
          {emptyText}
        </div>
      ) : (
        places.map((place, index) => {
          const style = PLACE_TYPE_MARKER_STYLES[place.type];

          return (
            <details
              className="group absolute"
              data-testid="map-marker"
              key={place.id}
              style={{ left: `${place.x}%`, top: `${place.y}%` }}
            >
              <summary
                className={[
                  "-translate-x-1/2 -translate-y-1/2 cursor-pointer list-none rounded-full border-2 border-white px-2.5 py-1 text-xs font-bold text-white shadow-md",
                  style.className,
                ].join(" ")}
                title={place.name}
              >
                {showPolyline ? index + 1 : style.label}
              </summary>
              <div className="absolute left-3 top-3 z-10 w-64 rounded-md border border-[#d8d2c6] bg-white p-3 text-sm shadow-lg">
                <p className="font-semibold text-[#172026]">{place.name}</p>
                <p className="mt-1 text-xs text-[#5d6972]">
                  {getPlaceTypeLabel(place.type)} / {place.latitude.toFixed(5)}, {place.longitude.toFixed(5)}
                </p>
                <NavigationLinks compact place={place} />
              </div>
            </details>
          );
        })
      )}
    </div>
  );
}

function NavigationLinks({
  compact = false,
  place,
}: {
  compact?: boolean;
  place: {
    address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    name: string;
  };
}) {
  const urls = createNavigationUrls(place);
  const className = compact
    ? "text-xs font-medium text-[#2f6f73]"
    : "rounded-md border border-[#2f6f73] px-2.5 py-1.5 text-xs font-semibold text-[#2f6f73] transition hover:bg-[#edf4f1]";

  return (
    <div className={compact ? "mt-2 flex flex-wrap gap-2" : "mt-4 flex flex-wrap gap-2"}>
      <a className={className} href={urls.google} rel="noreferrer" target="_blank">
        Google Maps
      </a>
      <a className={className} href={urls.apple} rel="noreferrer" target="_blank">
        Apple Maps
      </a>
      <a className={className} href={urls.gaode} rel="noreferrer" target="_blank">
        高德地图
      </a>
      <a className={className} href={urls.baidu} rel="noreferrer" target="_blank">
        百度地图
      </a>
    </div>
  );
}

function toDateLabel(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
