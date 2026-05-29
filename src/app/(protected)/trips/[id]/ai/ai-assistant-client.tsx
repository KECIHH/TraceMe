"use client";

import { useActionState, useMemo, useState } from "react";

import type {
  AiDraftActionState,
  SaveAiNoteActionState,
} from "./actions";

type AiTaskOption = {
  fields: Array<{
    key: string;
    label: string;
    placeholder?: string;
    type?: "date" | "number" | "text" | "textarea";
  }>;
  id: string;
  label: string;
  outputSections: string[];
  placeholder: string;
};

type AiAssistantClientProps = {
  configured: boolean;
  disabledReason?: string;
  generateAction: (
    previousState: AiDraftActionState,
    formData: FormData,
  ) => Promise<AiDraftActionState>;
  saveNoteAction: (
    previousState: SaveAiNoteActionState,
    formData: FormData,
  ) => Promise<SaveAiNoteActionState>;
  tasks: AiTaskOption[];
};

const inputClassName =
  "w-full rounded-md border border-[#cfd7d2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#2f6f73] focus:ring-2 focus:ring-[#2f6f73]/20";

const primaryButtonClassName =
  "rounded-md bg-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#285f62] disabled:cursor-not-allowed disabled:opacity-60";

const secondaryButtonClassName =
  "rounded-md border border-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-[#2f6f73] transition hover:bg-[#edf4f1] disabled:cursor-not-allowed disabled:opacity-50";

export function AiAssistantClient({
  configured,
  disabledReason,
  generateAction,
  saveNoteAction,
  tasks,
}: AiAssistantClientProps) {
  const [selectedTaskId, setSelectedTaskId] = useState(tasks[0]?.id ?? "");
  const [copyMessage, setCopyMessage] = useState("");
  const [draftState, submitDraft, isGenerating] = useActionState(
    generateAction,
    {},
  );
  const [saveState, submitSave, isSaving] = useActionState(saveNoteAction, {});
  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? tasks[0],
    [selectedTaskId, tasks],
  );
  const activeTask = draftState.taskType
    ? tasks.find((task) => task.id === draftState.taskType)
    : selectedTask;
  const result = draftState.result ?? "";

  async function copyResult() {
    if (!result) {
      return;
    }

    await navigator.clipboard.writeText(result);
    setCopyMessage("已复制到剪贴板。");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">生成 AI 草稿</h2>
        <p className="mt-2 text-sm leading-6 text-[#5d6972]">
          输入目的地、天数、偏好和预算等非敏感信息。不要输入身份证、护照、手机号、订单号、保险单号或同行人隐私。
        </p>

        {configured ? null : (
          <p className="mt-4 rounded-md border border-[#f0d39b] bg-[#fff9e8] px-4 py-3 text-sm text-[#73530f]">
            {disabledReason ?? "未配置 AI 服务"}
          </p>
        )}

        <form action={submitDraft} className="mt-5 grid gap-4">
          <label>
            <span className="text-sm font-medium text-[#34434c]">任务类型</span>
            <select
              className={`${inputClassName} mt-2`}
              disabled={!configured || isGenerating}
              name="taskType"
              onChange={(event) => setSelectedTaskId(event.target.value)}
              value={selectedTaskId}
            >
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.label}
                </option>
              ))}
            </select>
          </label>

          {selectedTask ? (
            <div className="rounded-md border border-[#e0d9cc] bg-[#fbfaf7] p-4">
              <p className="text-sm font-semibold text-[#34434c]">建议输入</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedTask.fields.map((field) => (
                  <span
                    className="rounded-full bg-white px-2.5 py-1 text-xs text-[#5d6972]"
                    key={field.key}
                  >
                    {field.label}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {selectedTask ? (
            <div className="grid gap-4 md:grid-cols-2">
              {selectedTask.fields.map((field) => (
                <TaskFieldInput
                  disabled={!configured || isGenerating}
                  field={field}
                  key={field.key}
                />
              ))}
            </div>
          ) : null}

          <label>
            <span className="text-sm font-medium text-[#34434c]">
              补充需求（可选）
            </span>
            <textarea
              className={`${inputClassName} mt-2 min-h-28 resize-y`}
              disabled={!configured || isGenerating}
              name="additionalPrompt"
              placeholder={selectedTask?.placeholder ?? "请输入旅行需求。"}
            />
          </label>

          {draftState.error ? (
            <p className="rounded-md border border-[#f1b8aa] bg-[#fff2ee] px-4 py-3 text-sm text-[#9b2f1f]">
              {draftState.error}
            </p>
          ) : null}

          <div>
            <button
              className={primaryButtonClassName}
              disabled={!configured || isGenerating}
              type="submit"
            >
              {isGenerating ? "生成中..." : "生成草稿"}
            </button>
          </div>
        </form>
      </section>

      <aside className="space-y-4">
        <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">输出结构</h2>
          <ul className="mt-3 space-y-2 text-sm text-[#5d6972]">
            {(selectedTask?.outputSections ?? []).map((section) => (
              <li key={section}>- {section}</li>
            ))}
          </ul>
        </section>
        <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">安全边界</h2>
          <p className="mt-3 text-sm leading-6 text-[#5d6972]">
            AI 不会自动读取文件票据内容。Prompt 记录只保存任务类型和脱敏摘要，完整原文不会写入 AiConversation。
          </p>
        </section>
      </aside>

      <section className="lg:col-span-2">
        {result ? (
          <article className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-[#2f6f73]">
                  {activeTask?.label ?? "AI 草稿"}
                </p>
                <h2 className="mt-1 text-2xl font-semibold">生成结果</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className={secondaryButtonClassName}
                  onClick={copyResult}
                  type="button"
                >
                  复制
                </button>
                <form action={submitSave}>
                  <input
                    name="conversationId"
                    type="hidden"
                    value={draftState.conversationId}
                  />
                  <input
                    name="signature"
                    type="hidden"
                    value={draftState.resultSignature}
                  />
                  <input name="taskType" type="hidden" value={draftState.taskType} />
                  <textarea
                    className="hidden"
                    name="content"
                    readOnly
                    value={result}
                  />
                  <button
                    className={primaryButtonClassName}
                    disabled={isSaving}
                    type="submit"
                  >
                    {isSaving ? "保存中..." : "保存为笔记"}
                  </button>
                </form>
              </div>
            </div>

            {copyMessage ? (
              <p className="mt-3 rounded-md border border-[#b8d8ca] bg-[#f0faf5] px-4 py-3 text-sm text-[#276044]">
                {copyMessage}
              </p>
            ) : null}
            {saveState.error ? (
              <p className="mt-3 rounded-md border border-[#f1b8aa] bg-[#fff2ee] px-4 py-3 text-sm text-[#9b2f1f]">
                {saveState.error}
              </p>
            ) : null}
            {saveState.message ? (
              <p className="mt-3 rounded-md border border-[#b8d8ca] bg-[#f0faf5] px-4 py-3 text-sm text-[#276044]">
                {saveState.message}
              </p>
            ) : null}

            <pre className="mt-4 max-h-[560px] overflow-auto whitespace-pre-wrap rounded-md bg-[#fbfaf7] p-4 text-sm leading-6 text-[#34434c]">
              {result}
            </pre>
          </article>
        ) : (
          <div className="rounded-lg border border-dashed border-[#b8c8c4] bg-white p-8 text-center">
            <h2 className="text-xl font-semibold">还没有生成结果</h2>
            <p className="mt-3 text-sm text-[#5d6972]">
              选择任务类型并输入需求后，AI 草稿会显示在这里。
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function TaskFieldInput({
  disabled,
  field,
}: {
  disabled: boolean;
  field: AiTaskOption["fields"][number];
}) {
  const fieldName = `field-${field.key}`;

  return (
    <label className={field.type === "textarea" ? "md:col-span-2" : undefined}>
      <span className="text-sm font-medium text-[#34434c]">{field.label}</span>
      <div className="mt-2">
        {field.type === "textarea" ? (
          <textarea
            className={`${inputClassName} min-h-24 resize-y`}
            disabled={disabled}
            name={fieldName}
            placeholder={field.placeholder}
          />
        ) : (
          <input
            className={inputClassName}
            disabled={disabled}
            name={fieldName}
            placeholder={field.placeholder}
            type={field.type ?? "text"}
          />
        )}
      </div>
    </label>
  );
}
