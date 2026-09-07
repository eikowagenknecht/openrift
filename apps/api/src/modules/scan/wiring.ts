import type { Kysely } from "kysely";

import type { Database } from "../../db/index.js";
import { scanIndexRepo } from "./repositories/scan-index.js";
import { scanReportsRepo } from "./repositories/scan-reports.js";
import { createScanReport } from "./services/scan-reports.js";

export interface ScanRepos {
  scanIndex: ReturnType<typeof scanIndexRepo>;
  scanReports: ReturnType<typeof scanReportsRepo>;
}

export interface ScanServices {
  createScanReport: typeof createScanReport;
}

export function createScanRepos(db: Kysely<Database>): ScanRepos {
  return {
    scanIndex: scanIndexRepo(db),
    scanReports: scanReportsRepo(db),
  };
}

export function createScanServices(): ScanServices {
  return { createScanReport };
}
