"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import type { OfflineTripSummary } from "@/lib/offline";

const OFFLINE_SUMMARY_PREFIX = "traceme.offline.trip.";
const LAST_TRIP_KEY = "traceme.offline.lastTripId";
const MAX_OFFLINE_SUMMARY_BYTES = 256 * 1024;
const serviceWorkerVersion =
  process.env.NEXT_PUBLIC_APP_VERSION ??
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
  "dev";

export function getOfflineSummaryStorageKey(tripId: string): string {
  return `${OFFLINE_SUMMARY_PREFIX}${tripId}`;
}

export function PwaManager() {
  const pathname = usePathname();
  const tripId = useMemo(() => getTripIdFromPath(pathname), [pathname]);
  const [isOnline, setIsOnline] = useState(true);
  const [status, setStatus] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register(`/sw.js?v=${encodeURIComponent(serviceWorkerVersion)}`)
        .catch(() => {
          setStatus("Service Worker 注册失败，离线访问暂不可用。");
        });
    }
  }, []);

  useEffect(() => {
    const updateOnlineState = () => setIsOnline(window.navigator.onLine);

    updateOnlineState();
    window.addEventListener("online", updateOnlineState);
    window.addEventListener("offline", updateOnlineState);

    return () => {
      window.removeEventListener("online", updateOnlineState);
      window.removeEventListener("offline", updateOnlineState);
    };
  }, []);

  async function refreshOfflineCache() {
    if (!tripId) {
      setStatus("进入具体旅行后可刷新离线摘要。");
      return;
    }

    setIsBusy(true);
    setStatus("正在刷新离线摘要...");

    try {
      const response = await fetch(`/api/trips/${tripId}/offline-summary`, {
        cache: "no-store",
        credentials: "same-origin",
      });

      if (!response.ok) {
        throw new Error("offline summary failed");
      }

      const summary = (await response.json()) as OfflineTripSummary;
      const serializedSummary = JSON.stringify(summary);

      if (new Blob([serializedSummary]).size > MAX_OFFLINE_SUMMARY_BYTES) {
        throw new Error("offline summary too large");
      }

      const storageEstimate = await navigator.storage?.estimate?.();

      if (
        storageEstimate?.quota &&
        storageEstimate.usage &&
        storageEstimate.usage / storageEstimate.quota > 0.9
      ) {
        throw new Error("storage quota is nearly full");
      }

      window.localStorage.setItem(
        getOfflineSummaryStorageKey(tripId),
        serializedSummary,
      );
      window.localStorage.setItem(LAST_TRIP_KEY, tripId);

      setStatus(`离线摘要已更新，版本 ${summary.cacheVersion}。`);
    } catch {
      setStatus("刷新失败，请在网络可用且已登录时重试。");
    } finally {
      setIsBusy(false);
    }
  }

  async function clearOfflineData() {
    setIsBusy(true);

    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith(OFFLINE_SUMMARY_PREFIX) || key === LAST_TRIP_KEY) {
        window.localStorage.removeItem(key);
      }
    }

    if ("caches" in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith("traceme-"))
          .map((name) => caches.delete(name)),
      );
    }

    setStatus("本设备离线数据已清除。");
    setIsBusy(false);
  }

  return (
    <div className="print:hidden">
      {!isOnline ? (
        <div
          className="border-b border-[#ead0a7] bg-[#fff8ec] px-4 py-2 text-center text-sm font-medium text-[#7a4b12]"
          role="status"
        >
          当前处于离线状态，可查看已缓存的旅行摘要。
        </div>
      ) : null}

      <div className="border-b border-[#d8d2c6] bg-[#fbfaf7] px-4 py-2">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[#5d6972]" role="status">
            {status || (tripId ? "可手动刷新本旅行离线摘要。" : "PWA 离线能力已启用。")}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-md border border-[#2f6f73] px-3 py-2 text-xs font-semibold text-[#2f6f73] transition hover:bg-[#edf4f1] disabled:opacity-60"
              data-testid="refresh-offline-cache"
              disabled={isBusy || !tripId}
              onClick={refreshOfflineCache}
              type="button"
            >
              刷新离线缓存
            </button>
            <button
              className="rounded-md border border-[#d46a55] px-3 py-2 text-xs font-semibold text-[#9b2f1f] transition hover:bg-[#fff2ee] disabled:opacity-60"
              data-testid="clear-offline-cache"
              disabled={isBusy}
              onClick={clearOfflineData}
              type="button"
            >
              清除本设备离线数据
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function getTripIdFromPath(pathname: string): string | null {
  const match = /^\/trips\/([^/]+)/.exec(pathname);
  const tripId = match?.[1] ?? null;

  if (!tripId || tripId === "new" || tripId === "ai-plan") {
    return null;
  }

  return tripId;
}
