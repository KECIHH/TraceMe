import type { ChecklistStatus, Priority } from "@prisma/client";
import { notFound } from "next/navigation";

import { SubmitButton } from "@/components/submit-button";
import { prisma } from "@/lib/prisma";
import {
  calculateChecklistCompletion,
  CHECKLIST_CATEGORIES,
  CHECKLIST_STATUS_OPTIONS,
  getChecklistStatusLabel,
  getPriorityLabel,
  PRIORITY_OPTIONS,
  toDateInputValue,
} from "@/lib/trip-management";

import {
  createChecklistItemAction,
  deleteChecklistItemAction,
  generateChecklistTemplateAction,
  updateChecklistItemAction,
  updateChecklistStatusAction,
} from "../actions";
import { ConfirmSubmitButton } from "../confirm-submit-button";
import { Notice, TripModuleNav } from "../module-nav";

type ChecklistPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    category?: string;
    error?: string;
    message?: string;
  }>;
};

export default async function ChecklistPage({
  params,
  searchParams,
}: ChecklistPageProps) {
  const { id } = await params;
  const queryParams = (await searchParams) ?? {};
  const selectedCategory = CHECKLIST_CATEGORIES.includes(queryParams.category ?? "")
    ? queryParams.category ?? ""
    : "";
  const trip = await prisma.trip.findUnique({
    where: { id },
    include: {
      checklistItems: {
        orderBy: [{ category: "asc" }, { createdAt: "asc" }],
        where: selectedCategory ? { category: selectedCategory } : undefined,
      },
    },
  });

  if (!trip) {
    notFound();
  }

  const allItems = selectedCategory
    ? await prisma.checklistItem.findMany({ where: { tripId: trip.id } })
    : trip.checklistItems;
  const completion = calculateChecklistCompletion(allItems);
  const createAction = createChecklistItemAction.bind(null, trip.id);
  const generateAction = generateChecklistTemplateAction.bind(null, trip.id);
  const groupedItems = CHECKLIST_CATEGORIES.map((category) => ({
    category,
    items: trip.checklistItems.filter((item) => item.category === category),
  })).filter((group) => group.items.length > 0);

  return (
    <section className="space-y-6">
      <TripModuleNav active="checklist" tripId={trip.id} tripTitle={trip.title} />
      <Notice error={queryParams.error} message={queryParams.message} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#2f6f73]">准备清单</p>
          <h1 className="mt-2 text-3xl font-semibold">出发前准备清单</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5d6972]">
            分类整理证件、票据、药品、电子设备和通信事项，支持标记已准备或不需要。
          </p>
        </div>
        <form action={generateAction}>
          <SubmitButton className={primaryButtonClassName} pendingLabel="生成中...">
            一键生成基础模板清单
          </SubmitButton>
        </form>
      </div>

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">完成率 {completion}%</h2>
            <p className="mt-1 text-sm text-[#5d6972]">
              不需要的事项不计入完成率。
            </p>
          </div>
          <form action={`/trips/${trip.id}/checklist`} className="flex gap-2">
            <select
              className={inputClassName}
              defaultValue={selectedCategory}
              name="category"
            >
              <option value="">全部分类</option>
              {CHECKLIST_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <SubmitButton className={secondaryButtonClassName} pendingLabel="查看中...">
              查看
            </SubmitButton>
          </form>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-[#eceff3]">
          <div
            className="h-full rounded-full bg-[#2f6f73]"
            style={{ width: `${completion}%` }}
          />
        </div>
      </section>

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">新增清单项</h2>
        <ChecklistForm action={createAction} submitLabel="新增清单项" />
      </section>

      <section className="space-y-4">
        {groupedItems.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#b8c8c4] bg-white p-8 text-center">
            <h2 className="text-xl font-semibold">暂无清单项</h2>
            <p className="mt-3 text-sm text-[#5d6972]">
              可以手动添加，或先生成基础模板再按旅行类型删改。
            </p>
          </div>
        ) : (
          groupedItems.map((group) => (
            <div className="space-y-3" key={group.category}>
              <h2 className="text-lg font-semibold">{group.category}</h2>
              {group.items.map((item) => {
                const updateAction = updateChecklistItemAction.bind(
                  null,
                  trip.id,
                  item.id,
                );
                const deleteAction = deleteChecklistItemAction.bind(
                  null,
                  trip.id,
                  item.id,
                );

                return (
                  <article
                    className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm"
                    key={item.id}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold">{item.title}</h3>
                          <span className={statusClassName(item.status)}>
                            {getChecklistStatusLabel(item.status)}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-[#5d6972]">
                          数量 {item.quantity} · 重要性 {getPriorityLabel(item.importance)}
                          {item.dueDate
                            ? ` · 截止 ${toDateInputValue(item.dueDate)}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {CHECKLIST_STATUS_OPTIONS.map((status) => {
                          const action = updateChecklistStatusAction.bind(
                            null,
                            trip.id,
                            item.id,
                            status.value,
                          );

                          return (
                            <form action={action} key={status.value}>
                              <SubmitButton
                                className={[
                                  "rounded-md border px-3 py-2 text-xs font-semibold transition",
                                  item.status === status.value
                                    ? "border-[#2f6f73] bg-[#edf4f1] text-[#2f6f73]"
                                    : "border-[#cfd7d2] text-[#34434c] hover:border-[#2f6f73]",
                                ].join(" ")}
                                pendingLabel="更新中..."
                              >
                                {status.label}
                              </SubmitButton>
                            </form>
                          );
                        })}
                      </div>
                    </div>

                    {item.notes ? (
                      <p className="mt-4 rounded-md bg-[#fbfaf7] p-3 text-sm leading-6 text-[#5d6972]">
                        {item.notes}
                      </p>
                    ) : null}

                    <details className="mt-4">
                      <summary className="cursor-pointer text-sm font-semibold text-[#2f6f73]">
                        编辑清单项
                      </summary>
                      <div className="mt-4 border-t border-[#e0d9cc] pt-4">
                        <ChecklistForm
                          action={updateAction}
                          item={item}
                          submitLabel="保存清单项"
                        />
                      </div>
                    </details>

                    <form action={deleteAction} className="mt-4">
                      <ConfirmSubmitButton
                        className={dangerButtonClassName}
                        message={`确定删除清单项“${item.title}”吗？`}
                      >
                        删除清单项
                      </ConfirmSubmitButton>
                    </form>
                  </article>
                );
              })}
            </div>
          ))
        )}
      </section>
    </section>
  );
}

function ChecklistForm({
  action,
  item,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  item?: {
    category: string;
    title: string;
    quantity: number;
    importance: Priority;
    dueDate: Date | null;
    status: ChecklistStatus;
    notes: string | null;
  };
  submitLabel: string;
}) {
  return (
    <form action={action} className="mt-4 grid gap-4 md:grid-cols-2">
      <Field label="分类">
        <select className={inputClassName} defaultValue={item?.category ?? "其他"} name="category">
          {CHECKLIST_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </Field>
      <Field label="清单项" required>
        <input className={inputClassName} defaultValue={item?.title} name="title" required />
      </Field>
      <Field label="数量">
        <input className={inputClassName} defaultValue={item?.quantity ?? 1} min="1" name="quantity" type="number" />
      </Field>
      <Field label="重要性">
        <select className={inputClassName} defaultValue={item?.importance ?? "MEDIUM"} name="importance">
          {PRIORITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="截止日期">
        <input className={inputClassName} defaultValue={toDateInputValue(item?.dueDate)} name="dueDate" type="date" />
      </Field>
      <Field label="状态">
        <select className={inputClassName} defaultValue={item?.status ?? "TODO"} name="status">
          {CHECKLIST_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
      <Field className="md:col-span-2" label="备注">
        <textarea className={`${inputClassName} min-h-24 resize-y`} defaultValue={item?.notes ?? ""} name="notes" />
      </Field>
      <div className="md:col-span-2">
        <SubmitButton className={primaryButtonClassName}>
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}

function Field({
  children,
  className,
  label,
  required,
}: {
  children: React.ReactNode;
  className?: string;
  label: string;
  required?: boolean;
}) {
  return (
    <label className={className}>
      <span className="text-sm font-medium text-[#34434c]">
        {label}
        {required ? <span className="text-[#9b2f1f]"> *</span> : null}
      </span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function statusClassName(status: ChecklistStatus) {
  if (status === "DONE") {
    return "rounded-full bg-[#e8f6ef] px-2.5 py-1 text-xs font-medium text-[#276044]";
  }

  if (status === "SKIPPED") {
    return "rounded-full bg-[#eceff3] px-2.5 py-1 text-xs font-medium text-[#4d5964]";
  }

  return "rounded-full bg-[#fff7d6] px-2.5 py-1 text-xs font-medium text-[#6d5412]";
}

const inputClassName =
  "w-full rounded-md border border-[#cfd7d2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#2f6f73] focus:ring-2 focus:ring-[#2f6f73]/20";

const primaryButtonClassName =
  "rounded-md bg-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#285f62]";

const secondaryButtonClassName =
  "rounded-md border border-[#2f6f73] px-4 py-2 text-sm font-semibold text-[#2f6f73] transition hover:bg-[#edf4f1]";

const dangerButtonClassName =
  "rounded-md border border-[#d46a55] px-3 py-2 text-sm font-semibold text-[#9b2f1f] transition hover:bg-[#fff2ee]";
