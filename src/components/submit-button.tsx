"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  className,
  disabled,
  pendingLabel = "保存中...",
  ...buttonProps
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  children: ReactNode;
  className: string;
  disabled?: boolean;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      {...buttonProps}
      className={className}
      disabled={pending || disabled}
      type="submit"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
