import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import { authedRoute } from "./_base.js";

extendZodWithOpenApi(z);

export const MAX_SCAN_REPORT_JOURNAL_ENTRIES = 500;

const MAX_SCAN_REPORT_JOURNAL_BYTES = 64 * 1024;

export const scanReportJournalEntrySchema = z.looseObject({
  t: z.number().int().nonnegative(),
  type: z.string().min(1).max(50),
});

export type ScanReportJournalEntry = z.infer<typeof scanReportJournalEntrySchema>;

export const createScanReportSchema = z.object({
  note: z.string().trim().max(2000).optional(),
  userAgent: z.string().max(500).optional(),
  journal: z
    .array(scanReportJournalEntrySchema)
    .max(MAX_SCAN_REPORT_JOURNAL_ENTRIES)
    .refine(
      (entries) => JSON.stringify(entries).length <= MAX_SCAN_REPORT_JOURNAL_BYTES,
      `Journal exceeds ${MAX_SCAN_REPORT_JOURNAL_BYTES} bytes`,
    ),
});

export type CreateScanReportInput = z.infer<typeof createScanReportSchema>;

export const scanReportResponseSchema = z
  .object({ reference: z.string() })
  .openapi("ScanReportResponse");

export const scanReportsContract = {
  create: authedRoute
    .route({
      method: "POST",
      path: "/api/v1/scan-reports",
      tags: ["Scan Reports"],
      successStatus: 201,
    })
    .errors({ TOO_MANY_REQUESTS: { message: "Hourly scan report limit reached" } })
    .input(createScanReportSchema)
    .output(scanReportResponseSchema),
};

export type ScanReportsContract = typeof scanReportsContract;
