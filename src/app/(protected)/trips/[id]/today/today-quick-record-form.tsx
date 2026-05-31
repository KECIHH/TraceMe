"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { inputClassName, primaryButtonClassName } from "@/components/ui";
import { TODAY_QUICK_RECORD_LIMITS } from "@/lib/today";

export function TodayQuickRecordForm({
  baseCurrency,
  categories,
  tripId,
}: {
  baseCurrency: string;
  categories: readonly string[];
  tripId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [lastExpense, setLastExpense] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function submit(formData: FormData) {
    setError("");
    setMessage("");
    setLastExpense("");
    setIsSaving(true);

    try {
      const response = await fetch(
        `/api/trips/${encodeURIComponent(tripId)}/today/quick-record`,
        {
          body: JSON.stringify(Object.fromEntries(formData)),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        setError(body.error ?? "快速记录保存失败。");
        return;
      }

      setMessage(body.message ?? "快速记录已保存。");
      const amount = String(formData.get("recordAmount") ?? "").trim();
      const currency = String(formData.get("recordCurrency") ?? baseCurrency)
        .trim()
        .toUpperCase();
      const parsedAmount = Number(amount);
      if (amount && Number.isFinite(parsedAmount)) {
        setLastExpense(
          `${currency} ${parsedAmount.toLocaleString("zh-CN", {
            maximumFractionDigits: 2,
            minimumFractionDigits: Number.isInteger(parsedAmount) ? 0 : 2,
          })}`,
        );
      }
      startTransition(() => router.refresh());
    } catch {
      setError("快速记录保存失败。");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form action={submit} className="mt-4 grid gap-3">
      {message ? (
        <p className="rounded-md border border-[#b8d8ca] bg-[#f0faf5] px-3 py-2 text-sm text-[#276044]">
          {message}
          {lastExpense ? <span className="ml-2 font-semibold">{lastExpense}</span> : null}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-[#f1b8aa] bg-[#fff2ee] px-3 py-2 text-sm text-[#9b2f1f]">
          {error}
        </p>
      ) : null}
      <textarea
        className={`${inputClassName} min-h-24 resize-y`}
        maxLength={TODAY_QUICK_RECORD_LIMITS.text}
        name="recordText"
        placeholder="文字备注"
      />
      <div className="grid grid-cols-2 gap-3">
        <input
          className={inputClassName}
          data-testid="today-record-amount"
          inputMode="decimal"
          min="0"
          name="recordAmount"
          placeholder="金额"
          step="0.01"
          type="number"
        />
        <input
          className={inputClassName}
          defaultValue={baseCurrency}
          maxLength={3}
          name="recordCurrency"
          placeholder="CNY"
        />
      </div>
      <select className={inputClassName} name="recordCategory">
        <option value="">支出分类</option>
        {categories.map((category) => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
      </select>
      <input
        className={inputClassName}
        maxLength={TODAY_QUICK_RECORD_LIMITS.place}
        name="recordPlace"
        placeholder="临时地点"
      />
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <input
          className={inputClassName}
          maxLength={TODAY_QUICK_RECORD_LIMITS.reminder}
          name="recordReminder"
          placeholder="提醒"
        />
        <input
          aria-label="提醒日期"
          className={inputClassName}
          name="recordReminderDate"
          type="date"
        />
      </div>
      <button
        className={primaryButtonClassName}
        data-testid="today-save-quick-record"
        disabled={isSaving || isPending}
        type="submit"
      >
        {isSaving || isPending ? "保存中..." : "保存记录"}
      </button>
    </form>
  );
}
