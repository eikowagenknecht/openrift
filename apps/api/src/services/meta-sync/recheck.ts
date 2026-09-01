import { nextRecheck } from "../../lib/meta-recheck-schedule.js";
import { projectCatalogRow, UVSGAMES_PROVIDER } from "../../lib/uvsgames-catalog.js";
import type { UvsgamesListRow } from "../../repositories/uvsgames-events.js";
import { runCancelRequested, writeRunHeartbeat } from "./crawl-checkpoint.js";
import { deepFetchEvent } from "./deep-fetch.js";
import type { MetaSyncDeps } from "./deps.js";
import { clock, errorText } from "./deps.js";

/**
 * The per-event recheck queue. Only accepted events are ever in it,
 * and one visit costs one listing request: read the event's current status,
 * decide whether its results are worth pulling, and set the next visit.
 *
 * The two things this catches are what the daily sync cannot. A tournament
 * that finishes today has its standings within the hour — a quarter hour on a
 * watched template — because an accepted event past its start time is polled
 * while it runs. And a decklist published six weeks later still lands, because
 * the ladder keeps looking long after the sync's lookback has aged the event
 * out.
 */

/** Rows one pass will visit. Ten minutes apart, this drains a real backlog fast. */
export const RECHECK_BATCH_SIZE = 40;

export interface MetaRecheckResult {
  due: number;
  processed: number;
  requests: number;
  /** Events whose results this pass pulled. */
  fetched: number;
  players: number;
  acceptedPlayers: number;
  /** True when the admin's Stop ended the pass with rows still due. */
  cancelRequested: boolean;
  errors: string[];
}

/** A pass that visited nothing, and one that only collected failures, are not the same run. */
export function isRecheckNoop(result: MetaRecheckResult): boolean {
  return result.processed === 0 && result.errors.length === 0;
}

export async function processRechecks(
  deps: MetaSyncDeps,
  limit = RECHECK_BATCH_SIZE,
  runId?: string,
): Promise<MetaRecheckResult> {
  const before = deps.client.requests;
  const now = clock(deps);
  const due = await deps.repos.uvsgamesEvents.dueForRecheck(now, limit);
  // One read for the pass: watched is what earns a live event the 15-minute poll.
  const watched = await deps.repos.uvsgamesEvents.watchedTemplates();

  const result: MetaRecheckResult = {
    due: due.length,
    processed: 0,
    requests: 0,
    fetched: 0,
    players: 0,
    acceptedPlayers: 0,
    cancelRequested: false,
    errors: [],
  };

  for (const row of due) {
    await visitContained(deps, row, watched, result, runId);
    result.requests = deps.client.requests - before;
    if (runId !== undefined) {
      await heartbeat(deps, runId, result);
      if (await cancelled(deps, runId)) {
        result.cancelRequested = true;
        result.errors.push("Cancelled from the admin panel");
        break;
      }
    }
  }

  return result;
}

/**
 * One event's failure is that event's alone. An unhandled throw used to end the
 * pass before the visit reached its `setRecheck`, so the row stayed due, sorted
 * first into the next pass ten minutes later, and failed there too while every
 * event queued behind it went unvisited. The same hour's grace a failed read
 * gets is what breaks that loop.
 */
async function visitContained(
  deps: MetaSyncDeps,
  row: UvsgamesListRow,
  watched: ReadonlyMap<string, string | null>,
  result: MetaRecheckResult,
  runId?: string,
): Promise<void> {
  try {
    await visit(deps, row, watched, result, runId);
  } catch (error) {
    deps.log.warn({ err: error, externalId: row.externalId }, "Recheck visit failed");
    result.errors.push(errorText(error, `Event ${row.externalId}`));
    await reschedule(deps, row, clock(deps), row.checkStage);
  }
}

/**
 * A refused read must not end a pass that is already minutes into its rows, so
 * a failed cancel check reads as "keep going" and is logged.
 */
async function cancelled(deps: MetaSyncDeps, runId: string): Promise<boolean> {
  try {
    return await runCancelRequested(deps.repos.jobRuns, runId);
  } catch (error) {
    deps.log.warn({ err: error, runId }, "Recheck cancel check failed");
    return false;
  }
}

/**
 * A pass over a published event spends minutes fetching decks at the crawl's
 * pacing, so the admin panel needs the running totals, not just the epitaph.
 */
async function heartbeat(
  deps: MetaSyncDeps,
  runId: string,
  result: MetaRecheckResult,
): Promise<void> {
  try {
    await writeRunHeartbeat(deps.repos.jobRuns, runId, result, clock(deps));
  } catch (error) {
    deps.log.warn({ err: error, runId }, "Recheck heartbeat write failed");
  }
}

async function visit(
  deps: MetaSyncDeps,
  row: UvsgamesListRow,
  watched: ReadonlyMap<string, string | null>,
  result: MetaRecheckResult,
  runId?: string,
): Promise<void> {
  const now = clock(deps);
  const refreshed = await refreshStatus(deps, row, now, result.errors);
  if (refreshed === null) {
    // The source could not be read this pass. Come back in an hour rather than
    // hammering a failing endpoint every ten minutes.
    await reschedule(deps, row, now, row.checkStage);
    return;
  }

  const decision = nextRecheck({
    now,
    checkStage: refreshed.checkStage,
    displayStatus: refreshed.displayStatus,
    startAt: refreshed.startAt,
    decklistStatus: refreshed.decklistStatus,
    fetched: refreshed.fetched,
    decksComplete: refreshed.decksComplete,
    playersPending: refreshed.playersPending,
    watched:
      refreshed.row.eventConfigurationTemplate !== null &&
      watched.has(refreshed.row.eventConfigurationTemplate),
  });

  if (decision.deepFetch) {
    const fetched = await deepFetchEvent(deps, refreshed.row, runId, refreshed.detail);
    result.fetched++;
    result.players += fetched.players;
    result.acceptedPlayers += fetched.acceptedPlayers;
    result.errors.push(...fetched.errors);
  }

  await deps.repos.uvsgamesEvents.setRecheck(row.externalId, {
    nextCheckAt: decision.nextCheckAt,
    checkStage: decision.checkStage,
  });
  // Counted where the visit ends, so a row that threw on the way is a failure
  // in the run's errors rather than a number saying the pass handled it.
  result.processed++;
}

interface RefreshedRow {
  row: UvsgamesListRow;
  /** The detail row this read already paid for, handed on to the deep fetch. */
  detail: unknown;
  checkStage: number;
  displayStatus: string;
  startAt: Date;
  decklistStatus: string | null;
  fetched: boolean;
  decksComplete: boolean;
  playersPending: boolean;
}

/**
 * One request: the event's own detail row, which carries the same fields the
 * listing does. Upserting it keeps the catalogue current for an event the
 * daily sync has already aged past.
 */
async function refreshStatus(
  deps: MetaSyncDeps,
  row: UvsgamesListRow,
  now: Date,
  errors: string[],
): Promise<RefreshedRow | null> {
  const detail = await readDetail(deps, row.externalId, errors);
  if (detail === null) {
    return null;
  }
  const projection = projectCatalogRow(detail);
  if (projection === null) {
    errors.push(`Event ${row.externalId}: detail carried no readable projection`);
    return null;
  }
  await deps.repos.uvsgamesEvents.upsertBatch([projection], now);

  // Every "have we got this yet" question the ladder asks is a mirror query
  // now, where it used to walk the staged raw payload in application code.
  const [standings, coverage] = await Promise.all([
    deps.repos.uvsgamesResults.standings(row.externalId),
    deps.repos.uvsgamesResults.deckCoverage(row.externalId),
  ]);

  return {
    row: { ...row, ...projection },
    detail,
    checkStage: row.checkStage,
    displayStatus: projection.displayStatus,
    startAt: projection.startAt,
    decklistStatus: projection.decklistStatus,
    // The completion marker, not "the mirror holds rows": a cancelled event
    // legitimately has zero standings and must still count as fetched.
    fetched: row.resultsFetchedAt !== null,
    decksComplete: coverage.outstanding.length === 0,
    // A standing the mirror holds but no live row carries is work promotion
    // has not finished, which is what keeps the ladder visiting.
    playersPending:
      standings.length > 0 && (await liveLagsMirror(deps, row.externalId, standings.length)),
  };
}

/** Whether the live event carries fewer standings rows than the mirror holds. */
async function liveLagsMirror(
  deps: MetaSyncDeps,
  externalId: string,
  mirrored: number,
): Promise<boolean> {
  const source = await deps.repos.meta.sourceByKey(UVSGAMES_PROVIDER, externalId);
  if (source === undefined) {
    return false;
  }
  const live = await deps.repos.meta.rawStandingsForEvent(source.metaEventId);
  return live.length < mirrored;
}

async function readDetail(
  deps: MetaSyncDeps,
  externalId: string,
  errors: string[],
): Promise<unknown> {
  try {
    return await deps.client.get<unknown>(`/api/v2/events/${externalId}/`);
  } catch (error) {
    errors.push(errorText(error, `Event ${externalId} detail`));
    return null;
  }
}

/** An hour's grace after a failed read, without advancing the ladder. */
async function reschedule(
  deps: MetaSyncDeps,
  row: UvsgamesListRow,
  now: Date,
  checkStage: number,
): Promise<void> {
  await deps.repos.uvsgamesEvents.setRecheck(row.externalId, {
    nextCheckAt: new Date(now.getTime() + 60 * 60 * 1000),
    checkStage,
  });
}
