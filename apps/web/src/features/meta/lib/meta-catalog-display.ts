import type {
  MetaCatalogRow,
  MetaCatalogTriage,
  MetaSource,
  MetaSyncStatus,
  MetaSyncTriggerResult,
  PlayloltcgCatalogRow,
  TopdeckCatalogRow,
} from "@openrift/shared/contracts/admin/meta-catalog";
import { isResumableCheckpoint } from "@openrift/shared/contracts/admin/meta-catalog";
import { formatRelativeTime } from "@openrift/shared/format-date";
import type { MetaOverlayQueueRow } from "@openrift/shared/types/api/meta";
import { PLAYLOLTCG_STATUSES, TOPDECK_FORMATS } from "@openrift/shared/types/enums";
import type { PlayloltcgStatus } from "@openrift/shared/types/enums";

import { summarizeRunResult } from "@/features/admin/lib/job-run-display";

export interface MetaCoverageRow {
  triage: MetaCatalogRow["triage"];
  displayStatus: string;
  decklistStatus: string | null;
  fetchedAt: string | null;
  stagedPlayerCount: number;
  stagedLegendCount: number;
  stagedDeckCount: number;
  nextCheckAt: string | null;
  startAt: string | null;
}

export const META_SOURCE_LABELS: Record<MetaSource, string> = {
  uvsgames: "UVS Games",
  playloltcg: "Play LoL TCG",
  topdeck: "TopDeck.gg",
};

export interface CatalogChipDisplay {
  label: string;
  variant: "warning" | "subtle" | "success" | "muted" | "outline";
}

const STATUS_DISPLAY: Record<string, CatalogChipDisplay> = {
  upcoming: { label: "Upcoming", variant: "outline" },
  inProgress: { label: "In progress", variant: "warning" },
  complete: { label: "Complete", variant: "success" },
};

export function catalogStatusDisplay(status: string): CatalogChipDisplay {
  return STATUS_DISPLAY[status] ?? { label: status, variant: "outline" };
}

const PLAYLOLTCG_COVERAGE_STATUS: Record<PlayloltcgStatus, string> = {
  1: "upcoming",
  2: "upcoming",
  3: "upcoming",
  4: "inProgress",
  5: "complete",
};

const PLAYLOLTCG_STATUS_DISPLAY: Record<PlayloltcgStatus, CatalogChipDisplay> = {
  1: { label: "Reg open", variant: "outline" },
  2: { label: "Full", variant: "outline" },
  3: { label: "Scheduled", variant: "outline" },
  4: { label: "In progress", variant: "warning" },
  5: { label: "Finished", variant: "success" },
};

/**
 * A `sortWeight` outside the five documented steps answers undefined rather
 * than inventing a label.
 */
export function playloltcgStatusDisplay(status: number | null): CatalogChipDisplay | undefined {
  return status === null ? undefined : PLAYLOLTCG_STATUS_DISPLAY[status as PlayloltcgStatus];
}

export const PLAYLOLTCG_STATUS_CHOICES = PLAYLOLTCG_STATUSES.map((status) => ({
  value: String(status),
  label: PLAYLOLTCG_STATUS_DISPLAY[status].label,
}));

/** The source releases standings and decks in one act, so it publishes no decklist status. */
export function playloltcgCoverageRow(row: PlayloltcgCatalogRow): MetaCoverageRow {
  return {
    triage: row.triage,
    displayStatus: PLAYLOLTCG_COVERAGE_STATUS[row.status as PlayloltcgStatus] ?? "upcoming",
    decklistStatus: null,
    fetchedAt: row.fetchedAt,
    stagedPlayerCount: row.stagedPlayerCount,
    stagedLegendCount: row.stagedLegendCount,
    stagedDeckCount: row.stagedDeckCount,
    nextCheckAt: row.nextCheckAt,
    startAt: row.startAt === null ? null : `${row.startAt}T00:00:00.000Z`,
  };
}

export const TOPDECK_FORMAT_CHOICES = TOPDECK_FORMATS.map((format) => ({
  value: format,
  label: format,
}));

/** The search answers about completed tournaments only, so every row is complete. */
export function topdeckCoverageRow(row: TopdeckCatalogRow): MetaCoverageRow {
  return {
    triage: row.triage,
    displayStatus: "complete",
    decklistStatus: null,
    fetchedAt: row.fetchedAt,
    stagedPlayerCount: row.stagedPlayerCount,
    stagedLegendCount: row.stagedLegendCount,
    stagedDeckCount: row.stagedDeckCount,
    nextCheckAt: null,
    startAt: row.startAt,
  };
}

const TRIAGE_DISPLAY: Record<MetaCatalogTriage, CatalogChipDisplay> = {
  new: { label: "New", variant: "warning" },
  accepted: { label: "Accepted", variant: "success" },
  dismissed: { label: "Dismissed", variant: "muted" },
};

export function catalogTriageDisplay(triage: MetaCatalogTriage): CatalogChipDisplay {
  return TRIAGE_DISPLAY[triage];
}

export function catalogVenueText(row: Pick<MetaCatalogRow, "storeName" | "location">): string {
  const parts = [row.storeName, row.location].filter((part): part is string => Boolean(part));
  return parts.length === 0 ? "—" : parts.join(", ");
}

/** Both ends are UTC, matching how every other ops surface reads a day. */
export function catalogDayBoundary(day: string, edge: "start" | "end"): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(day)) {
    return undefined;
  }
  const time = edge === "start" ? "T00:00:00.000Z" : "T23:59:59.999Z";
  const parsed = new Date(`${day}${time}`);
  if (isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed.toISOString();
}

export interface SyncTriggerAnnouncement {
  title: string;
  description: string;
  ok: boolean;
}

export function syncTriggerAnnouncement(
  label: string,
  result: MetaSyncTriggerResult,
): SyncTriggerAnnouncement {
  if (result.status === "already_running") {
    return {
      title: `${label} is already running`,
      description: "Wait for it to finish, then start another.",
      ok: false,
    };
  }
  if (result.status === "failed") {
    return { title: `${label} failed`, description: result.message ?? "", ok: false };
  }
  if (result.status === "running") {
    return {
      title: `${label} started`,
      description: "It runs in the background; the run list below tracks it.",
      ok: true,
    };
  }
  return { title: `${label} finished`, description: summarizeRunResult(result.result), ok: true };
}

export type BackfillDisplay =
  | { phase: "idle" }
  | { phase: "running"; coveredThrough: string | null }
  | {
      phase: "resumable";
      coveredThrough: string;
      cancelled: boolean;
    };

export function backfillDisplay(runs: MetaSyncStatus["runs"], kind: string): BackfillDisplay {
  const latest = runs.find((run) => run.kind === kind);
  if (latest === undefined) {
    return { phase: "idle" };
  }
  if (latest.status === "running") {
    const covered =
      typeof latest.result?.coveredThrough === "string" ? latest.result.coveredThrough : null;
    return { phase: "running", coveredThrough: covered };
  }
  if (isResumableCheckpoint(latest.result)) {
    return {
      phase: "resumable",
      coveredThrough: latest.result.coveredThrough,
      cancelled: latest.result.cancelRequested,
    };
  }
  return { phase: "idle" };
}

export function runningRunId(runs: MetaSyncStatus["runs"], kind: string): string | null {
  const latest = runs.find((run) => run.kind === kind);
  return latest?.status === "running" ? latest.id : null;
}

export type MetaSyncAlertTarget =
  | "runs"
  | "failed-runs"
  | "catalogue-accepted"
  | "catalogue-accepted-missing"
  | "review";

export interface MetaSyncAlert {
  id: string;
  message: string;
  target: MetaSyncAlertTarget;
}

const STALE_CRAWL_MS = 8 * 24 * 60 * 60 * 1000;

const RECENT_FAILURE_MS = 24 * 60 * 60 * 1000;

const DUE_RECHECK_LIMIT = 40;

export interface OverlayProviderCounts {
  pendingReview: number;
  unresolvedCards: number;
}

/**
 * An overlay with no provider belongs on the tab of the source whose event it
 * patches, which the queue row does not name, so it counts on every tab.
 */
export function overlayCountsForProvider(
  overlays: readonly MetaOverlayQueueRow[],
  provider: MetaSource,
): OverlayProviderCounts {
  const rows = overlays.filter((row) => row.provider === null || row.provider === provider);
  return {
    pendingReview: rows.length,
    unresolvedCards: rows.reduce((sum, row) => sum + row.unresolvedNames.length, 0),
  };
}

export function metaSyncAlerts(
  status: MetaSyncStatus,
  unresolvedCardCount: number,
  now: Date,
): MetaSyncAlert[] {
  const alerts: MetaSyncAlert[] = [];
  const { catalog, runs, schedules } = status;
  const scheduled = Object.values(schedules).some(Boolean);
  const lastSeen = catalog.lastSeenAt === null ? null : new Date(catalog.lastSeenAt);

  if (scheduled && (lastSeen === null || now.getTime() - lastSeen.getTime() > STALE_CRAWL_MS)) {
    alerts.push({
      id: "stale-crawl",
      message:
        lastSeen === null
          ? "A sync cron is registered, but no crawl has ever reached the listing."
          : `The last crawl activity was ${formatRelativeTime(lastSeen, { now })}, so the mirror is going stale.`,
      target: "runs",
    });
  }

  // A failure or partial crawl heals once a newer run of the same kind
  // succeeds, but a partial only heals on a *complete* newer run.
  const lastSuccessAt = new Map<string, number>();
  const lastFullSuccessAt = new Map<string, number>();
  for (const run of runs) {
    if (run.status !== "succeeded") {
      continue;
    }
    const at = new Date(run.startedAt).getTime();
    lastSuccessAt.set(run.kind, Math.max(lastSuccessAt.get(run.kind) ?? 0, at));
    if (run.result?.complete !== false) {
      lastFullSuccessAt.set(run.kind, Math.max(lastFullSuccessAt.get(run.kind) ?? 0, at));
    }
  }

  const failed = runs.filter(
    (run) =>
      run.status === "failed" &&
      now.getTime() - new Date(run.startedAt).getTime() < RECENT_FAILURE_MS &&
      new Date(run.startedAt).getTime() > (lastSuccessAt.get(run.kind) ?? 0),
  );
  if (failed.length > 0) {
    alerts.push({
      id: "failed-runs",
      message: `${failed.length} sync ${failed.length === 1 ? "run" : "runs"} failed in the last 24 hours.`,
      target: "failed-runs",
    });
  }

  // A crawl that stopped short succeeds, so nothing else here would notice it.
  const partial = runs.filter(
    (run) =>
      run.status === "succeeded" &&
      run.result?.complete === false &&
      run.result.cancelRequested !== true &&
      now.getTime() - new Date(run.startedAt).getTime() < RECENT_FAILURE_MS &&
      new Date(run.startedAt).getTime() > (lastFullSuccessAt.get(run.kind) ?? 0),
  );
  if (partial.length > 0) {
    alerts.push({
      id: "partial-crawls",
      message: `${partial.length} sync ${partial.length === 1 ? "run" : "runs"} finished without covering the whole window, so part of the listing was not read.`,
      target: "runs",
    });
  }

  if (catalog.dueRecheck > DUE_RECHECK_LIMIT) {
    alerts.push({
      id: "due-rechecks",
      message: `${catalog.dueRecheck} accepted events are overdue a recheck, more than one batch clears.`,
      target: "catalogue-accepted",
    });
  }

  if (catalog.acceptedMissing > 0) {
    alerts.push({
      id: "accepted-missing",
      message: `${catalog.acceptedMissing} ${catalog.acceptedMissing === 1 ? "event" : "events"} live on /meta ${catalog.acceptedMissing === 1 ? "has" : "have"} disappeared from the source listing.`,
      target: "catalogue-accepted-missing",
    });
  }

  if (unresolvedCardCount > 0) {
    alerts.push({
      id: "unresolved-cards",
      message: `${unresolvedCardCount} card ${unresolvedCardCount === 1 ? "name" : "names"} across staged decks match no live card.`,
      target: "review",
    });
  }

  return alerts;
}
