"use client";

import { useState } from "react";

import type { OfflineTripSummary } from "@/lib/offline";

const OFFLINE_SUMMARY_PREFIX = "traceme.offline.trip.";
const LAST_TRIP_KEY = "traceme.offline.lastTripId";

export function OfflineFallback() {
  const [summary] = useState<OfflineTripSummary | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }

    const lastTripId = window.localStorage.getItem(LAST_TRIP_KEY);
    const preferredKey = lastTripId
      ? `${OFFLINE_SUMMARY_PREFIX}${lastTripId}`
      : null;
    const fallbackKey = Object.keys(window.localStorage).find((key) =>
      key.startsWith(OFFLINE_SUMMARY_PREFIX),
    );
    const raw = window.localStorage.getItem(preferredKey ?? fallbackKey ?? "");

    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as OfflineTripSummary;
    } catch {
      return null;
    }
  });

  if (!summary) {
    return (
      <section className="mx-auto max-w-2xl space-y-4 px-4 py-10">
        <p className="text-sm font-semibold text-[#2f6f73]">离线模式</p>
        <h1 className="text-3xl font-semibold">暂无可用离线旅行摘要</h1>
        <p className="text-sm leading-6 text-[#5d6972]">
          回到有网络的环境后，进入具体旅行并点击“刷新离线缓存”，即可在弱网或离线时查看今日行程、住宿、清单和地点摘要。
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-3xl space-y-5 px-4 py-10">
      <div className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-[#2f6f73]">离线模式</p>
        <h1 className="mt-2 text-3xl font-semibold">{summary.title}</h1>
        <p className="mt-2 text-sm text-[#5d6972]">
          {summary.dateRange.startDate ?? "未设置日期"} 至{" "}
          {summary.dateRange.endDate ?? "未设置日期"}，缓存版本{" "}
          {summary.cacheVersion}
        </p>
      </div>

      <OfflineSection title="今日行程">
        {summary.today.items.length > 0 ? (
          <div className="space-y-3">
            {summary.today.items.map((item, index) => (
              <article
                className="rounded-md border border-[#e0d9cc] bg-[#fbfaf7] p-4"
                key={`${item.title}-${index}`}
              >
                <p className="text-sm font-semibold text-[#172026]">
                  {item.startTime ?? "--:--"} - {item.endTime ?? "--:--"}
                </p>
                <h2 className="mt-1 text-lg font-semibold">{item.title}</h2>
                <p className="mt-1 text-sm text-[#5d6972]">
                  {[item.type, item.placeName, item.transportToNext]
                    .filter(Boolean)
                    .join(" / ")}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[#5d6972]">今日暂无已缓存行程。</p>
        )}
      </OfflineSection>

      <OfflineSection title="住宿摘要">
        <SummaryList
          items={summary.lodging.map((item) =>
            [item.name, item.address, item.phone].filter(Boolean).join(" / "),
          )}
        />
      </OfflineSection>

      <OfflineSection title="准备清单">
        <SummaryList
          items={summary.checklist.map(
            (item) => `${item.category} / ${item.title} / ${item.status}`,
          )}
        />
      </OfflineSection>

      <OfflineSection title="地点与紧急备注">
        <SummaryList
          items={[
            ...summary.places.map((item) =>
              [item.name, item.address, item.phone].filter(Boolean).join(" / "),
            ),
            ...summary.emergencyNotes,
          ]}
        />
      </OfflineSection>
    </section>
  );
}

function OfflineSection({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SummaryList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-[#5d6972]">暂无缓存摘要。</p>;
  }

  return (
    <ul className="space-y-2 text-sm leading-6 text-[#34434c]">
      {items.map((item, index) => (
        <li className="rounded-md bg-[#fbfaf7] px-3 py-2" key={`${item}-${index}`}>
          {item}
        </li>
      ))}
    </ul>
  );
}
