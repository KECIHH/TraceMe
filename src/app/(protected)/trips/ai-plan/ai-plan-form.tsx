"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  AI_PLAN_PREFERENCE_OPTIONS,
  AI_PLAN_STAY_OPTIONS,
  AI_PLAN_TRANSPORT_OPTIONS,
  type AiPlanInput,
} from "@/lib/ai-plan";

import type { AiPlanActionState } from "./action-state";

type AiPlanFormProps = {
  action: (
    previousState: AiPlanActionState,
    formData: FormData,
  ) => Promise<AiPlanActionState>;
  initialState: AiPlanActionState;
};

export function AiPlanForm({ action, initialState }: AiPlanFormProps) {
  const [state, formAction] = useActionState(action, initialState);
  const { errors, values } = state;

  return (
    <form action={formAction} className="space-y-6">
      {state.message ? (
        <p className="rounded-md border border-[#f1b8aa] bg-[#fff2ee] px-4 py-3 text-sm text-[#9b2f1f]">
          {state.message}
        </p>
      ) : null}
      {errors.sensitive ? (
        <p className="rounded-md border border-[#f0d39b] bg-[#fff9e8] px-4 py-3 text-sm text-[#73530f]">
          {errors.sensitive}
        </p>
      ) : null}

      <Field label="旅行目标">
        <textarea
          className={`${inputClassName(errors.travelGoal)} min-h-24 resize-y`}
          defaultValue={values.travelGoal}
          name="travelGoal"
          placeholder="例如：三天带父母轻松吃逛成都，预算别超太多，避开排队过久的安排。"
        />
      </Field>

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="目的地" error={errors.destination} required>
          <input
            className={inputClassName(errors.destination)}
            defaultValue={values.destination}
            name="destination"
            placeholder="例如：成都"
            type="text"
          />
        </Field>
        <Field label="出发城市" error={errors.homeCity} required>
          <input
            className={inputClassName(errors.homeCity)}
            defaultValue={values.homeCity}
            name="homeCity"
            placeholder="例如：上海"
            type="text"
          />
        </Field>
        <Field label="出发日期" error={errors.startDate} required>
          <input
            className={inputClassName(errors.startDate)}
            defaultValue={values.startDate}
            name="startDate"
            type="date"
          />
        </Field>
        <Field label="返回日期" error={errors.endDate} required>
          <input
            className={inputClassName(errors.endDate)}
            defaultValue={values.endDate}
            name="endDate"
            type="date"
          />
        </Field>
        <Field label="出行人数" error={errors.people}>
          <input
            className={inputClassName(errors.people)}
            defaultValue={values.people}
            min="1"
            name="people"
            placeholder="例如：2"
            type="number"
          />
        </Field>
        <Field label="预算（CNY）" error={errors.budgetAmount}>
          <input
            className={inputClassName(errors.budgetAmount)}
            defaultValue={values.budgetAmount}
            min="0"
            name="budgetAmount"
            placeholder="例如：8000"
            step="0.01"
            type="number"
          />
        </Field>
      </div>

      <OptionGroup
        label="旅行偏好"
        name="preferences"
        options={AI_PLAN_PREFERENCE_OPTIONS}
        values={values.preferences}
      />

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="出行强度">
          <select className={inputClassName()} defaultValue={values.pace} name="pace">
            <option value="relaxed">轻松</option>
            <option value="balanced">适中</option>
            <option value="packed">紧凑</option>
          </select>
        </Field>
        <Field label="同行人类型">
          <input
            className={inputClassName()}
            defaultValue={values.companions}
            name="companions"
            placeholder="例如：情侣、亲子、带老人"
            type="text"
          />
        </Field>
      </div>

      <OptionGroup
        label="交通偏好"
        name="transportPreferences"
        options={AI_PLAN_TRANSPORT_OPTIONS}
        values={values.transportPreferences}
      />
      <OptionGroup
        label="住宿偏好"
        name="stayPreferences"
        options={AI_PLAN_STAY_OPTIONS}
        values={values.stayPreferences}
      />

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="必去地点">
          <textarea
            className={`${inputClassName()} min-h-24 resize-y`}
            defaultValue={values.mustVisit}
            name="mustVisit"
            placeholder="用逗号或换行分隔"
          />
        </Field>
        <Field label="避开事项">
          <textarea
            className={`${inputClassName()} min-h-24 resize-y`}
            defaultValue={values.avoid}
            name="avoid"
            placeholder="例如：少爬坡、避开排队过久、不要太晚回酒店"
          />
        </Field>
      </div>

      <p className="rounded-md border border-[#f0d39b] bg-[#fff9e8] px-4 py-3 text-sm leading-6 text-[#73530f]">
        先说需求，再由 AI 生成 2-3 个可比较方案。结果始终是草稿，确认前不会写入正式旅行数据。请不要输入身份证、护照、手机号、订单号、API Key 或环境变量等敏感信息。
      </p>

      <div className="flex flex-col-reverse gap-3 border-t border-[#e0d9cc] pt-6 sm:flex-row sm:justify-end">
        <Link
          className="inline-flex justify-center rounded-md border border-[#cfd7d2] px-4 py-2.5 text-sm font-semibold text-[#34434c] transition hover:border-[#2f6f73] hover:text-[#2f6f73]"
          href="/trips/new"
        >
          返回创建入口
        </Link>
        <GenerateButton />
      </div>
    </form>
  );
}

function OptionGroup({
  label,
  name,
  options,
  values,
}: {
  label: string;
  name: keyof Pick<
    AiPlanInput,
    "preferences" | "stayPreferences" | "transportPreferences"
  >;
  options: string[];
  values: string[];
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-[#34434c]">{label}</legend>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            className="inline-flex items-center gap-2 rounded-md border border-[#cfd7d2] bg-white px-3 py-2 text-sm text-[#34434c]"
            key={option}
          >
            <input
              className="h-4 w-4 accent-[#2f6f73]"
              defaultChecked={values.includes(option)}
              name={name}
              type="checkbox"
              value={option}
            />
            {option}
          </label>
        ))}
      </div>
    </fieldset>
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

function GenerateButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="inline-flex justify-center rounded-md bg-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#285f62] disabled:cursor-not-allowed disabled:bg-[#90aaa9]"
      disabled={pending}
      type="submit"
    >
      {pending ? "正在生成 AI 方案..." : "生成 AI 方案"}
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
