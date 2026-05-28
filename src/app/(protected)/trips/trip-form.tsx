"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";

import { TRIP_STATUS_OPTIONS } from "@/lib/trips";

import type { TripActionState } from "./action-state";

type TripFormProps = {
  action: (
    previousState: TripActionState,
    formData: FormData,
  ) => Promise<TripActionState>;
  cancelHref: string;
  initialState: TripActionState;
  submitLabel: string;
};

export function TripForm({
  action,
  cancelHref,
  initialState,
  submitLabel,
}: TripFormProps) {
  const [state, formAction] = useActionState(action, initialState);
  const { values, errors } = state;

  return (
    <form action={formAction} className="space-y-6">
      {state.message ? (
        <p className="rounded-md border border-[#f1b8aa] bg-[#fff2ee] px-4 py-3 text-sm text-[#9b2f1f]">
          {state.message}
        </p>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="旅行名称" error={errors.title} required>
          <input
            className={inputClassName(errors.title)}
            defaultValue={values.title}
            name="title"
            placeholder="例如：秋日关西慢旅行"
            type="text"
          />
        </Field>

        <Field label="状态" error={errors.status}>
          <select
            className={inputClassName(errors.status)}
            defaultValue={values.status}
            name="status"
          >
            {TRIP_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="出发日期" error={errors.startDate}>
          <input
            className={inputClassName(errors.startDate)}
            defaultValue={values.startDate}
            name="startDate"
            type="date"
          />
        </Field>

        <Field label="返回日期" error={errors.endDate}>
          <input
            className={inputClassName(errors.endDate)}
            defaultValue={values.endDate}
            name="endDate"
            type="date"
          />
        </Field>

        <Field label="出发城市" error={errors.homeCity}>
          <input
            className={inputClassName(errors.homeCity)}
            defaultValue={values.homeCity}
            name="homeCity"
            placeholder="例如：上海"
            type="text"
          />
        </Field>

        <Field label="主要目的地" error={errors.mainDestination}>
          <input
            className={inputClassName(errors.mainDestination)}
            defaultValue={values.mainDestination}
            name="mainDestination"
            placeholder="例如：京都、大阪"
            type="text"
          />
        </Field>

        <Field label="默认货币" error={errors.baseCurrency}>
          <input
            className={inputClassName(errors.baseCurrency)}
            defaultValue={values.baseCurrency}
            maxLength={3}
            name="baseCurrency"
            placeholder="CNY"
            type="text"
          />
        </Field>

        <Field label="总预算" error={errors.budgetAmount}>
          <input
            className={inputClassName(errors.budgetAmount)}
            defaultValue={values.budgetAmount}
            min="0"
            name="budgetAmount"
            placeholder="例如：12000"
            step="0.01"
            type="number"
          />
        </Field>
      </div>

      <Field label="封面图 URL" error={errors.coverImage}>
        <input
          className={inputClassName(errors.coverImage)}
          defaultValue={values.coverImage}
          name="coverImage"
          placeholder="https://..."
          type="url"
        />
      </Field>

      <Field label="简介" error={errors.description}>
        <textarea
          className={`${inputClassName(errors.description)} min-h-28 resize-y`}
          defaultValue={values.description}
          name="description"
          placeholder="记录这次旅行的主题、灵感或同行人。"
        />
      </Field>

      <div className="flex flex-col-reverse gap-3 border-t border-[#e0d9cc] pt-6 sm:flex-row sm:justify-end">
        <Link
          className="inline-flex justify-center rounded-md border border-[#cfd7d2] px-4 py-2.5 text-sm font-semibold text-[#34434c] transition hover:border-[#2f6f73] hover:text-[#2f6f73]"
          href={cancelHref}
        >
          取消
        </Link>
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}

function Field({
  children,
  error,
  label,
  required,
}: {
  children: React.ReactNode;
  error?: string;
  label: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-[#34434c]">
        {label}
        {required ? <span className="text-[#9b2f1f]"> *</span> : null}
      </span>
      <div className="mt-2">{children}</div>
      {error ? <p className="mt-2 text-sm text-[#9b2f1f]">{error}</p> : null}
    </label>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      className="inline-flex justify-center rounded-md bg-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#285f62] disabled:cursor-not-allowed disabled:bg-[#90aaa9]"
      disabled={pending}
      type="submit"
    >
      {pending ? "保存中..." : label}
    </button>
  );
}

function inputClassName(error?: string) {
  return [
    "w-full rounded-md border bg-white px-3 py-2 text-sm outline-none transition",
    "focus:border-[#2f6f73] focus:ring-2 focus:ring-[#2f6f73]/20",
    error ? "border-[#d46a55]" : "border-[#cfd7d2]",
  ].join(" ");
}
