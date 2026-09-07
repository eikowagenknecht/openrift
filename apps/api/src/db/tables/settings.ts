import type { JobStatus, JobTrigger } from "@openrift/shared/contracts/admin/job-runs";
import type { ScanReportJournalEntry } from "@openrift/shared/contracts/scan-reports";
import type { UserPreferencesResponse } from "@openrift/shared/types/api/preferences";
import type { ColumnType, Generated } from "kysely";

import type { CreatedAt, UpdatedAt } from "./columns.js";

export interface ScanReportsTable {
  id: Generated<string>;
  userId: string;
  createdAt: CreatedAt;
  reference: string;
  note: string | null;
  userAgent: string | null;
  journal: ScanReportJournalEntry[];
}

export interface ProviderSettingsTable {
  provider: string;
  sortOrder: Generated<number>;
  isHidden: Generated<boolean>;
  isFavorite: Generated<boolean>;
  helperReviewable: Generated<boolean>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface FeatureFlagsTable {
  key: string;
  enabled: Generated<boolean>;
  description: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface UserFeatureFlagsTable {
  userId: string;
  flagKey: string;
  enabled: boolean;
}

export interface SiteSettingsTable {
  key: string;
  value: string;
  scope: Generated<"web" | "api">;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface UserPreferencesTable {
  userId: string;
  data: ColumnType<
    UserPreferencesResponse,
    UserPreferencesResponse | undefined,
    UserPreferencesResponse
  >;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface JobRunsTable {
  id: Generated<string>;
  kind: string;
  trigger: JobTrigger;
  status: JobStatus;
  startedAt: ColumnType<Date, Date | undefined, Date>;
  finishedAt: ColumnType<Date | null, Date | null | undefined, Date | null>;
  durationMs: ColumnType<number | null, number | null | undefined, number | null>;
  errorMessage: ColumnType<string | null, string | null | undefined, string | null>;
  result: ColumnType<unknown, unknown | undefined, unknown>;
  noop: ColumnType<boolean | null, boolean | null | undefined, boolean | null>;
}

export interface JobSchedulesTable {
  kind: string;
  schedule: string;
  updatedAt: UpdatedAt;
}

/** `encoderTag` names the encoder file the bank was built with; it and the browser encoder must always match. */
export interface ScanIndexTable {
  id: number;
  formatVersion: number;
  bankHash: string;
  entryCount: number;
  encoderTag: string;
  watermark: ColumnType<Date | null, Date | null | undefined, Date | null>;
  builtAt: ColumnType<Date, Date | undefined, Date>;
  durationMs: number;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}
