"use client";

import type { ItineraryItemStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const statusLabels: Record<ItineraryItemStatus, string> = {
  DELAYED: "已延后",
  DONE: "已完成",
  PLANNED: "计划中",
  SKIPPED: "已跳过",
};

export function TodayStatusButton({
  itemId,
  label,
  status,
  testId,
  tripId,
}: {
  itemId: string;
  label: string;
  status: ItineraryItemStatus;
  testId?: string;
  tripId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSaving, setIsSaving] = useState(false);
  const [appliedStatus, setAppliedStatus] = useState<ItineraryItemStatus | null>(null);
  const [error, setError] = useState("");

  async function updateStatus() {
    setError("");
    setIsSaving(true);

    try {
      const response = await fetch(
        `/api/trips/${encodeURIComponent(tripId)}/itinerary-items/${encodeURIComponent(itemId)}/status`,
        {
          body: JSON.stringify({ status }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );

      if (!response.ok) {
        setError("状态更新失败");
        return;
      }

      setAppliedStatus(status);
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError("状态更新失败");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <span className="block">
      <button
        className="min-h-11 w-full rounded-md border border-[#2f6f73] px-2 py-2 text-sm font-semibold text-[#2f6f73] transition hover:bg-[#edf4f1] disabled:opacity-60"
        data-testid={testId}
        disabled={isPending || isSaving}
        onClick={updateStatus}
        type="button"
      >
        {isPending || isSaving ? "..." : label}
      </button>
      {appliedStatus ? (
        <span className="mt-1 block text-center text-xs font-semibold text-[#276044]">
          {statusLabels[appliedStatus]}
        </span>
      ) : null}
      {error ? (
        <span className="mt-1 block text-xs text-[#9b2f1f]" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
