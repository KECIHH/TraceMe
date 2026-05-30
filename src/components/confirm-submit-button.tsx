"use client";

import { useFormStatus } from "react-dom";

export function ConfirmSubmitButton({
  children,
  className,
  message,
  pendingLabel = "处理中...",
}: {
  children: React.ReactNode;
  className: string;
  message: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      className={className}
      disabled={pending}
      onClick={(event) => {
        if (!window.confirm(message)) {
          event.preventDefault();
        }
      }}
      type="submit"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
