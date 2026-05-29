import type { Prisma } from "@prisma/client";
import { notFound } from "next/navigation";

import { SubmitButton } from "@/components/submit-button";
import { formatDisplayDate } from "@/lib/display-format";
import { prisma } from "@/lib/prisma";
import { formatTags } from "@/lib/trip-management";

import {
  createNoteAction,
  deleteNoteAction,
  updateNoteAction,
} from "../actions";
import { ConfirmSubmitButton } from "../confirm-submit-button";
import { Notice, TripModuleNav } from "../module-nav";

type NotesPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string; message?: string }>;
};

export default async function NotesPage({
  params,
  searchParams,
}: NotesPageProps) {
  const { id } = await params;
  const notice = (await searchParams) ?? {};
  const trip = await prisma.trip.findUnique({
    where: { id },
    include: {
      notes: { orderBy: { updatedAt: "desc" } },
    },
  });

  if (!trip) {
    notFound();
  }

  const createAction = createNoteAction.bind(null, trip.id);

  return (
    <section className="space-y-6">
      <TripModuleNav active="notes" tripId={trip.id} tripTitle={trip.title} />
      <Notice error={notice.error} message={notice.message} />

      <div>
        <p className="text-sm font-semibold text-[#2f6f73]">攻略笔记</p>
        <h1 className="mt-2 text-3xl font-semibold">攻略笔记</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5d6972]">
          用 textarea 记录攻略摘录、个人判断和链接来源，并用标签保持可检索。
        </p>
      </div>

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">新增笔记</h2>
        <NoteForm action={createAction} submitLabel="新增笔记" />
      </section>

      <section className="space-y-4">
        {trip.notes.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#b8c8c4] bg-white p-8 text-center">
            <h2 className="text-xl font-semibold">暂无笔记</h2>
            <p className="mt-3 text-sm text-[#5d6972]">
              可以先保存攻略链接、提醒事项和临时想法。
            </p>
          </div>
        ) : (
          trip.notes.map((note) => {
            const updateAction = updateNoteAction.bind(null, trip.id, note.id);
            const deleteAction = deleteNoteAction.bind(null, trip.id, note.id);
            const tags = formatTags(note.tags);

            return (
              <article
                className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm"
                key={note.id}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">{note.title}</h2>
                    <p className="mt-1 text-xs text-[#7a858c]">
                      更新于 {formatDisplayDate(note.updatedAt)}
                    </p>
                  </div>
                  {note.sourceUrl ? (
                    <a
                      className="text-sm font-medium text-[#2f6f73]"
                      href={note.sourceUrl}
                    >
                      来源链接
                    </a>
                  ) : null}
                </div>

                {tags ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {tags.split(", ").map((tag) => (
                      <span
                        className="rounded-full bg-[#f1e8f5] px-2.5 py-1 text-xs text-[#6a4078]"
                        key={tag}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}

                <p className="mt-4 whitespace-pre-wrap rounded-md bg-[#fbfaf7] p-4 text-sm leading-6 text-[#34434c]">
                  {note.content}
                </p>

                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-semibold text-[#2f6f73]">
                    编辑笔记
                  </summary>
                  <div className="mt-4 border-t border-[#e0d9cc] pt-4">
                    <NoteForm
                      action={updateAction}
                      note={note}
                      submitLabel="保存笔记"
                    />
                  </div>
                </details>

                <form action={deleteAction} className="mt-4">
                  <ConfirmSubmitButton
                    className={dangerButtonClassName}
                    message={`确定删除笔记“${note.title}”吗？`}
                  >
                    删除笔记
                  </ConfirmSubmitButton>
                </form>
              </article>
            );
          })
        )}
      </section>
    </section>
  );
}

function NoteForm({
  action,
  note,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  note?: {
    title: string;
    content: string;
    sourceUrl: string | null;
    tags: Prisma.JsonValue | null;
  };
  submitLabel: string;
}) {
  return (
    <form action={action} className="mt-4 grid gap-4">
      <Field label="标题" required>
        <input className={inputClassName} defaultValue={note?.title} name="title" required />
      </Field>
      <Field label="内容" required>
        <textarea className={`${inputClassName} min-h-40 resize-y`} defaultValue={note?.content} name="content" required />
      </Field>
      <Field label="来源链接">
        <input className={inputClassName} defaultValue={note?.sourceUrl ?? ""} name="sourceUrl" placeholder="https://..." type="url" />
      </Field>
      <Field label="标签">
        <input className={inputClassName} defaultValue={formatTags(note?.tags)} name="tags" placeholder="交通, 美食, 亲子" />
      </Field>
      <div>
        <SubmitButton className={primaryButtonClassName}>
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}

function Field({
  children,
  label,
  required,
}: {
  children: React.ReactNode;
  label: string;
  required?: boolean;
}) {
  return (
    <label>
      <span className="text-sm font-medium text-[#34434c]">
        {label}
        {required ? <span className="text-[#9b2f1f]"> *</span> : null}
      </span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

const inputClassName =
  "w-full rounded-md border border-[#cfd7d2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#2f6f73] focus:ring-2 focus:ring-[#2f6f73]/20";

const primaryButtonClassName =
  "rounded-md bg-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#285f62]";

const dangerButtonClassName =
  "rounded-md border border-[#d46a55] px-3 py-2 text-sm font-semibold text-[#9b2f1f] transition hover:bg-[#fff2ee]";
