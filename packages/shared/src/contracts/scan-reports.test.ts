import { describe, expect, it } from "vitest";

import { createScanReportSchema, MAX_SCAN_REPORT_JOURNAL_ENTRIES } from "./scan-reports.js";

const entry = (t: number) => ({ t, type: "scan", printingId: "p1" });

describe("createScanReportSchema", () => {
  it("accepts a journal with a note", () => {
    const result = createScanReportSchema.safeParse({
      note: "the retry double-added",
      userAgent: "Firefox",
      journal: [entry(1), entry(2)],
    });

    expect(result.success).toBe(true);
  });

  it("accepts an empty journal and no note", () => {
    expect(createScanReportSchema.safeParse({ journal: [] }).success).toBe(true);
  });

  it("keeps the per-type fields the device wrote", () => {
    const result = createScanReportSchema.parse({
      journal: [{ t: 1, type: "add-start", batchId: "b1", collectionId: "c1", jobs: 3 }],
    });

    expect(result.journal[0]).toMatchObject({ batchId: "b1", collectionId: "c1", jobs: 3 });
  });

  it("rejects an entry with no timestamp or no type", () => {
    expect(createScanReportSchema.safeParse({ journal: [{ type: "scan" }] }).success).toBe(false);
    expect(createScanReportSchema.safeParse({ journal: [{ t: 1 }] }).success).toBe(false);
  });

  it("rejects more entries than the device ring holds", () => {
    const journal = Array.from({ length: MAX_SCAN_REPORT_JOURNAL_ENTRIES + 1 }, (_, i) => entry(i));

    expect(createScanReportSchema.safeParse({ journal }).success).toBe(false);
  });

  it("rejects a journal past the serialized size cap", () => {
    const journal = Array.from({ length: 200 }, (_, i) => ({
      t: i,
      type: "scan",
      printingId: "x".repeat(400),
    }));

    expect(createScanReportSchema.safeParse({ journal }).success).toBe(false);
  });

  it("rejects a note past the length cap", () => {
    const result = createScanReportSchema.safeParse({ note: "x".repeat(2001), journal: [] });

    expect(result.success).toBe(false);
  });
});
