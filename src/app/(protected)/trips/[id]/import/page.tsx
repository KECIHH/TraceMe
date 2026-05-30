import type { Prisma } from "@prisma/client";
import { notFound } from "next/navigation";

import { SubmitButton } from "@/components/submit-button";
import {
  CONFLICT_STRATEGIES,
  getImportTypeLabel,
  IMPORT_FILE_SIZE_LIMIT_BYTES,
  IMPORT_TYPES,
  type ConflictStrategy,
  type ImportPreview,
  type ImportPreviewItem,
  type ImportValidationReport,
  isImportPreview,
  type NoteImportData,
} from "@/lib/imports";
import { prisma } from "@/lib/prisma";

import { Notice, TripModuleNav } from "../module-nav";
import { confirmImportJobAction, createImportJobAction } from "./actions";

type ImportPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    error?: string;
    jobId?: string;
    message?: string;
  }>;
};

type ImportJobView = {
  id: string;
  type: string;
  fileName: string;
  fileSize: number;
  status: string;
  conflictStrategy: string | null;
  previewJson: Prisma.JsonValue;
  validationJson: Prisma.JsonValue;
  resultJson: Prisma.JsonValue | null;
  errorMessage: string | null;
  createdAt: Date;
};

export default async function ImportPage({
  params,
  searchParams,
}: ImportPageProps) {
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const trip = await prisma.trip.findUnique({
    where: { id },
    include: {
      importJobs: {
        orderBy: { createdAt: "desc" },
        take: 8,
      },
    },
  });

  if (!trip) {
    notFound();
  }

  const selectedJob =
    (query.jobId
      ? trip.importJobs.find((job) => job.id === query.jobId)
      : trip.importJobs[0]) ?? null;
  const uploadAction = createImportJobAction.bind(null, trip.id);
  const selectedPreview = selectedJob && isImportPreview(selectedJob.previewJson)
    ? selectedJob.previewJson
    : null;
  const selectedValidation = parseValidationReport(selectedJob?.validationJson);

  return (
    <section className="space-y-6">
      <TripModuleNav active="import" tripId={trip.id} tripTitle={trip.title} />
      <Notice error={query.error} message={query.message} />

      <div>
        <p className="text-sm font-semibold text-[#2f6f73]">数据导入与互操作</p>
        <h1 className="mt-2 text-3xl font-semibold">导入旅行数据</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5d6972]">
          上传后只会解析、校验和生成预览；确认导入前不会写入地点、支出、清单或笔记数据。
        </p>
      </div>

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">上传文件</h2>
            <p className="mt-2 text-sm leading-6 text-[#5d6972]">
              支持本系统 JSON、地点 CSV、支出 CSV、准备清单 CSV、Markdown 笔记，也可导入 GPX/KML 路线和浏览器书签 HTML。
            </p>
          </div>
          <span className="w-fit rounded-full bg-[#edf4f1] px-2.5 py-1 text-xs font-medium text-[#2f6f73]">
            最大 {formatFileSize(IMPORT_FILE_SIZE_LIMIT_BYTES)}
          </span>
        </div>
        <form
          action={uploadAction}
          className="mt-4 grid gap-4 md:grid-cols-[220px_1fr_auto]"
        >
          <label>
            <span className={labelClassName}>导入类型</span>
            <select className={inputClassName} name="importType">
              {IMPORT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {getImportTypeLabel(type)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelClassName}>文件</span>
            <input
              accept=".json,.csv,.md,.markdown,.txt,.gpx,.kml,.html,.htm"
              className={inputClassName}
              name="file"
              required
              type="file"
            />
          </label>
          <div className="flex items-end">
            <SubmitButton className={primaryButtonClassName} pendingLabel="解析中...">
              上传并解析
            </SubmitButton>
          </div>
        </form>
      </section>

      {selectedJob ? (
        <ImportJobDetail
          job={selectedJob}
          preview={selectedPreview}
          tripId={trip.id}
          validation={selectedValidation}
        />
      ) : (
        <section className="rounded-lg border border-dashed border-[#b8c8c4] bg-white p-8 text-center">
          <h2 className="text-xl font-semibold">还没有导入作业</h2>
          <p className="mt-3 text-sm text-[#5d6972]">
            先上传文件，系统会生成预览、冲突提示和导入报告。
          </p>
        </section>
      )}

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">最近导入</h2>
        <div className="mt-4 space-y-3">
          {trip.importJobs.length === 0 ? (
            <p className="text-sm text-[#5d6972]">暂无导入记录。</p>
          ) : (
            trip.importJobs.map((job) => (
              <a
                className="block rounded-md border border-[#e0d9cc] bg-[#fbfaf7] p-3 text-sm transition hover:border-[#2f6f73]"
                href={`/trips/${trip.id}/import?jobId=${job.id}`}
                key={job.id}
              >
                <span className="font-semibold text-[#34434c]">{job.fileName}</span>
                <span className="ml-2 text-[#5d6972]">
                  {getJobTypeLabel(job.type)} / {getStatusLabel(job.status)} /{" "}
                  {formatDateTime(job.createdAt)}
                </span>
              </a>
            ))
          )}
        </div>
      </section>
    </section>
  );
}

function ImportJobDetail({
  job,
  preview,
  tripId,
  validation,
}: {
  job: ImportJobView;
  preview: ImportPreview | null;
  tripId: string;
  validation: ImportValidationReport | null;
}) {
  const confirmAction = confirmImportJobAction.bind(null, tripId, job.id);
  const canConfirm = preview && preview.errors.length === 0 && job.status !== "completed";
  const result = parseImportResult(job.resultJson);

  return (
    <section className="space-y-6">
      <div className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">导入预览</h2>
            <p className="mt-2 text-sm text-[#5d6972]">
              {job.fileName} / {getJobTypeLabel(job.type)} / {formatFileSize(job.fileSize)}
            </p>
          </div>
          <span className={statusClassName(job.status)}>
            {getStatusLabel(job.status)}
          </span>
        </div>

        {validation ? <ValidationReport validation={validation} /> : null}

        {preview ? (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              <SummaryCard label="总行数" value={String(preview.summary.totalRows)} />
              <SummaryCard label="可导入" value={String(preview.summary.validRows)} />
              <SummaryCard label="冲突" value={String(preview.summary.conflictRows)} />
              <SummaryCard label="错误" value={String(preview.summary.invalidRows)} />
            </div>

            {preview.errors.length > 0 ? (
              <ErrorList errors={preview.errors} title="解析错误" />
            ) : null}

            {preview.warnings.length > 0 ? (
              <WarningList warnings={preview.warnings} />
            ) : null}

            <PreviewTable items={preview.items} />

            <form action={confirmAction} className="mt-6 rounded-md border border-[#e0d9cc] bg-[#fbfaf7] p-4">
              <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
                <label>
                  <span className={labelClassName}>冲突处理</span>
                  <select
                    className={inputClassName}
                    defaultValue="skip"
                    name="conflictStrategy"
                  >
                    {CONFLICT_STRATEGIES.map((strategy) => (
                      <option key={strategy} value={strategy}>
                        {getConflictStrategyLabel(strategy)}
                      </option>
                    ))}
                  </select>
                </label>
                <div>
                  <p className="text-sm font-medium text-[#34434c]">手动选择</p>
                  <p className="mt-2 text-sm leading-6 text-[#5d6972]">
                    当冲突处理选择“手动选择”时，下方每条冲突数据的选择才会生效。
                  </p>
                </div>
              </div>

              {preview.items.some((item) => item.status === "conflict") ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {preview.items
                    .filter((item) => item.status === "conflict")
                    .map((item) => (
                      <label
                        className="rounded-md border border-[#d8d2c6] bg-white p-3"
                        key={item.index}
                      >
                        <span className="block text-sm font-medium text-[#34434c]">
                          {item.label}
                        </span>
                        <select
                          className={`${inputClassName} mt-2`}
                          defaultValue="skip"
                          name={`manualAction-${item.index}`}
                        >
                          <option value="skip">跳过重复</option>
                          <option value="overwrite">覆盖已有</option>
                          <option value="duplicate">创建副本</option>
                        </select>
                      </label>
                    ))}
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <SubmitButton
                  className={primaryButtonClassName}
                  disabled={!canConfirm}
                  pendingLabel="写入中..."
                >
                  确认导入并写入数据库
                </SubmitButton>
                <span className="text-sm text-[#5d6972]">
                  确认时使用事务写入，失败会整体回滚。
                </span>
              </div>
            </form>
          </>
        ) : (
          <p className="mt-4 rounded-md border border-[#f1b8aa] bg-[#fff2ee] p-3 text-sm text-[#9b2f1f]">
            预览数据无法读取，请重新上传文件。
          </p>
        )}
      </div>

      {job.errorMessage || result ? (
        <div className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">导入结果报告</h2>
          {job.errorMessage ? (
            <p className="mt-3 rounded-md border border-[#f1b8aa] bg-[#fff2ee] p-3 text-sm text-[#9b2f1f]">
              {job.errorMessage}
            </p>
          ) : null}
          {result ? (
            <dl className="mt-4 grid gap-3 sm:grid-cols-4">
              <SummaryCard label="新增" value={String(result.created)} />
              <SummaryCard label="覆盖" value={String(result.overwritten)} />
              <SummaryCard label="跳过" value={String(result.skipped)} />
              <SummaryCard label="失败" value={String(result.failed)} />
            </dl>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ValidationReport({
  validation,
}: {
  validation: ImportValidationReport;
}) {
  return (
    <div className="mt-5 rounded-md border border-[#e0d9cc] bg-[#fbfaf7] p-4">
      <h3 className="font-semibold">导入流程检查</h3>
      <ol className="mt-3 grid gap-2 md:grid-cols-2">
        {validation.steps.map((step) => (
          <li className="text-sm" key={step.name}>
            <span className={step.ok ? "text-[#276044]" : "text-[#9b2f1f]"}>
              {step.ok ? "通过" : "需处理"}
            </span>
            <span className="ml-2 font-medium text-[#34434c]">
              {getStepLabel(step.name)}
            </span>
            <span className="mt-1 block text-[#5d6972]">{step.message}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function PreviewTable({ items }: { items: ImportPreviewItem[] }) {
  return (
    <div className="mt-5 overflow-x-auto rounded-md border border-[#e0d9cc]">
      <table className="min-w-full divide-y divide-[#e0d9cc] text-sm">
        <thead className="bg-[#fbfaf7] text-left text-xs uppercase tracking-wide text-[#66737b]">
          <tr>
            <th className="px-3 py-2">状态</th>
            <th className="px-3 py-2">类型</th>
            <th className="px-3 py-2">内容</th>
            <th className="px-3 py-2">问题</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#e0d9cc] bg-white">
          {items.map((item) => (
            <tr data-testid="import-preview-row" key={item.index}>
              <td className="px-3 py-3 align-top">
                <span className={itemStatusClassName(item.status)}>
                  {getItemStatusLabel(item.status)}
                </span>
              </td>
              <td className="px-3 py-3 align-top text-[#34434c]">
                {getEntityLabel(item.entity)}
                {item.sourceRow ? (
                  <span className="block text-xs text-[#7a858c]">
                    第 {item.sourceRow} 行
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-3 align-top">
                <span className="font-medium text-[#172026]">{item.label}</span>
                <span className="mt-1 line-clamp-2 block max-w-xl text-xs text-[#5d6972]">
                  {getItemPreviewText(item)}
                </span>
              </td>
              <td className="px-3 py-3 align-top text-[#5d6972]">
                {item.conflict ? (
                  <span className="block text-[#9b6a1f]">
                    与 {item.conflict.existingLabel ?? "已有数据"} 冲突
                  </span>
                ) : null}
                {item.errors.map((error) => (
                  <span className="block text-[#9b2f1f]" key={error}>
                    {error}
                  </span>
                ))}
                {item.errors.length === 0 && !item.conflict ? "无" : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#e0d9cc] bg-white p-3">
      <dt className="text-xs text-[#66737b]">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-[#172026]">{value}</dd>
    </div>
  );
}

function ErrorList({ errors, title }: { errors: string[]; title: string }) {
  return (
    <div className="mt-4 rounded-md border border-[#f1b8aa] bg-[#fff2ee] p-3 text-sm text-[#9b2f1f]">
      <p className="font-semibold">{title}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {errors.map((error) => (
          <li key={error}>{error}</li>
        ))}
      </ul>
    </div>
  );
}

function WarningList({ warnings }: { warnings: string[] }) {
  return (
    <div className="mt-4 rounded-md border border-[#ead0a7] bg-[#fff8ec] p-3 text-sm text-[#70430f]">
      <p className="font-semibold">提示</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </div>
  );
}

function parseValidationReport(value: Prisma.JsonValue | undefined): ImportValidationReport | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Partial<ImportValidationReport>;

  if (!Array.isArray(candidate.steps)) {
    return null;
  }

  return candidate as ImportValidationReport;
}

function parseImportResult(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as {
    created: number;
    failed: number;
    overwritten: number;
    skipped: number;
  };
}

function getItemPreviewText(item: ImportPreviewItem): string {
  if (item.entity === "note") {
    const note = item.data as NoteImportData;
    return note.content.slice(0, 160);
  }

  return JSON.stringify(item.data);
}

function getJobTypeLabel(type: string): string {
  return IMPORT_TYPES.includes(type as never)
    ? getImportTypeLabel(type as never)
    : type;
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    completed: "已完成",
    failed: "失败",
    parsed: "已解析",
  };

  return labels[status] ?? status;
}

function getConflictStrategyLabel(strategy: ConflictStrategy): string {
  const labels: Record<ConflictStrategy, string> = {
    duplicate: "创建副本",
    manual: "手动选择",
    overwrite: "覆盖已有",
    skip: "跳过重复",
  };

  return labels[strategy];
}

function getStepLabel(step: string): string {
  const labels: Record<string, string> = {
    conflicts: "冲突检测",
    parse: "解析",
    preview: "预览",
    upload: "上传",
    validate: "校验",
  };

  return labels[step] ?? step;
}

function getEntityLabel(entity: string): string {
  const labels: Record<string, string> = {
    checklistItem: "准备清单",
    destination: "目的地",
    expense: "支出",
    note: "笔记",
    place: "地点",
    routePlan: "路线",
  };

  return labels[entity] ?? entity;
}

function getItemStatusLabel(status: ImportPreviewItem["status"]): string {
  const labels: Record<ImportPreviewItem["status"], string> = {
    conflict: "冲突",
    invalid: "错误",
    new: "新增",
  };

  return labels[status];
}

function statusClassName(status: string): string {
  if (status === "completed") {
    return "w-fit rounded-full bg-[#e8f6ef] px-2.5 py-1 text-xs font-medium text-[#276044]";
  }

  if (status === "failed") {
    return "w-fit rounded-full bg-[#fff2ee] px-2.5 py-1 text-xs font-medium text-[#9b2f1f]";
  }

  return "w-fit rounded-full bg-[#fff7d6] px-2.5 py-1 text-xs font-medium text-[#6d5412]";
}

function itemStatusClassName(status: ImportPreviewItem["status"]): string {
  if (status === "new") {
    return "rounded-full bg-[#e8f6ef] px-2.5 py-1 text-xs font-medium text-[#276044]";
  }

  if (status === "conflict") {
    return "rounded-full bg-[#fff7d6] px-2.5 py-1 text-xs font-medium text-[#6d5412]";
  }

  return "rounded-full bg-[#fff2ee] px-2.5 py-1 text-xs font-medium text-[#9b2f1f]";
}

function formatFileSize(value: number): string {
  if (value >= 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }

  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${value} B`;
}

function formatDateTime(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

const labelClassName = "mb-2 block text-sm font-medium text-[#34434c]";

const inputClassName =
  "w-full rounded-md border border-[#cfd7d2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#2f6f73] focus:ring-2 focus:ring-[#2f6f73]/20";

const primaryButtonClassName =
  "rounded-md bg-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#285f62] disabled:cursor-not-allowed disabled:bg-[#9fb9b7]";
