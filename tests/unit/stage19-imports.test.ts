import { describe, expect, it } from "vitest";

import {
  buildImportPreview,
  convertMarkdownToSafeNote,
  detectImportConflicts,
  IMPORT_FILE_SIZE_LIMIT_BYTES,
  parseCsv,
  refreshImportPreviewConflicts,
  resolveImportDecision,
  sanitizeCsvFormula,
  validateImportFileBeforeRead,
  validateSystemJsonSchema,
  type ExistingImportData,
  type ImportPreviewItem,
} from "@/lib/imports";

describe("stage 19 import parsing", () => {
  it("parses CSV with quoted commas and row numbers", () => {
    const result = parseCsv('name,address,notes\n"Nishiki, Market","Kyoto","Line 1"\nCafe,Tokyo,"ok"');

    expect(result.errors).toEqual([]);
    expect(result.headers).toEqual(["name", "address", "notes"]);
    expect(result.records).toEqual([
      {
        rowNumber: 2,
        values: {
          address: "Kyoto",
          name: "Nishiki, Market",
          notes: "Line 1",
        },
      },
      {
        rowNumber: 3,
        values: {
          address: "Tokyo",
          name: "Cafe",
          notes: "ok",
        },
      },
    ]);
  });

  it("validates TraceMe JSON schema", () => {
    expect(
      validateSystemJsonSchema({
        exportType: "trip",
        schemaVersion: 1,
        trip: { title: "Kyoto" },
      }),
    ).toEqual([]);

    expect(validateSystemJsonSchema({ exportType: "backup" })).toContain(
      "JSON exportType 必须是 trip。",
    );
  });

  it("converts Markdown into escaped safe note content", () => {
    const note = convertMarkdownToSafeNote(
      '# Guide\n<script>alert("x")</script>\n- item',
      "guide.md",
    );

    expect(note.title).toBe("Guide");
    expect(note.content).toContain("&lt;script&gt;");
    expect(note.content).not.toContain("<script>");
    expect(note.tags).toContain("markdown");
  });

  it("detects duplicate places against existing data and same file rows", () => {
    const preview = buildImportPreview({
      content: "name,address,type\nCafe One,Kyoto,RESTAURANT\nCafe One,Kyoto,RESTAURANT\nNew Place,Tokyo,OTHER",
      existing: {
        ...emptyExisting(),
        places: [{ address: "Kyoto", id: "place-1", name: "Cafe One" }],
      },
      fileName: "places.csv",
      fileSize: 96,
      importedAt: new Date("2026-05-30T00:00:00.000Z"),
      mimeType: "text/csv",
      type: "places-csv",
    }).preview;

    expect(preview.summary.totalRows).toBe(3);
    expect(preview.summary.conflictRows).toBe(2);
    expect(preview.items[0].conflict?.existingId).toBe("place-1");
    expect(preview.items[1].status).toBe("conflict");
    expect(preview.items[2].status).toBe("new");
  });

  it("resolves conflict strategies", () => {
    const item = conflictItem();

    expect(resolveImportDecision(item, "skip")).toBe("skip");
    expect(resolveImportDecision(item, "overwrite")).toBe("overwrite");
    expect(resolveImportDecision(item, "duplicate")).toBe("create");
    expect(resolveImportDecision(item, "manual", "overwrite")).toBe("overwrite");
    expect(resolveImportDecision({ ...item, status: "invalid" }, "duplicate")).toBe("skip");
  });

  it("protects against CSV formula injection", () => {
    expect(sanitizeCsvFormula("=IMPORTXML(\"http://bad\")")).toBe(
      "'=IMPORTXML(\"http://bad\")",
    );
    expect(sanitizeCsvFormula("+SUM(1,2)")).toBe("'+SUM(1,2)");
    expect(sanitizeCsvFormula("@cmd")).toBe("'@cmd");
    expect(sanitizeCsvFormula("Normal text")).toBe("Normal text");

    const preview = buildImportPreview({
      content: "name,address\n=HYPERLINK(\"http://bad\"),Kyoto",
      existing: emptyExisting(),
      fileName: "places.csv",
      fileSize: 64,
      mimeType: "text/csv",
      type: "places-csv",
    }).preview;

    expect((preview.items[0].data as { name: string }).name.startsWith("'=")).toBe(true);
  });

  it("rejects unsafe file metadata before reading file contents", () => {
    expect(
      validateImportFileBeforeRead({
        fileName: "places.csv",
        fileSize: IMPORT_FILE_SIZE_LIMIT_BYTES + 1,
        mimeType: "text/csv",
        type: "places-csv",
      }),
    ).toContain("导入文件不能超过 2.0 MB。");
    expect(
      validateImportFileBeforeRead({
        fileName: "../places.csv",
        fileSize: 12,
        mimeType: "text/csv",
        type: "places-csv",
      }),
    ).toContain("导入文件名不安全，不能包含路径或上级目录片段。");
  });

  it("refreshes conflicts against current database state before confirmation", () => {
    const preview = buildImportPreview({
      content: "name,address,type\nLate Conflict,Kyoto,RESTAURANT",
      existing: emptyExisting(),
      fileName: "places.csv",
      fileSize: 64,
      mimeType: "text/csv",
      type: "places-csv",
    }).preview;

    expect(preview.items[0].status).toBe("new");

    const refreshed = refreshImportPreviewConflicts(preview, {
      ...emptyExisting(),
      places: [{ address: "Kyoto", id: "place-current", name: "Late Conflict" }],
    });

    expect(refreshed.items[0].status).toBe("conflict");
    expect(refreshed.items[0].conflict?.existingId).toBe("place-current");
    expect(refreshed.summary.conflictRows).toBe(1);
  });

  it("keeps invalid import preview from being ok", () => {
    const { preview, validation } = buildImportPreview({
      content: "title,amount,currency\nLunch,-10,CNY",
      existing: emptyExisting(),
      fileName: "expenses.csv",
      fileSize: 64,
      mimeType: "text/csv",
      type: "expenses-csv",
    });

    expect(preview.summary.invalidRows).toBe(1);
    expect(validation.ok).toBe(false);
  });
});

function emptyExisting(): ExistingImportData {
  return {
    checklistItems: [],
    destinations: [],
    expenses: [],
    notes: [],
    places: [],
    routePlans: [],
  };
}

function conflictItem(): ImportPreviewItem {
  return detectImportConflicts(
    [
      {
        data: {
          address: "Kyoto",
          estimatedCost: null,
          estimatedDurationMin: null,
          latitude: null,
          longitude: null,
          name: "Cafe One",
          notes: null,
          phone: null,
          priority: "MEDIUM",
          ratingPersonal: null,
          sourceName: null,
          sourceUrl: null,
          tags: [],
          type: "RESTAURANT",
          website: null,
        },
        entity: "place",
        errors: [],
        index: 0,
        label: "Cafe One",
        status: "new",
        warnings: [],
      },
    ],
    {
      ...emptyExisting(),
      places: [{ address: "Kyoto", id: "place-1", name: "Cafe One" }],
    },
  )[0];
}
