import { PLAYLOLTCG_STATUSES, TOPDECK_FORMATS, formatRelativeTime } from "@openrift/shared";
import type { MetaOverlayQueueRow, PlayloltcgStatus } from "@openrift/shared";
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

import type { MetaCoverageRow } from "@/components/admin/meta-coverage-chips";
import { summarizeRunResult } from "@/lib/job-run-display";

// Pure display helpers for the Meta Archive's catalogue triage and sync panels
// (ADR-014). Kept out of the components so the source's own vocabulary, the
// date-filter boundaries, and the job-result summaries are testable without a
// DOM.

/** What each source is called on screen; the slugs are ours, the names theirs. */
export const META_SOURCE_LABELS: Record<MetaSource, string> = {
  uvsgames: "UVS Games",
  playloltcg: "Play LoL TCG",
  topdeck: "TopDeck.gg",
};

/** A label and the Badge tone it is rendered with. */
export interface CatalogChipDisplay {
  label: string;
  variant: "warning" | "subtle" | "success" | "muted" | "outline";
}

const STATUS_DISPLAY: Record<string, CatalogChipDisplay> = {
  upcoming: { label: "Upcoming", variant: "outline" },
  inProgress: { label: "In progress", variant: "warning" },
  complete: { label: "Complete", variant: "success" },
};

/**
 * The chip for the source's own status. Unknown values are shown verbatim: the
 * vocabulary belongs to the source, not to us, so a new one must stay readable
 * rather than disappear.
 *
 * @param status - The source's `display_status`.
 * @returns The chip's label and tone.
 */
export function catalogStatusDisplay(status: string): CatalogChipDisplay {
  return STATUS_DISPLAY[status] ?? { label: status, variant: "outline" };
}

/** Where each lifecycle step lands in the three statuses the chips speak. */
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
 * The chip for playloltcg's `sortWeight` lifecycle. The source can report a step
 * outside the five it documents, which is why this answers undefined rather than
 * inventing a label: a number the reader cannot act on is worse than no chip.
 *
 * @param status - The source's `sortWeight`, or null when it published none.
 * @returns The chip's label and tone, or undefined for a step we do not know.
 */
export function playloltcgStatusDisplay(status: number | null): CatalogChipDisplay | undefined {
  return status === null ? undefined : PLAYLOLTCG_STATUS_DISPLAY[status as PlayloltcgStatus];
}

/** The lifecycle as a filter's options, in the order the source runs through it. */
export const PLAYLOLTCG_STATUS_CHOICES = PLAYLOLTCG_STATUSES.map((status) => ({
  value: String(status),
  label: PLAYLOLTCG_STATUS_DISPLAY[status].label,
}));

/**
 * A playloltcg row in the vocabulary the shared coverage chips read. The source
 * publishes no decklist status: it releases standings and decks in one act, so
 * "were decks published" is not a question it can answer ahead of the fetch.
 *
 * @param row - The catalogue row.
 * @returns The coverage fields, with the lifecycle mapped onto the chips' three statuses.
 */
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

/** The source's own format vocabulary, as the catalogue's second filter axis. */
export const TOPDECK_FORMAT_CHOICES = TOPDECK_FORMATS.map((format) => ({
  value: format,
  label: format,
}));

/** The search answers about completed tournaments only, so every row is complete and there is no recheck ladder to report. */
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

/**
 * The chip for a row's triage state.
 *
 * @param triage - The derived triage state.
 * @returns The chip's label and tone.
 */
export function catalogTriageDisplay(triage: MetaCatalogTriage): CatalogChipDisplay {
  return TRIAGE_DISPLAY[triage];
}

/**
 * Where the event runs, as one line. Both fields are optional at the source, so
 * either half may be missing.
 *
 * @param row - The catalogue row's venue fields.
 * @returns The store and location, or an em-dash placeholder when neither is set.
 */
export function catalogVenueText(row: Pick<MetaCatalogRow, "storeName" | "location">): string {
  const parts = [row.storeName, row.location].filter((part): part is string => Boolean(part));
  return parts.length === 0 ? "—" : parts.join(", ");
}

/**
 * Turns a picked calendar day into the instant the date filter needs. The
 * catalogue stores start times as instants, so a day filter has to name a
 * boundary; both ends are UTC, matching how every other ops surface reads a day.
 *
 * @param day - An ISO calendar day (`2026-08-15`), or an empty string.
 * @param edge - Whether the day opens or closes the range.
 * @returns The ISO instant, or undefined when there is no day to bound.
 */
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

/** What a manual trigger's outcome is announced as. */
export interface SyncTriggerAnnouncement {
  title: string;
  description: string;
  /** False for the outcomes that need the maintainer's attention. */
  ok: boolean;
}

/**
 * How a manual trigger's outcome reads. The long crawls answer before they
 * finish, so "started" and "finished" are genuinely different things to say,
 * and a second click while one is in flight is answered rather than ignored.
 *
 * @param label - The trigger's name, as the button spells it.
 * @param result - What the endpoint answered.
 * @returns The announcement to toast.
 */
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

/** The backfill's state, as the maintenance section presents it. */
export type BackfillDisplay =
  | { phase: "idle" }
  | { phase: "running"; coveredThrough: string | null }
  | {
      phase: "resumable";
      coveredThrough: string;
      /** Whether the stopped run was cancelled rather than falling short. */
      cancelled: boolean;
    };

/**
 * Which backfill controls to show, read through the same
 * {@link isResumableCheckpoint} the server's resume rule uses, so the buttons
 * promise exactly what `runBackfill` will do.
 *
 * @param runs - The status endpoint's recent runs, newest first.
 * @param kind - The source's backfill job kind.
 * @returns The backfill's phase, and the resume point if any.
 */
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

/**
 * The run a Stop would be aimed at: the newest run of the kind, and only while
 * it is still running.
 *
 * @param runs - The status endpoint's recent runs, newest first.
 * @param kind - The job kind to look for.
 * @returns The running run's id, or null when none is.
 */
export function runningRunId(runs: MetaSyncStatus["runs"], kind: string): string | null {
  const latest = runs.find((run) => run.kind === kind);
  return latest?.status === "running" ? latest.id : null;
}

/** Where an alert sends the maintainer to act on it. */
export type MetaSyncAlertTarget =
  | "runs"
  | "failed-runs"
  | "catalogue-accepted"
  | "catalogue-accepted-missing"
  | "review";

/** One thing wrong with the sync, in the words the overview prints. */
export interface MetaSyncAlert {
  id: string;
  message: string;
  target: MetaSyncAlertTarget;
}

/** Past this, the mirror has missed enough crawls that something is wrong. */
const STALE_CRAWL_MS = 8 * 24 * 60 * 60 * 1000;

const RECENT_FAILURE_MS = 24 * 60 * 60 * 1000;

/** One recheck batch's worth. More than this and the ladder is falling behind. */
const DUE_RECHECK_LIMIT = 40;

/** The queue counts the overview's funnel and its alerts read. */
export interface OverlayProviderCounts {
  pendingReview: number;
  unresolvedCards: number;
}

/**
 * The overlay queue narrowed to one source.
 *
 * The queue itself is cross-source, but the overview is a per-source screen, so
 * counting the whole queue on every tab made both tabs report the same number
 * and fed the alerts a figure neither source could act on. An overlay a person
 * sent carries no provider, and it belongs on the tab of the source whose event
 * it patches — which the queue row does not name — so those count on every tab
 * rather than on none.
 *
 * @param overlays - The whole review queue.
 * @param provider - The source tab doing the asking.
 * @returns The pending and unmatched-name counts for that tab.
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

/**
 * What the overview should be shouting about, newest concern first. Everything
 * here is derived rather than stored, so the panel has no state of its own to
 * keep in step with the counters.
 *
 * @param status - The sync status the panel is showing.
 * @param unresolvedCardCount - Unmatched card names on this source's overlays.
 * @param now - The instant to measure staleness against.
 * @returns The active alerts, empty when the sync is healthy.
 */
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

  // A failure heals once a newer run of the same kind succeeds: the alert is
  // about the job being broken now, not about history the run table already
  // shows. A partial crawl heals the same way, but only a *complete* newer run
  // re-reads the range the partial one missed.
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
