import { UVSGAMES_PROVIDER } from "../../../../lib/meta-providers.js";
import { nextRecheck } from "../../lib/meta-recheck-schedule.js";
import { projectCatalogRow } from "../../lib/uvsgames-catalog.js";
import type { UvsgamesListRow } from "../../repositories/uvsgames-events.js";
import { runCancelRequested, writeRunHeartbeat } from "./crawl-checkpoint.js";
import { deepFetchEvent } from "./deep-fetch.js";
import type { MetaSyncDeps } from "./deps.js";
import { clock, errorText } from "./deps.js";

export const RECHECK_BATCH_SIZE = 40;

export interface MetaRecheckResult {
  due: number;
  processed: number;
  requests: number;
  fetched: number;
  players: number;
  acceptedPlayers: number;
  cancelRequested: boolean;
  errors: string[];
}

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

// A throw here must not abort the pass, or the failing row stays due and
// blocks every row queued behind it.
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

// A failed cancel check must not abort the pass; log and keep going.
async function cancelled(deps: MetaSyncDeps, runId: string): Promise<boolean> {
  try {
    return await runCancelRequested(deps.repos.jobRuns, runId);
  } catch (error) {
    deps.log.warn({ err: error, runId }, "Recheck cancel check failed");
    return false;
  }
}

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
    // Failed read: retry in an hour, not the ten-minute cadence.
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
  // Counted here, not at entry, so a row that throws mid-visit lands in errors.
  result.processed++;
}

interface RefreshedRow {
  row: UvsgamesListRow;
  detail: unknown;
  checkStage: number;
  displayStatus: string;
  startAt: Date;
  decklistStatus: string | null;
  fetched: boolean;
  decksComplete: boolean;
  playersPending: boolean;
}

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
    // A cancelled event has zero standings and must still count as fetched.
    fetched: row.resultsFetchedAt !== null,
    decksComplete: coverage.outstanding.length === 0,
    // True while a standing the mirror holds has no live row yet: promotion
    // is still in flight.
    playersPending:
      standings.length > 0 && (await liveLagsMirror(deps, row.externalId, standings.length)),
  };
}

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
