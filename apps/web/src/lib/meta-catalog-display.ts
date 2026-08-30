import { formatRelativeTime } from "@openrift/shared";
import type {
  MetaCatalogRow,
  MetaCatalogTriage,
  MetaSource,
  MetaSyncStatus,
  MetaSyncTriggerResult,
} from "@openrift/shared/contracts/admin/meta-catalog";
import { isResumableCheckpoint } from "@openrift/shared/contracts/admin/meta-catalog";

// Pure display helpers for the Meta Archive's catalogue triage and sync panels
// (ADR-014). Kept out of the components so the source's own vocabulary, the
// date-filter boundaries, and the job-result summaries are testable without a
// DOM.

/** What each source is called on screen; the slugs are ours, the names theirs. */
export const META_SOURCE_LABELS: Record<MetaSource, string> = {
  uvsgames: "UVS Games",
  playloltcg: "Play LoL TCG",
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

/**
 * A run's wall time, at the coarsest unit that still says something.
 *
 * @param ms - The run's duration, or null while it is still running.
 * @returns The duration, or an em-dash placeholder.
 */
export function formatRunDuration(ms: number | null): string {
  if (ms === null) {
    return "—";
  }
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

/** How many counters of a job result the compact summary shows. */
const SUMMARY_LIMIT = 6;

/** The counter that is the crawl's actual budget, so it leads the summary. */
const BUDGET_COUNTER = "requests";

/** The coverage note, and whether it has already spent the skipped counter. */
interface CoverageNote {
  text: string | null;
  namesSkipped: boolean;
}

function coverageNote(result: Record<string, unknown> | null): CoverageNote {
  if (result === null || result.complete !== false) {
    return { text: null, namesSkipped: false };
  }
  if (result.cancelRequested === true) {
    return { text: "cancelled", namesSkipped: false };
  }
  const skipped = typeof result.skipped === "number" ? result.skipped : 0;
  if (skipped === 0) {
    return { text: "incomplete", namesSkipped: false };
  }
  return { text: `incomplete, ${skipped.toLocaleString()} skipped`, namesSkipped: true };
}

/**
 * How a crawl that fell short of its own window reads. A partial pass is the
 * one thing the counters cannot say on their own: a crawl that stopped at the
 * first refused page still reports a healthy-looking row count, which is how a
 * third of the catalogue sat stale behind a green run for a week.
 *
 * @param result - The run's stored result.
 * @returns The warning, or null when the run covered everything it set out to.
 */
export function coverageWarning(result: Record<string, unknown> | null): string | null {
  return coverageNote(result).text;
}

/**
 * The countable part of a job's result, as one line. Every `meta.*` job
 * summarizes itself as a bag of counters, so the numbers are the summary and
 * the rest of the payload stays in the expandable detail.
 *
 * Requests come first whatever order the job wrote its counters in: they are
 * what a crawl spends, and a row count read as a cost makes a cheap poll look
 * alarming. A partial pass leads with saying so, ahead of every counter, and
 * the skipped count it names is dropped from the counters rather than printed
 * twice.
 *
 * @param result - The run's stored result.
 * @returns The counters, or an empty string when the result holds none.
 */
export function summarizeRunResult(result: Record<string, unknown> | null): string {
  if (result === null) {
    return "";
  }
  const note = coverageNote(result);
  const counters: [string, number][] = [];
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === "number" && !(note.namesSkipped && key === "skipped")) {
      counters.push([key, value]);
    }
  }
  const budget = counters.filter(([key]) => key === BUDGET_COUNTER);
  const rest = counters.filter(([key]) => key !== BUDGET_COUNTER);
  return [
    ...(note.text === null ? [] : [note.text]),
    ...[...budget, ...rest]
      .slice(0, SUMMARY_LIMIT)
      .map(([key, value]) => `${value.toLocaleString()} ${key}`),
  ].join(" · ");
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

/**
 * What the overview should be shouting about, newest concern first. Everything
 * here is derived rather than stored, so the panel has no state of its own to
 * keep in step with the counters.
 *
 * @param status - The sync status the panel is showing.
 * @param unresolvedCardCount - Unmatched card names across every candidate.
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
      target: "runs",
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
