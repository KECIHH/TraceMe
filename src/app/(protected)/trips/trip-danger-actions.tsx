"use client";

import { useFormStatus } from "react-dom";

export function DeleteTripForm({
  action,
  tripTitle,
}: {
  action: () => Promise<void>;
  tripTitle: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(`确认删除旅行「${tripTitle}」？此操作不可恢复。`)) {
          event.preventDefault();
        }
      }}
    >
      <DangerButton label="删除旅行" pendingLabel="删除中..." />
    </form>
  );
}

export function ArchiveTripForm({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action}>
      <SecondaryButton label="归档旅行" pendingLabel="归档中..." />
    </form>
  );
}

function DangerButton({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      className="w-full rounded-md border border-[#e6b4a9] px-4 py-2.5 text-sm font-semibold text-[#9b2f1f] transition hover:bg-[#fff2ee] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      disabled={pending}
      type="submit"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function SecondaryButton({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      className="w-full rounded-md border border-[#cfd7d2] px-4 py-2.5 text-sm font-semibold text-[#34434c] transition hover:border-[#2f6f73] hover:text-[#2f6f73] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      disabled={pending}
      type="submit"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
