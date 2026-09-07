import type { scanReportResponseSchema } from "@openrift/shared/contracts/scan-reports";
import type { z } from "zod";

export type ScanReportResponse = z.infer<typeof scanReportResponseSchema>;
