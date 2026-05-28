import { access } from "node:fs/promises";

import type { Document, DocumentType, Prisma } from "@prisma/client";
import { notFound } from "next/navigation";

import {
  DOCUMENT_TYPE_OPTIONS,
  formatFileSize,
  getAllowedDocumentFileDescription,
  getDocumentAcceptAttribute,
  getDocumentTypeLabel,
  getMaxDocumentFileSizeBytes,
  isDocumentType,
  resolveUploadPath,
} from "@/lib/documents";
import { prisma } from "@/lib/prisma";
import { toDateInputValue } from "@/lib/trip-management";

import { ConfirmSubmitButton } from "../confirm-submit-button";
import { Notice, TripModuleNav } from "../module-nav";
import {
  deleteDocumentAction,
  updateDocumentAction,
  uploadDocumentAction,
} from "./actions";
import { DocumentDownloadLink } from "./document-download-link";

type DocumentsPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    error?: string;
    message?: string;
    sensitive?: string;
    type?: string;
  }>;
};

type DocumentWithStatus = Document & {
  fileMissing: boolean;
};

export default async function DocumentsPage({
  params,
  searchParams,
}: DocumentsPageProps) {
  const { id } = await params;
  const notice = (await searchParams) ?? {};
  const requestedType = notice.type ?? "";
  const typeFilter: DocumentType | "" = isDocumentType(requestedType)
    ? requestedType
    : "";
  const sensitiveFilter =
    notice.sensitive === "true" || notice.sensitive === "false"
      ? notice.sensitive
      : "";

  const documentWhere: Prisma.DocumentWhereInput = {
    ...(typeFilter ? { type: typeFilter } : {}),
    ...(sensitiveFilter ? { isSensitive: sensitiveFilter === "true" } : {}),
  };

  const trip = await prisma.trip.findUnique({
    where: { id },
    include: {
      documents: {
        orderBy: { createdAt: "desc" },
        where: documentWhere,
      },
    },
  });

  if (!trip) {
    notFound();
  }

  const documents = await Promise.all(
    trip.documents.map(async (document) => ({
      ...document,
      fileMissing: !(await fileExists(document.filePath)),
    })),
  );
  const uploadAction = uploadDocumentAction.bind(null, trip.id);

  return (
    <section className="space-y-6">
      <TripModuleNav active="documents" tripId={trip.id} tripTitle={trip.title} />
      <Notice error={notice.error} message={notice.message} />

      <div>
        <p className="text-sm font-semibold text-[#2f6f73]">Documents</p>
        <h1 className="mt-2 text-3xl font-semibold">文件票据</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5d6972]">
          统一管理机票、酒店订单、保险单、签证文件和付款凭证。文件保存在
          storage/uploads，不放入 public，下载前会再次经过登录鉴权。
        </p>
      </div>

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">上传文件</h2>
        <p className="mt-2 text-sm text-[#5d6972]">
          允许类型：{getAllowedDocumentFileDescription()}；单文件最大：
          {formatFileSize(getMaxDocumentFileSizeBytes())}。
        </p>
        <p className="mt-3 rounded-md border border-[#ead0a7] bg-[#fff8ec] px-4 py-3 text-sm text-[#7a4b12]">
          此文件可能包含证件、订单、保险等隐私信息，请谨慎保存和备份。
        </p>
        <DocumentForm
          action={uploadAction}
          includeFile
          submitLabel="上传文件"
        />
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-lg font-semibold">文件列表</h2>
          <form action={`/trips/${trip.id}/documents`} className="flex flex-wrap gap-3">
            <label className="min-w-40">
              <span className="text-xs font-medium text-[#5d6972]">文件类型</span>
              <select
                className={inputClassName}
                defaultValue={typeFilter}
                name="type"
              >
                <option value="">全部类型</option>
                {DOCUMENT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-36">
              <span className="text-xs font-medium text-[#5d6972]">敏感文件</span>
              <select
                className={inputClassName}
                defaultValue={sensitiveFilter}
                name="sensitive"
              >
                <option value="">全部</option>
                <option value="true">仅敏感</option>
                <option value="false">仅非敏感</option>
              </select>
            </label>
            <button className={secondaryButtonClassName} type="submit">
              筛选
            </button>
          </form>
        </div>

        {documents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#b8c8c4] bg-white p-8 text-center">
            <h2 className="text-xl font-semibold">暂无文件</h2>
            <p className="mt-3 text-sm text-[#5d6972]">
              暂无文件，可上传机票、酒店订单、保险单等。
            </p>
          </div>
        ) : (
          documents.map((document) => (
            <DocumentCard
              document={document}
              key={document.id}
              tripId={trip.id}
            />
          ))
        )}
      </section>
    </section>
  );
}

function DocumentCard({
  document,
  tripId,
}: {
  document: DocumentWithStatus;
  tripId: string;
}) {
  const updateAction = updateDocumentAction.bind(null, tripId, document.id);
  const deleteAction = deleteDocumentAction.bind(null, tripId, document.id);
  const downloadHref = `/api/trips/${tripId}/documents/${document.id}/download`;

  return (
    <article
      className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm"
      data-testid="document-card"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words text-xl font-semibold">{document.title}</h3>
            <span className="rounded-full bg-[#edf4f2] px-2.5 py-1 text-xs font-medium text-[#2f6f73]">
              {getDocumentTypeLabel(document.type)}
            </span>
            {document.isSensitive ? (
              <span className="rounded-full bg-[#fff2ee] px-2.5 py-1 text-xs font-semibold text-[#9b2f1f]">
                敏感文件
              </span>
            ) : null}
            {document.fileMissing ? (
              <span className="rounded-full bg-[#f5eee4] px-2.5 py-1 text-xs font-semibold text-[#8a5418]">
                文件缺失
              </span>
            ) : null}
          </div>

          <dl className="grid gap-2 text-sm text-[#5d6972] sm:grid-cols-2 lg:grid-cols-3">
            <Info label="原始文件名" value={document.originalFileName ?? "未记录"} />
            <Info label="文件大小" value={formatFileSize(document.fileSize)} />
            <Info label="关联日期" value={formatDate(document.relatedDate)} />
            <Info label="上传时间" value={formatDateTime(document.createdAt)} />
            <Info label="MIME type" value={document.mimeType ?? "未记录"} />
            <Info label="存储状态" value={document.fileMissing ? "文件缺失" : "正常"} />
          </dl>

          {document.notes ? (
            <p className="whitespace-pre-wrap rounded-md bg-[#fbfaf7] p-3 text-sm leading-6 text-[#34434c]">
              {document.notes}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {document.fileMissing ? (
            <span className={disabledButtonClassName}>无法下载</span>
          ) : (
            <DocumentDownloadLink
              className={secondaryButtonClassName}
              href={downloadHref}
              isSensitive={document.isSensitive}
            >
              下载
            </DocumentDownloadLink>
          )}
        </div>
      </div>

      {document.isSensitive ? (
        <p className="mt-4 rounded-md border border-[#ead0a7] bg-[#fff8ec] px-4 py-3 text-sm text-[#7a4b12]">
          此文件可能包含证件、订单、保险等隐私信息，请谨慎保存和备份。
        </p>
      ) : null}

      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-semibold text-[#2f6f73]">
          编辑文件信息
        </summary>
        <div className="mt-4 border-t border-[#e0d9cc] pt-4">
          <DocumentForm
            action={updateAction}
            document={document}
            submitLabel="保存文件信息"
          />
        </div>
      </details>

      <form action={deleteAction} className="mt-4">
        <ConfirmSubmitButton
          className={dangerButtonClassName}
          message={`确定删除文件“${document.title}”吗？数据库记录和磁盘文件都会删除。`}
        >
          删除文件
        </ConfirmSubmitButton>
      </form>
    </article>
  );
}

function DocumentForm({
  action,
  document,
  includeFile = false,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  document?: Document;
  includeFile?: boolean;
  submitLabel: string;
}) {
  return (
    <form action={action} className="mt-4 grid gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="文件标题" required>
          <input
            className={inputClassName}
            defaultValue={document?.title}
            name="title"
            required
          />
        </Field>
        <Field label="文件类型" required>
          <select
            className={inputClassName}
            defaultValue={document?.type ?? "FLIGHT_TICKET"}
            name="type"
            required
          >
            {DOCUMENT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="关联日期">
          <input
            className={inputClassName}
            defaultValue={toDateInputValue(document?.relatedDate)}
            name="relatedDate"
            type="date"
          />
        </Field>
        {includeFile ? (
          <Field label="上传文件" required>
            <input
              accept={getDocumentAcceptAttribute()}
              className={inputClassName}
              name="file"
              required
              type="file"
            />
          </Field>
        ) : null}
      </div>

      <Field label="备注">
        <textarea
          className={`${inputClassName} min-h-24 resize-y`}
          defaultValue={document?.notes ?? ""}
          name="notes"
        />
      </Field>

      <label className="flex items-center gap-2 text-sm font-medium text-[#34434c]">
        <input
          className="size-4 accent-[#2f6f73]"
          defaultChecked={document?.isSensitive ?? false}
          name="isSensitive"
          type="checkbox"
        />
        敏感文件
      </label>

      <div>
        <button className={primaryButtonClassName} type="submit">
          {submitLabel}
        </button>
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[#7a858c]">{label}</dt>
      <dd className="mt-1 break-words font-medium text-[#34434c]">{value}</dd>
    </div>
  );
}

async function fileExists(storedFileName: string): Promise<boolean> {
  try {
    await access(resolveUploadPath(storedFileName));
    return true;
  } catch {
    return false;
  }
}

function formatDate(date: Date | null): string {
  return date ? date.toLocaleDateString("zh-CN") : "未设置";
}

function formatDateTime(date: Date): string {
  return date.toLocaleString("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

const inputClassName =
  "w-full rounded-md border border-[#cfd7d2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#2f6f73] focus:ring-2 focus:ring-[#2f6f73]/20";

const primaryButtonClassName =
  "rounded-md bg-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#285f62]";

const secondaryButtonClassName =
  "inline-flex items-center justify-center rounded-md border border-[#2f6f73] px-3 py-2 text-sm font-semibold text-[#2f6f73] transition hover:bg-[#edf4f2]";

const disabledButtonClassName =
  "inline-flex items-center justify-center rounded-md border border-[#cfd7d2] px-3 py-2 text-sm font-semibold text-[#7a858c]";

const dangerButtonClassName =
  "rounded-md border border-[#d46a55] px-3 py-2 text-sm font-semibold text-[#9b2f1f] transition hover:bg-[#fff2ee]";
