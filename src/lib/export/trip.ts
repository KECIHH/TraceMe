import { Prisma } from "@prisma/client";

export const TRIP_EXPORT_INCLUDE = Prisma.validator<Prisma.TripInclude>()({
  checklistItems: { orderBy: [{ category: "asc" }, { createdAt: "asc" }] },
  destinations: { orderBy: [{ arrivalDate: "asc" }, { name: "asc" }] },
  documents: { orderBy: { createdAt: "desc" } },
  expenses: { orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }] },
  itineraryDays: {
    include: {
      items: {
        include: {
          place: { select: { id: true, name: true, address: true, type: true } },
        },
        orderBy: [{ sortOrder: "asc" }, { startTime: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: { date: "asc" },
  },
  itineraryItems: {
    include: {
      place: { select: { id: true, name: true, address: true, type: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { startTime: "asc" }, { createdAt: "asc" }],
  },
  notes: { orderBy: { createdAt: "desc" } },
  places: {
    include: {
      destination: { select: { id: true, name: true } },
      foodDetail: true,
      stayDetail: true,
    },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  },
  routePlans: {
    include: {
      selectedOption: true,
      transportOptions: { orderBy: [{ departTime: "asc" }, { createdAt: "asc" }] },
    },
    orderBy: [{ departDate: "asc" }, { createdAt: "asc" }],
  },
  transports: { orderBy: [{ departTime: "asc" }, { createdAt: "asc" }] },
});

export type TripExportSource = Prisma.TripGetPayload<{
  include: typeof TRIP_EXPORT_INCLUDE;
}>;

export type TripExportJson = {
  exportType: "trip";
  exportedAt: string;
  schemaVersion: 1;
  trip: unknown;
};

export function generateTripJsonExport(
  trip: TripExportSource,
  exportedAt = new Date(),
): TripExportJson {
  return {
    exportType: "trip",
    exportedAt: exportedAt.toISOString(),
    schemaVersion: 1,
    trip: normalizeJsonValue({
      ...trip,
      documents: trip.documents.map((document) => ({
        id: document.id,
        tripId: document.tripId,
        title: document.title,
        type: document.type,
        filePath: document.filePath,
        originalFileName: document.originalFileName,
        mimeType: document.mimeType,
        fileSize: document.fileSize,
        isSensitive: document.isSensitive,
        isEncrypted: document.isEncrypted,
        relatedDate: document.relatedDate,
        notes: document.notes,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
      })),
    }),
  };
}

export function generateTripMarkdownExport(trip: TripExportSource): string {
  const lines: string[] = [
    `# ${trip.title}`,
    "",
    `- 日期：${formatDateRange(trip.startDate, trip.endDate)}`,
    `- 出发地：${trip.homeCity || "未设置"}`,
    `- 目的地：${trip.mainDestination || "未设置"}`,
    `- 总预算：${formatMoney(trip.budgetAmount, trip.baseCurrency)}`,
    "",
    "## 每日行程",
  ];

  if (trip.itineraryDays.length === 0) {
    lines.push("", "暂无每日行程。");
  } else {
    for (const day of trip.itineraryDays) {
      lines.push("", `### ${formatDate(day.date)} ${day.title ?? ""}`.trim());
      if (day.city || day.theme || day.weatherSummary || day.notes) {
        lines.push(
          ...compact([
            day.city ? `- 城市：${day.city}` : null,
            day.theme ? `- 主题：${day.theme}` : null,
            day.weatherSummary ? `- 天气：${day.weatherSummary}` : null,
            day.notes ? `- 备注：${day.notes}` : null,
          ]),
        );
      }
      if (day.items.length === 0) {
        lines.push("- 暂无行程项目");
      } else {
        for (const item of day.items) {
          lines.push(
            `- ${formatTimeRange(item.startTime, item.endTime)} ${item.title}（${item.type}）${item.place ? ` @ ${item.place.name}` : ""}`,
          );
          if (item.notes) {
            lines.push(`  - 备注：${item.notes}`);
          }
        }
      }
    }
  }

  lines.push("", "## 交通方案");
  appendTransport(lines, trip);

  lines.push("", "## 住宿");
  appendStays(lines, trip);

  lines.push("", "## 美食");
  appendFoods(lines, trip);

  lines.push("", "## 准备清单");
  appendChecklist(lines, trip);

  lines.push("", "## 预算花销");
  appendExpenses(lines, trip);

  lines.push("", "## 注意事项");
  appendDocuments(lines, trip);

  lines.push("", "## 笔记");
  appendNotes(lines, trip);

  return `${lines.join("\n").trim()}\n`;
}

export function generateTripPrintableHtml(trip: TripExportSource): string {
  const sections = [
    htmlSection(
      "每日行程",
      trip.itineraryDays.length === 0
        ? "<p>暂无每日行程。</p>"
        : trip.itineraryDays
            .map(
              (day) => `
        <article>
          <h3>${escapeHtml(formatDate(day.date))} ${escapeHtml(day.title ?? "")}</h3>
          ${compact([
            day.city ? `<p><strong>城市：</strong>${escapeHtml(day.city)}</p>` : null,
            day.theme ? `<p><strong>主题：</strong>${escapeHtml(day.theme)}</p>` : null,
            day.weatherSummary
              ? `<p><strong>天气：</strong>${escapeHtml(day.weatherSummary)}</p>`
              : null,
            day.notes ? `<p><strong>备注：</strong>${escapeHtml(day.notes)}</p>` : null,
          ]).join("")}
          <ul>
            ${
              day.items.length === 0
                ? "<li>暂无行程项目</li>"
                : day.items
                    .map(
                      (item) => `<li>${escapeHtml(formatTimeRange(item.startTime, item.endTime))} ${escapeHtml(item.title)} <span>${escapeHtml(item.type)}</span>${item.place ? ` @ ${escapeHtml(item.place.name)}` : ""}${item.notes ? `<br><small>${escapeHtml(item.notes)}</small>` : ""}</li>`,
                    )
                    .join("")
            }
          </ul>
        </article>`,
            )
            .join(""),
    ),
    htmlSection("交通方案", htmlTransport(trip)),
    htmlSection("住宿", htmlStays(trip)),
    htmlSection("美食", htmlFoods(trip)),
    htmlSection("准备清单", htmlChecklist(trip)),
    htmlSection("预算花销", htmlExpenses(trip)),
    htmlSection("注意事项", htmlDocuments(trip)),
    htmlSection("笔记", htmlNotes(trip)),
  ];

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(trip.title)} - 可打印行程</title>
  <style>
    body { color: #172026; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.6; margin: 0; background: #f6f4ef; }
    main { margin: 0 auto; max-width: 920px; padding: 32px 20px 64px; background: white; min-height: 100vh; }
    h1 { font-size: 32px; margin: 0 0 12px; }
    h2 { border-bottom: 1px solid #d8d2c6; margin-top: 32px; padding-bottom: 8px; }
    h3 { margin-bottom: 8px; }
    .summary { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); padding: 16px; background: #fbfaf7; border: 1px solid #d8d2c6; border-radius: 8px; }
    .privacy { border: 1px solid #ead0a7; background: #fff8ec; color: #70430f; border-radius: 8px; padding: 12px 14px; }
    .toolbar { margin: 20px 0; }
    button { background: #2f6f73; border: 0; border-radius: 6px; color: white; cursor: pointer; font-weight: 700; padding: 10px 14px; }
    article { break-inside: avoid; }
    small, span { color: #5d6972; }
    @media print {
      body { background: white; }
      main { max-width: none; padding: 0; }
      .toolbar { display: none; }
      a { color: inherit; text-decoration: none; }
    }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(trip.title)}</h1>
    <div class="summary">
      <div><strong>日期</strong><br>${escapeHtml(formatDateRange(trip.startDate, trip.endDate))}</div>
      <div><strong>出发地</strong><br>${escapeHtml(trip.homeCity || "未设置")}</div>
      <div><strong>目的地</strong><br>${escapeHtml(trip.mainDestination || "未设置")}</div>
      <div><strong>总预算</strong><br>${escapeHtml(formatMoney(trip.budgetAmount, trip.baseCurrency))}</div>
    </div>
    <div class="toolbar"><button onclick="window.print()">打印</button></div>
    <p class="privacy">导出文件可能包含旅行行程、住宿地址、票据记录、预算等隐私信息。请妥善保管，不要公开分享，也不要把备份文件发给 AI。</p>
    ${sections.join("\n")}
  </main>
</body>
</html>`;
}

export function generateTripExportFileName(
  title: string,
  extension: "html" | "json" | "md",
  exportedAt = new Date(),
): string {
  return `${safeFileName(title || "trip")}-${formatTimestamp(exportedAt)}.${extension}`;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function appendTransport(lines: string[], trip: TripExportSource) {
  if (trip.routePlans.length === 0 && trip.transports.length === 0) {
    lines.push("暂无交通方案。");
    return;
  }

  for (const route of trip.routePlans) {
    lines.push(`- ${route.title}：${route.fromName} → ${route.toName}`);
    if (route.notes) {
      lines.push(`  - 备注：${route.notes}`);
    }
  }

  for (const option of trip.transports) {
    lines.push(
      `- ${option.fromName} → ${option.toName}：${option.mode}${option.provider ? ` / ${option.provider}` : ""}${option.price ? ` / ${formatMoney(option.price, option.currency ?? trip.baseCurrency)}` : ""}`,
    );
  }
}

function appendStays(lines: string[], trip: TripExportSource) {
  const stays = trip.places.filter((place) => place.stayDetail);
  if (stays.length === 0) {
    lines.push("暂无住宿信息。");
    return;
  }

  for (const place of stays) {
    lines.push(`- ${place.name}${place.address ? `：${place.address}` : ""}`);
    if (place.stayDetail?.bookingReference) {
      lines.push(`  - 预订号：${place.stayDetail.bookingReference}`);
    }
    if (place.stayDetail?.notes) {
      lines.push(`  - 备注：${place.stayDetail.notes}`);
    }
  }
}

function appendFoods(lines: string[], trip: TripExportSource) {
  const foods = trip.places.filter((place) => place.foodDetail);
  if (foods.length === 0) {
    lines.push("暂无美食信息。");
    return;
  }

  for (const place of foods) {
    lines.push(`- ${place.name}${place.address ? `：${place.address}` : ""}`);
    if (place.foodDetail?.notes) {
      lines.push(`  - 备注：${place.foodDetail.notes}`);
    }
  }
}

function appendChecklist(lines: string[], trip: TripExportSource) {
  if (trip.checklistItems.length === 0) {
    lines.push("暂无准备清单。");
    return;
  }

  for (const item of trip.checklistItems) {
    lines.push(`- [${item.status === "DONE" ? "x" : " "}] ${item.category} / ${item.title} × ${item.quantity}`);
  }
}

function appendExpenses(lines: string[], trip: TripExportSource) {
  if (trip.expenses.length === 0) {
    lines.push("暂无预算花销。");
    return;
  }

  for (const expense of trip.expenses) {
    lines.push(`- ${expense.category} / ${expense.title}：${formatMoney(expense.amount, expense.currency)}`);
  }
}

function appendDocuments(lines: string[], trip: TripExportSource) {
  if (trip.documents.length === 0) {
    lines.push("暂无票据或文件元数据。");
    return;
  }

  lines.push("以下仅包含文件元数据，不包含文件内容：");
  for (const document of trip.documents) {
    lines.push(
      `- ${document.title}：${document.originalFileName ?? document.filePath}${document.isSensitive ? "（敏感）" : ""}`,
    );
  }
}

function appendNotes(lines: string[], trip: TripExportSource) {
  if (trip.notes.length === 0) {
    lines.push("暂无笔记。");
    return;
  }

  for (const note of trip.notes) {
    lines.push(`- ${note.title}`);
    lines.push(`  ${note.content.replaceAll("\n", "\n  ")}`);
  }
}

function htmlTransport(trip: TripExportSource): string {
  const lines: string[] = [];
  appendTransport(lines, trip);
  return htmlListFromMarkdownLines(lines);
}

function htmlStays(trip: TripExportSource): string {
  const lines: string[] = [];
  appendStays(lines, trip);
  return htmlListFromMarkdownLines(lines);
}

function htmlFoods(trip: TripExportSource): string {
  const lines: string[] = [];
  appendFoods(lines, trip);
  return htmlListFromMarkdownLines(lines);
}

function htmlChecklist(trip: TripExportSource): string {
  const lines: string[] = [];
  appendChecklist(lines, trip);
  return htmlListFromMarkdownLines(lines);
}

function htmlExpenses(trip: TripExportSource): string {
  const lines: string[] = [];
  appendExpenses(lines, trip);
  return htmlListFromMarkdownLines(lines);
}

function htmlDocuments(trip: TripExportSource): string {
  const lines: string[] = [];
  appendDocuments(lines, trip);
  return htmlListFromMarkdownLines(lines);
}

function htmlNotes(trip: TripExportSource): string {
  const lines: string[] = [];
  appendNotes(lines, trip);
  return htmlListFromMarkdownLines(lines);
}

function htmlListFromMarkdownLines(lines: string[]): string {
  if (lines.length === 1 && !lines[0]?.startsWith("-")) {
    return `<p>${escapeHtml(lines[0])}</p>`;
  }

  return `<ul>${lines
    .filter((line) => line.trim())
    .map((line) => `<li>${escapeHtml(line.replace(/^\s*-\s*(?:\[[x ]\]\s*)?/, ""))}</li>`)
    .join("")}</ul>`;
}

function htmlSection(title: string, body: string): string {
  return `<section><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

function normalizeJsonValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Prisma.Decimal) {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeJsonValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeJsonValue(entry)]),
    );
  }

  return value;
}

function formatDateRange(
  startDate: Date | null | undefined,
  endDate: Date | null | undefined,
): string {
  if (!startDate && !endDate) {
    return "未设置";
  }

  if (startDate && endDate) {
    return `${formatDate(startDate)} - ${formatDate(endDate)}`;
  }

  return startDate ? `${formatDate(startDate)} 出发` : `${formatDate(endDate)} 返回`;
}

function formatDate(date: Date | null | undefined): string {
  if (!date) {
    return "未设置";
  }

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatTimeRange(
  startTime: Date | null | undefined,
  endTime: Date | null | undefined,
): string {
  if (!startTime && !endTime) {
    return "全天";
  }

  if (startTime && endTime) {
    return `${formatTime(startTime)}-${formatTime(endTime)}`;
  }

  return startTime ? `${formatTime(startTime)}开始` : `${formatTime(endTime)}结束`;
}

function formatTime(date: Date | null | undefined): string {
  if (!date) {
    return "";
  }

  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

function formatMoney(amount: unknown, currency: string | null | undefined): string {
  if (amount === null || amount === undefined || amount === "") {
    return "未设置";
  }

  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount)) {
    return "未设置";
  }

  return `${currency || "CNY"} ${numericAmount.toLocaleString("zh-CN", {
    maximumFractionDigits: 2,
  })}`;
}

function safeFileName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .toLowerCase() || "trip";
}

function formatTimestamp(date: Date): string {
  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    "-",
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0"),
  ];

  return parts.join("");
}

function compact<T>(values: Array<T | null | undefined | false>): T[] {
  return values.filter(Boolean) as T[];
}
