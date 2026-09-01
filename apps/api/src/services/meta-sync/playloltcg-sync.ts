import { DECKLIST_PUBLISHED, nextRecheck } from "../../lib/meta-recheck-schedule.js";
import {
  PLAYLOLTCG_STATUS_IN_PROGRESS,
  projectEventRow,
  projectShopRow,
} from "../../lib/playloltcg-catalog.js";
import type {
  PlayloltcgListRow,
  PlayloltcgUpsertInput,
} from "../../repositories/playloltcg-events.js";
import { runCancelRequested, writeRunHeartbeat } from "./crawl-checkpoint.js";
import { errorText } from "./deps.js";
import { autoAcceptPlayloltcgEvents } from "./playloltcg-accept.js";
import { MAX_PAGE_SIZE, PlayloltcgBlockedError } from "./playloltcg-client.js";
import type { PlayloltcgDeepFetchResult, PlayloltcgDetailFacts } from "./playloltcg-deep-fetch.js";
import { playloltcgDeepFetch, readPlayloltcgDetail } from "./playloltcg-deep-fetch.js";
import type { PlayloltcgSyncDeps } from "./playloltcg-deps.js";
import { clock } from "./playloltcg-deps.js";
import type { MetaSyncResultBase } from "./result.js";
import { emptyMetaSyncResult } from "./result.js";

/**
 * The scheduled playloltcg crawls. Discovery is the global date-window listing,
 * so a week is one page and the whole shape mirrors uvsgames: a windowed sync,
 * a recheck queue, and a manual date-chunked backfill.
 *
 * A refusal from the source's WAF holds for hours, so a blocked run records a
 * cool-down instant in its result and the next run waits until it passes.
 */

const EVENTS_PATH = "/xcx/activityShop/page";
const SHOPS_PATH = "/xcx/shop/searchShop";

const DAY_MS = 24 * 60 * 60 * 1000;
const SYNC_LOOKBACK_DAYS = 7;
const FUTURE_HORIZON_DAYS = 730;
const BACKFILL_CHUNK_DAYS = 14;
/** The first day the backfill asks about, comfortably before the CN launch. */
const ARCHIVE_START = new Date("2025-06-01T00:00:00Z");

/** How long a refusal stands the source down. */
const COOLDOWN_HOURS = 6;
const HOUR_MS = 60 * 60 * 1000;

/** The ceiling on collected error lines, so one bad run cannot fill `job_runs`. */
const MAX_ERRORS = 50;

export const PLAYLOLTCG_RECHECK_BATCH_SIZE = 30;

export interface PlayloltcgSyncResult extends MetaSyncResultBase {
  /** Registry shops upserted this run. */
  shops: number;
  /** True when the WAF blocked the run. */
  blocked: boolean;
  /** ISO instant the next run should wait until, set when blocked. */
  blockedUntil: string | null;
}

function emptyResult(): PlayloltcgSyncResult {
  return { ...emptyMetaSyncResult(), shops: 0, blocked: false, blockedUntil: null };
}

export function isPlayloltcgSyncNoop(result: PlayloltcgSyncResult): boolean {
  return (
    result.inserted === 0 &&
    result.changed === 0 &&
    result.missing === 0 &&
    result.autoAccepted === 0 &&
    !result.blocked
  );
}

export interface PlayloltcgRecheckResult {
  due: number;
  processed: number;
  requests: number;
  fetched: number;
  players: number;
  acceptedPlayers: number;
  blocked: boolean;
  blockedUntil: string | null;
  errors: string[];
}

export function isPlayloltcgRecheckNoop(result: PlayloltcgRecheckResult): boolean {
  return result.processed === 0 && !result.blocked && result.errors.length === 0;
}

function day(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shift(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS);
}

/** The instant the source is left alone until, after a refusal at `now`. */
function cooldownUntil(now: Date): string {
  return new Date(now.getTime() + COOLDOWN_HOURS * HOUR_MS).toISOString();
}

/** Collected up to a ceiling: a run that fails per event must not fill `job_runs`. */
function record(errors: string[], messages: readonly string[]): void {
  for (const message of messages) {
    if (errors.length >= MAX_ERRORS) {
      return;
    }
    errors.push(message);
  }
}

/**
 * Whether the last run of this kind left a cool-down that has not passed. Read
 * from `job_runs`, the same place the backfill reads its resume point.
 */
export async function playloltcgCoolingDown(
  deps: PlayloltcgSyncDeps,
  kind: string,
  now: Date,
): Promise<boolean> {
  const prior = await deps.repos.jobRuns.findLatestForResume(kind);
  const result = prior?.result as { blockedUntil?: unknown } | null | undefined;
  const until = result?.blockedUntil;
  return typeof until === "string" && new Date(until).getTime() > now.getTime();
}

function markBlocked(result: PlayloltcgSyncResult, now: Date): void {
  result.blocked = true;
  result.complete = false;
  result.blockedUntil = cooldownUntil(now);
}

/** The page ceiling for one window, at 10k rows a page. */
const MAX_WINDOW_PAGES = 100;

/** One date-window page walk, upserting each page. Returns the touched keys. */
async function crawlWindow(
  deps: PlayloltcgSyncDeps,
  result: PlayloltcgSyncResult,
  from: Date,
  to: Date,
  seenAt: Date,
  touched: number[],
): Promise<void> {
  let page = 1;
  let read = 0;
  for (let guard = 0; guard < MAX_WINDOW_PAGES; guard++) {
    const body = await deps.client.postList<unknown>(EVENTS_PATH, {
      pageNum: page,
      pageSize: MAX_PAGE_SIZE,
      searchContent: "",
      battleMode: "",
      isSubmitCardGroup: "",
      sortWeight: "",
      userLocation: {},
      startTime: day(from),
      endTime: day(to),
    });
    read += body.items.length;
    result.rows += body.items.length;
    const projections: PlayloltcgUpsertInput[] = [];
    for (const raw of body.items) {
      const projection = projectEventRow(raw);
      if (projection !== null) {
        projections.push(projection);
      }
    }
    const written = await deps.repos.playloltcgEvents.upsertBatch(projections, seenAt);
    result.inserted += written.inserted.length;
    result.changed += written.changed.length;
    result.unchanged += written.unchanged.length;
    touched.push(...written.inserted, ...written.changed);
    // Against this window's own total, never the run's cumulative row count:
    // a second window would otherwise stop after its first page.
    if (body.items.length < MAX_PAGE_SIZE || read >= body.total) {
      return;
    }
    page++;
  }
  result.complete = false;
  record(result.errors, [
    `Window ${day(from)}..${day(to)} exceeded ${MAX_WINDOW_PAGES} pages; the rest was not read.`,
  ]);
}

/** Refreshes the store directory from the registry — one call for all ~1,515. */
async function syncShops(deps: PlayloltcgSyncDeps, result: PlayloltcgSyncResult): Promise<void> {
  const body = await deps.client.postList<unknown>(SHOPS_PATH, {
    pageNum: 1,
    pageSize: MAX_PAGE_SIZE,
    name: "",
    lon: 116.4,
    lat: 39.9,
  });
  const shops = body.items.map((raw) => projectShopRow(raw)).filter((s) => s !== null);
  result.shops = await deps.repos.playloltcgEvents.upsertShops(shops);
}

async function finish(
  deps: PlayloltcgSyncDeps,
  result: PlayloltcgSyncResult,
  touched: number[],
): Promise<void> {
  const auto = await autoAcceptPlayloltcgEvents(deps, [...new Set(touched)]);
  result.autoAccepted = auto.accepted;
  record(result.errors, auto.errors);
  result.requests = deps.client.requests;
}

/**
 * The daily sync: refresh the store registry, then crawl `[now − 7d, now +
 * horizon]`. The past slice flags rows a covering crawl dropped; the future
 * slice discovers new listings. One page unless a window ever exceeds 10k.
 */
export async function syncPlayloltcgCatalog(
  deps: PlayloltcgSyncDeps,
): Promise<PlayloltcgSyncResult> {
  const result = emptyResult();
  const now = clock(deps);
  const from = shift(now, -SYNC_LOOKBACK_DAYS);
  const touched: number[] = [];
  try {
    await syncShops(deps, result);
    await crawlWindow(deps, result, from, shift(now, FUTURE_HORIZON_DAYS), now, touched);
    // Only a run that covered the whole window may call a stored row dropped: a
    // gap in coverage is indistinguishable from a row the source stopped listing.
    if (result.complete) {
      result.missing = await deps.repos.playloltcgEvents.markMissing({
        from: day(from),
        to: day(now),
        seenBefore: now,
        at: now,
      });
    }
  } catch (error) {
    if (error instanceof PlayloltcgBlockedError) {
      markBlocked(result, now);
    } else {
      throw error;
    }
  }
  await finish(deps, result, touched);
  return result;
}

/**
 * An hour's grace after a pass the source could not answer, leaving the ladder
 * where it stands. Advancing it on a failure would decay a finished event's
 * revisits, and rewinding it to stage 0 would put a completed event back on the
 * event-day poll.
 */
async function grace(
  deps: PlayloltcgSyncDeps,
  activityShopId: number,
  now: Date,
  checkStage: number,
): Promise<void> {
  await deps.repos.playloltcgEvents.setRecheck(activityShopId, {
    nextCheckAt: new Date(now.getTime() + HOUR_MS),
    checkStage,
  });
}

/** The source's lifecycle read in the shared ladder's vocabulary. */
function displayStatusOf(detail: PlayloltcgDetailFacts, status: number | null): string {
  if (detail.isPublishResult) {
    return "complete";
  }
  return status === PLAYLOLTCG_STATUS_IN_PROGRESS ? "inProgress" : "upcoming";
}

/** The event's start as an instant, from the `YYYY-MM-DD` the source publishes. */
function startInstant(startAt: string | null, fallback: Date): Date {
  return startAt === null ? fallback : new Date(`${startAt}T00:00:00Z`);
}

/**
 * The recheck ladder for accepted events. Each visit reads the cheap detail
 * first; only a published event pays for the full standings-and-decks fetch,
 * after which the decaying ladder revisits for late changes.
 */
export async function processPlayloltcgRechecks(
  deps: PlayloltcgSyncDeps,
  limit = PLAYLOLTCG_RECHECK_BATCH_SIZE,
): Promise<PlayloltcgRecheckResult> {
  const now = clock(deps);
  const result: PlayloltcgRecheckResult = {
    due: 0,
    processed: 0,
    requests: 0,
    fetched: 0,
    players: 0,
    acceptedPlayers: 0,
    blocked: false,
    blockedUntil: null,
    errors: [],
  };
  const due = await deps.repos.playloltcgEvents.dueForRecheck(now, limit);
  result.due = due.length;

  try {
    for (const row of due) {
      await visitContained(deps, row, now, result);
    }
  } catch (error) {
    if (error instanceof PlayloltcgBlockedError) {
      result.blocked = true;
      result.blockedUntil = cooldownUntil(now);
    } else {
      throw error;
    }
  }
  result.requests = deps.client.requests;
  return result;
}

/**
 * One event's failure is that event's alone. An unhandled throw used to end the
 * pass before the visit set the next check, so the row stayed due, sorted first
 * into the next pass, and failed there too while the events behind it went
 * unvisited. A block still ends the pass: the source is telling the whole crawl
 * to stop.
 */
async function visitContained(
  deps: PlayloltcgSyncDeps,
  row: PlayloltcgListRow,
  now: Date,
  result: PlayloltcgRecheckResult,
): Promise<void> {
  try {
    await visitPlayloltcgEvent(deps, row, now, result);
  } catch (error) {
    if (error instanceof PlayloltcgBlockedError) {
      throw error;
    }
    deps.log.warn({ err: error, activityShopId: row.activityShopId }, "Recheck visit failed");
    result.errors.push(errorText(error, `Event ${row.activityShopId}`));
    await grace(deps, row.activityShopId, now, row.checkStage);
  }
}

async function visitPlayloltcgEvent(
  deps: PlayloltcgSyncDeps,
  row: PlayloltcgListRow,
  now: Date,
  result: PlayloltcgRecheckResult,
): Promise<void> {
  const detailErrors: string[] = [];
  const detail = await readPlayloltcgDetail(deps, row.activityShopId, detailErrors);
  record(result.errors, detailErrors);
  if (detail === null) {
    await grace(deps, row.activityShopId, now, row.checkStage);
    return;
  }
  if (detail.shopId !== null) {
    await deps.repos.playloltcgEvents.linkShopFromDetail(row.activityShopId, {
      id: detail.shopId,
      name: detail.shopName ?? row.shopName ?? String(detail.shopId),
    });
  }
  const coverage = await deps.repos.playloltcgResults.deckCoverage(row.activityShopId);
  // The same ladder as uvsgames, through the shared decision. The source's
  // `isPublishResult` is its "complete", since results are final once it is
  // set, and it publishes standings and decks in one act, so the decklists
  // are published exactly when the results are.
  const decision = nextRecheck({
    now,
    checkStage: row.checkStage,
    displayStatus: displayStatusOf(detail, row.status),
    startAt: startInstant(row.startAt, now),
    decklistStatus: detail.isPublishResult ? DECKLIST_PUBLISHED : null,
    fetched: row.fetchedAt !== null,
    decksComplete: coverage.outstanding.length === 0,
    playersPending: false,
    watched: false,
  });
  if (decision.deepFetch) {
    const fetched = await playloltcgDeepFetch(deps, row, detail);
    result.fetched++;
    result.players += fetched.players;
    result.acceptedPlayers += fetched.acceptedPlayers;
    record(result.errors, fetched.errors);
    if (!fetched.complete) {
      await grace(deps, row.activityShopId, now, row.checkStage);
      return;
    }
  }
  await deps.repos.playloltcgEvents.setRecheck(row.activityShopId, {
    nextCheckAt: decision.nextCheckAt,
    checkStage: decision.checkStage,
  });
  result.processed++;
}

/**
 * Pulls one accepted event out of turn, for the catalogue's Fetch now. It reads
 * the detail the ladder would have read and then deep-fetches whatever the
 * source has, without touching the recheck queue: a manual pull answers "what
 * does the source hold right now", and pushing the ladder forward on the back of
 * it would skip the visit that catches a late correction.
 *
 * @param deps - The source's sync dependencies.
 * @param row - The accepted catalogue row.
 * @returns The deep fetch's counters, with `complete` false when the detail was unreadable.
 */
export async function fetchPlayloltcgEvent(
  deps: PlayloltcgSyncDeps,
  row: PlayloltcgListRow,
): Promise<PlayloltcgDeepFetchResult> {
  const errors: string[] = [];
  const detail = await readPlayloltcgDetail(deps, row.activityShopId, errors);
  if (detail === null) {
    return {
      activityShopId: row.activityShopId,
      requests: deps.client.requests,
      players: 0,
      decks: 0,
      acceptedPlayers: 0,
      skippedPlayers: 0,
      shopId: null,
      publishedResults: false,
      complete: false,
      errors,
    };
  }
  const result = await playloltcgDeepFetch(deps, row, detail);
  return { ...result, errors: [...errors, ...result.errors] };
}

export interface PlayloltcgBackfillOptions {
  resumeFrom?: Date;
}

/**
 * The manual date-chunked catalogue backfill. Cheap — the whole archive's
 * events are a couple of dozen page reads — because standings and decks come
 * later through the recheck ladder once an event is accepted. Checkpoints per
 * chunk so a block resumes from the last day covered.
 */
export async function backfillPlayloltcg(
  deps: PlayloltcgSyncDeps,
  runId?: string,
  options: PlayloltcgBackfillOptions = {},
): Promise<PlayloltcgSyncResult> {
  const result = emptyResult();
  const now = clock(deps);
  const to = shift(now, FUTURE_HORIZON_DAYS);
  const resumeFrom = options.resumeFrom;
  let from = resumeFrom === undefined ? ARCHIVE_START : new Date(resumeFrom.getTime() + DAY_MS);
  if (resumeFrom !== undefined) {
    result.resumedFrom = resumeFrom.toISOString();
    result.coveredThrough = day(resumeFrom);
  }
  const touched: number[] = [];
  try {
    await syncShops(deps, result);
    while (from.getTime() <= to.getTime()) {
      const chunkTo = shift(from, BACKFILL_CHUNK_DAYS - 1);
      const windowTo = chunkTo.getTime() > to.getTime() ? to : chunkTo;
      await crawlWindow(deps, result, from, windowTo, now, touched);
      result.coveredThrough = day(windowTo);
      from = shift(windowTo, 1);
      // Between chunks, write progress and honor a Stop from the admin panel —
      // the same cooperative-cancel the uvsgames backfill uses.
      if (runId !== undefined) {
        result.requests = deps.client.requests;
        if (await runCancelRequested(deps.repos.jobRuns, runId)) {
          result.cancelRequested = true;
          result.complete = false;
          break;
        }
        await writeRunHeartbeat(deps.repos.jobRuns, runId, result, clock(deps));
      }
    }
  } catch (error) {
    if (error instanceof PlayloltcgBlockedError) {
      markBlocked(result, now);
    } else {
      throw error;
    }
  }
  await finish(deps, result, touched);
  return result;
}
