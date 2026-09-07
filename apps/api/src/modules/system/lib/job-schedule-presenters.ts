import type {
  JobScheduleView,
  ScheduledJobKind,
} from "@openrift/shared/contracts/admin/job-schedules";

import type { JobRun } from "../repositories/job-runs.js";
import type { JobScheduleRow } from "../repositories/job-schedules.js";

export interface JobScheduleMeta {
  kind: ScheduledJobKind;
  title: string;
  description: string;
  suggestedSchedule: string;
  unavailableReason?: string;
}

export function toJobScheduleView(params: {
  meta: JobScheduleMeta;
  row: JobScheduleRow | null;
  lastRun: JobRun | undefined;
  nextRun: Date | null;
}): JobScheduleView {
  const { meta, row, lastRun, nextRun } = params;
  return {
    kind: meta.kind,
    title: meta.title,
    description: meta.description,
    suggestedSchedule: meta.suggestedSchedule,
    schedule: row?.schedule ?? null,
    available: meta.unavailableReason === undefined,
    unavailableReason: meta.unavailableReason ?? null,
    nextRun: nextRun?.toISOString() ?? null,
    lastRun:
      lastRun === undefined
        ? null
        : {
            startedAt: lastRun.startedAt.toISOString(),
            finishedAt: lastRun.finishedAt?.toISOString() ?? null,
            durationMs: lastRun.durationMs,
            status: lastRun.status,
            errorMessage: lastRun.errorMessage,
          },
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
}
