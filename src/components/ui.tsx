import Link from "next/link";

export function EmptyState({
  actionHref,
  actionLabel,
  description,
  title,
}: {
  actionHref?: string;
  actionLabel?: string;
  description: string;
  title: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-[#b8c8c4] bg-white p-6 text-center shadow-sm sm:p-8">
      <h2 className="text-xl font-semibold text-[#172026]">{title}</h2>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[#5d6972]">
        {description}
      </p>
      {actionHref && actionLabel ? (
        <Link
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-md bg-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#285f62]"
          href={actionHref}
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

export function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[#7a858c]">{label}</dt>
      <dd className="mt-1 break-words font-medium text-[#34434c]">{value}</dd>
    </div>
  );
}

export function StatusPill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "danger" | "muted" | "neutral" | "success" | "warning";
}) {
  const tones = {
    danger: "bg-[#fff2ee] text-[#9b2f1f]",
    muted: "bg-[#eef0f2] text-[#44515a]",
    neutral: "bg-[#edf4f1] text-[#2f6f73]",
    success: "bg-[#e8f6ef] text-[#276044]",
    warning: "bg-[#fff7d6] text-[#6d5412]",
  };

  return (
    <span
      className={`inline-flex min-h-7 items-center rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export const inputClassName =
  "w-full rounded-md border border-[#cfd7d2] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#2f6f73] focus:ring-2 focus:ring-[#2f6f73]/20";

export const primaryButtonClassName =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#285f62] disabled:cursor-not-allowed disabled:bg-[#90aaa9]";

export const secondaryButtonClassName =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-[#2f6f73] transition hover:bg-[#edf4f1] disabled:cursor-not-allowed disabled:opacity-60";

export const dangerButtonClassName =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-[#d46a55] px-4 py-2.5 text-sm font-semibold text-[#9b2f1f] transition hover:bg-[#fff2ee] disabled:cursor-not-allowed disabled:opacity-60";
