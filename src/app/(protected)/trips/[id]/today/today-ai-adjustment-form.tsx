"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { inputClassName, primaryButtonClassName } from "@/components/ui";

export function TodayAiAdjustmentForm({ tripId }: { tripId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function submit(formData: FormData) {
    setError("");
    setMessage("");
    setIsSaving(true);

    try {
      const response = await fetch(
        `/api/trips/${encodeURIComponent(tripId)}/today/ai-adjustment`,
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
        setError(body.error ?? "AI 调整草稿生成失败。");
        return;
      }

      setMessage(body.message ?? "AI 调整草稿已生成，原计划未被覆盖。");
      startTransition(() => router.refresh());
    } catch {
      setError("AI 调整草稿生成失败。");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form action={submit} className="mt-4 grid gap-3">
      {message ? (
        <div className="space-y-3">
          <p className="rounded-md border border-[#b8d8ca] bg-[#f0faf5] px-3 py-2 text-sm text-[#276044]">
            {message}
          </p>
          <article
            className="rounded-md border border-[#e0d9cc] bg-[#fbfaf7] p-4"
            data-testid="today-ai-draft-card"
          >
            <h3 className="font-semibold">今日调整建议</h3>
            <p className="mt-2 text-sm leading-6 text-[#5d6972]">
              草稿已保存，原计划未被覆盖。
            </p>
          </article>
        </div>
      ) : null}
      {error ? (
        <p className="rounded-md border border-[#f1b8aa] bg-[#fff2ee] px-3 py-2 text-sm text-[#9b2f1f]">
          {error}
        </p>
      ) : null}
      <textarea
        className={`${inputClassName} min-h-24 resize-y`}
        maxLength={500}
        name="todayChange"
        placeholder="例如：下雨、排队太久、已经多花了 200、想把下午改轻松"
        required
      />
      <button
        className={primaryButtonClassName}
        data-testid="today-generate-ai-draft"
        disabled={isSaving || isPending}
        type="submit"
      >
        {isSaving || isPending ? "生成中..." : "生成调整草稿"}
      </button>
    </form>
  );
}
