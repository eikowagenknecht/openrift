import type { UvsgamesCatalogProjection } from "../../lib/uvsgames-catalog.js";
import { projectCatalogRow } from "../../lib/uvsgames-catalog.js";
import type { UvsgamesIdProbeInput } from "../../repositories/uvsgames-events.js";
import { autoAcceptCatalogEvents } from "./accept.js";
import { runCancelRequested, writeRunHeartbeat } from "./crawl-checkpoint.js";
import type { MetaSyncDeps } from "./deps.js";
import { clock, errorText } from "./deps.js";
import type { MetaSyncResultBase } from "./result.js";
import { emptyMetaSyncResult } from "./result.js";
import { UvsHttpError } from "./uvsgames-client.js";

/**
 * The id sweep (ADR-014), the only path to an event the listing refuses to
 * serve — an `UNLISTED`/`CANCELED` event, reachable by id alone. One request
 * per id makes this the most expensive job here: a per-run budget bounds the
 * slice, and `uvsgames_id_probes` is why no id is ever paid for twice.
 */

/** The source's own name for this archive's game, on the detail endpoint. */
const RIFTBOUND_GAME_TYPE = "RIFTBOUND";

/** Its numeric id, read when the row carries no `game_type`. */
const RIFTBOUND_GAME_ID = 3;

/** One run's ceiling. About 50 minutes at the client's pacing. */
export const MAX_PROBES_PER_SWEEP = 5000;

/** How many undecided ids one candidate query hands back. */
const CANDIDATE_PAGE = 500;

/** Probes between writes. A run that dies loses at most this many. */
const FLUSH_PROBES = 50;

/** How often a long sweep reports progress and re-reads the cancel flag. */
const HEARTBEAT_PROBES = 100;

/** This many failures in a row means the source is down, not a bad row. */
const MAX_CONSECUTIVE_FAILURES = 20;

const MAX_ERRORS = 50;

export interface MetaIdSweepResult extends MetaSyncResultBase {
  /** Ids asked about. `requests` is larger when a retry happens. */
  probed: number;
  /** Ids that turned out to be this game's, and so became mirror rows. */
  found: number;
  /** Undecided ids left in the range when the run stopped. */
  remaining: number;
  /** Ids belonging to another game the source runs. */
  otherGame: number;
  /** Ids the source has no event for. */
  absent: number;
  /** Ids this game's, in a shape with no usable id, name, or start. */
  unreadable: number;
  /** Ids that errored and stay undecided, for the next run to retry. */
  failed: number;
  /**
   * The range walked, `from..to`. A string, not two numbers: the run summary
   * treats every number in a result as a counter.
   */
  range: string | null;
}

/** Field order matters: the run summary shows the first few keys. */
function emptyResult(): MetaIdSweepResult {
  return {
    probed: 0,
    found: 0,
    remaining: 0,
    otherGame: 0,
    absent: 0,
    unreadable: 0,
    failed: 0,
    range: null,
    ...emptyMetaSyncResult(),
  };
}

export function isIdSweepNoop(result: MetaIdSweepResult): boolean {
  return !result.cancelRequested && result.probed === 0 && result.failed === 0;
}

/** `fromId`/`toId` default to the mirror's own id span. */
export interface IdSweepOptions {
  fromId?: number;
  toId?: number;
  maxProbes?: number;
}

interface SweepContext {
  result: MetaIdSweepResult;
  seenAt: Date;
  maxProbes: number;
  runId?: string;
  /** Projections and probe rows held until the next flush. */
  pendingRows: UvsgamesCatalogProjection[];
  pendingProbes: UvsgamesIdProbeInput[];
  /** Keys this run inserted or changed, which the auto-accept sweep reads. */
  touched: string[];
  probesAtLastBeat: number;
  consecutiveFailures: number;
  stopped: boolean;
}

function record(ctx: SweepContext, message: string): void {
  if (ctx.result.errors.length < MAX_ERRORS) {
    ctx.result.errors.push(message);
  }
}

/** A failure isn't a probe: it stays undecided so the next run retries it. */
type ProbeOutcome =
  | { kind: "event"; projection: UvsgamesCatalogProjection }
  | { kind: "probe"; probe: UvsgamesIdProbeInput }
  | { kind: "failed" };

function gameTypeOf(body: unknown): { type: string | null; isRiftbound: boolean } {
  const row = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const type = typeof row.game_type === "string" && row.game_type !== "" ? row.game_type : null;
  return {
    type,
    isRiftbound: type === null ? row.game === RIFTBOUND_GAME_ID : type === RIFTBOUND_GAME_TYPE,
  };
}

async function probeId(deps: MetaSyncDeps, ctx: SweepContext, id: number): Promise<ProbeOutcome> {
  let body: unknown;
  try {
    body = await deps.client.get<unknown>(`/api/v2/events/${id}/`);
  } catch (error) {
    if (error instanceof UvsHttpError && error.status === 404) {
      return { kind: "probe", probe: { externalId: id, outcome: "absent", gameType: null } };
    }
    record(ctx, errorText(error, `Event ${id}`));
    return { kind: "failed" };
  }

  const game = gameTypeOf(body);
  if (!game.isRiftbound) {
    return { kind: "probe", probe: { externalId: id, outcome: "other_game", gameType: game.type } };
  }
  const projection = projectCatalogRow(body);
  if (projection === null) {
    return { kind: "probe", probe: { externalId: id, outcome: "unreadable", gameType: game.type } };
  }
  return { kind: "event", projection };
}

/** Flushes the pending batch, so a run that dies keeps what it decided. */
async function flush(deps: MetaSyncDeps, ctx: SweepContext): Promise<void> {
  if (ctx.pendingRows.length > 0) {
    const written = await deps.repos.uvsgamesEvents.upsertBatch(ctx.pendingRows, ctx.seenAt);
    ctx.result.inserted += written.inserted.length;
    ctx.result.changed += written.changed.length;
    ctx.result.unchanged += written.unchanged.length;
    ctx.touched.push(...written.inserted, ...written.changed);
    ctx.pendingRows = [];
  }
  if (ctx.pendingProbes.length > 0) {
    await deps.repos.uvsgamesEvents.recordProbes(ctx.pendingProbes);
    ctx.pendingProbes = [];
  }
}

/**
 * Logged, not thrown: a failed write must not kill a run 40 minutes in. The
 * same beat is how an admin's Stop reaches a job already running.
 */
async function heartbeat(deps: MetaSyncDeps, ctx: SweepContext): Promise<void> {
  const runId = ctx.runId;
  if (runId === undefined) {
    return;
  }
  try {
    if (await runCancelRequested(deps.repos.jobRuns, runId)) {
      ctx.stopped = true;
      ctx.result.cancelRequested = true;
      ctx.result.complete = false;
      record(ctx, "Cancelled from the admin panel");
    }
    await writeRunHeartbeat(deps.repos.jobRuns, runId, ctx.result, clock(deps));
  } catch (error) {
    deps.log.warn({ err: error, runId }, "Id sweep heartbeat write failed");
  }
}

function apply(ctx: SweepContext, outcome: ProbeOutcome): void {
  ctx.result.probed++;
  ctx.result.rows++;
  switch (outcome.kind) {
    case "event": {
      ctx.result.found++;
      ctx.pendingRows.push(outcome.projection);
      break;
    }
    case "probe": {
      const counter = outcome.probe.outcome;
      if (counter === "other_game") {
        ctx.result.otherGame++;
      } else if (counter === "absent") {
        ctx.result.absent++;
      } else {
        ctx.result.unreadable++;
      }
      ctx.pendingProbes.push(outcome.probe);
      break;
    }
    case "failed": {
      ctx.result.failed++;
      ctx.result.complete = false;
      ctx.consecutiveFailures++;
      if (ctx.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        ctx.stopped = true;
        record(ctx, `Stopped after ${ctx.consecutiveFailures} probes failed in a row`);
      }
      return;
    }
  }
  ctx.consecutiveFailures = 0;
}

/**
 * Walks the range page by page from a forward-only cursor. An errored id is
 * left undecided, so without the cursor the same id would repeat forever.
 */
async function sweepRange(
  deps: MetaSyncDeps,
  ctx: SweepContext,
  fromId: number,
  toId: number,
): Promise<void> {
  let cursor = fromId;
  while (!ctx.stopped && ctx.result.probed < ctx.maxProbes && cursor <= toId) {
    const budget = Math.min(CANDIDATE_PAGE, ctx.maxProbes - ctx.result.probed);
    const candidates = await deps.repos.uvsgamesEvents.sweepCandidates(cursor, toId, budget);
    const last = candidates.at(-1);
    if (last === undefined) {
      return;
    }
    cursor = last + 1;

    for (const id of candidates) {
      if (ctx.stopped || ctx.result.probed >= ctx.maxProbes) {
        break;
      }
      apply(ctx, await probeId(deps, ctx, id));
      if (ctx.pendingRows.length + ctx.pendingProbes.length >= FLUSH_PROBES) {
        await flush(deps, ctx);
      }
      if (ctx.result.probed - ctx.probesAtLastBeat >= HEARTBEAT_PROBES) {
        ctx.probesAtLastBeat = ctx.result.probed;
        await heartbeat(deps, ctx);
      }
    }
    await flush(deps, ctx);
  }

  if (ctx.result.probed >= ctx.maxProbes) {
    ctx.result.complete = false;
    record(ctx, `Stopped at the ${ctx.maxProbes}-probe budget`);
  }
}

/**
 * One slice of the id sweep. Re-run it to continue: `uvsgames_id_probes` is
 * the resume state, so there is no checkpoint to pass.
 */
export async function sweepEventIds(
  deps: MetaSyncDeps,
  runId?: string,
  options: IdSweepOptions = {},
): Promise<MetaIdSweepResult> {
  const ctx: SweepContext = {
    result: emptyResult(),
    seenAt: clock(deps),
    maxProbes: options.maxProbes ?? MAX_PROBES_PER_SWEEP,
    runId,
    pendingRows: [],
    pendingProbes: [],
    touched: [],
    probesAtLastBeat: 0,
    consecutiveFailures: 0,
    stopped: false,
  };

  const stored = await deps.repos.uvsgamesEvents.sweepBounds();
  const fromId = options.fromId ?? stored?.fromId;
  const toId = options.toId ?? stored?.toId;
  if (fromId === undefined || toId === undefined || fromId > toId) {
    // A backwards window is a typo, not an intentional empty sweep.
    record(ctx, "No id range to sweep");
    ctx.result.complete = false;
    return ctx.result;
  }
  ctx.result.range = `${fromId}..${toId}`;

  const requestsBefore = deps.client.requests;
  await sweepRange(deps, ctx, fromId, toId);
  await flush(deps, ctx);

  const auto = await autoAcceptCatalogEvents(deps, [...new Set(ctx.touched)]);
  ctx.result.autoAccepted = auto.accepted;
  for (const message of auto.errors) {
    record(ctx, message);
  }
  ctx.result.remaining = await deps.repos.uvsgamesEvents.sweepRemaining(fromId, toId);
  ctx.result.requests = deps.client.requests - requestsBefore;
  return ctx.result;
}
