import type { UvsgamesCatalogProjection } from "../../lib/uvsgames-catalog.js";
import { projectCatalogRow } from "../../lib/uvsgames-catalog.js";
import { autoAcceptCatalogEvents } from "./accept.js";
import { runCancelRequested, writeRunHeartbeat } from "./crawl-checkpoint.js";
import type { MetaSyncDeps } from "./deps.js";
import { clock, errorText, EVENTS_PATH, GAME_SLUG } from "./deps.js";
import type { MetaSyncResultBase } from "./result.js";
import { emptyMetaSyncResult } from "./result.js";
import { syncEventTemplates } from "./templates.js";
import type { UvsQuery } from "./uvsgames-client.js";
import { MAX_PAGE_SIZE } from "./uvsgames-client.js";

/**
 * The scheduled catalogue crawls.
 *
 * The listing is walked by date range, never by page number. `start_date_after`
 * and `start_date_before` are both inclusive and millisecond-precise, so a range
 * whose `count` fits in one page hands back all of it in a single request no
 * matter what order the source felt like using. That is the whole point: the
 * listing has no stable sort, and events tie on `start_datetime` in their
 * hundreds, so paging by offset returns the same event twice and drops another.
 *
 * A range too big for one page is split by time and re-asked. A range the
 * source refuses is split until the failure is cornered on a single instant,
 * which is how one unserializable row costs one row rather than a whole page.
 * Such a row answers 500 at every page size and on every retry, so cornering it
 * is the only way past.
 *
 * Unknown query parameters are ignored silently rather than rejected, which is
 * why every filter here has been checked against the live listing. These filter:
 * `game_slug`, `start_date_after`, `start_date_before`, `name`,
 * `is_headlining_event`, `event_configuration_template_ids`, and
 * `display_status` for the values `complete`, `upcoming` and `inProgress` only
 * (any other value falls through to no filter at all). These do nothing:
 * `ordering`, `event_type`, and the singular `event_configuration_template`.
 */

/** The daily sync's reach into the past. Every event crosses it as it runs. */
const SYNC_LOOKBACK_DAYS = 7;

/** The first instant the backfill asks about, comfortably before event one. */
export const ARCHIVE_START = new Date("2025-01-01T00:00:00Z");

/** How far past today a crawl of "the future" bothers to look. */
const FUTURE_HORIZON_DAYS = 730;

/**
 * How many pieces an oversized range breaks into. Splitting by the count's own
 * ratio would cut straight to leaf-sized slices, but event density swings by
 * several times between a Tuesday and a Saturday, so the deeper tree of a
 * capped fan-out costs fewer requests than re-splitting a third of the leaves.
 */
const MAX_SPLIT = 12;

/** A crawl's ceiling, so a source bug cannot turn one run into a full backfill. */
const MAX_REQUESTS_PER_CRAWL = 6000;

/** How many rows a single refused instant is walked through one at a time. */
const MAX_INSTANT_ROWS = 300;

/** Pages a refused instant probes before accepting that it cannot read any. */
const INSTANT_PROBE_PAGES = 5;

/**
 * When this many range queries fail back to back, the source is down rather
 * than holding a bad row, and splitting further only hammers it: halving a
 * refused range is the right move against one unserializable row and exactly
 * the wrong one against an outage, which would otherwise spend the whole
 * request budget bisecting a listing that answers nothing.
 */
const MAX_CONSECUTIVE_FAILURES = 20;

/** How often a long crawl writes its counters into the job_runs row. */
const HEARTBEAT_RANGES = 25;

const MAX_ERRORS = 50;
const MAX_SKIPPED = 50;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface MetaCatalogSyncResult extends MetaSyncResultBase {
  /** Listing queries that answered. `requests` is larger when retries happen. */
  ranges: number;
  /** Rows the source returned in a shape with no usable id, name, or start. */
  unreadable: number;
  /** Rows the source refused to serve, and so were never read. */
  skipped: number;
  /** Templates the source's vocabulary endpoint named on this run. */
  templatesNamed: number;
  /** Template ids the mirror carries that the endpoint no longer publishes. */
  templatesRetired: number;
  /** What the crawl could not read, in the words the run list prints. */
  skippedRanges: string[];
}

function emptyResult(): MetaCatalogSyncResult {
  return {
    ...emptyMetaSyncResult(),
    ranges: 0,
    unreadable: 0,
    skipped: 0,
    templatesNamed: 0,
    templatesRetired: 0,
    skippedRanges: [],
  };
}

/**
 * A run that touched nothing is worth marking as such in the job history. A
 * cancelled run never counts as one, however little it wrote: the admin who
 * stopped it needs to see the stop in the history.
 */
export function isCatalogSyncNoop(result: MetaCatalogSyncResult): boolean {
  return (
    !result.cancelRequested &&
    result.inserted === 0 &&
    result.changed === 0 &&
    result.missing === 0 &&
    result.autoAccepted === 0
  );
}

interface CrawlContext {
  result: MetaCatalogSyncResult;
  /** Keys the crawl inserted or changed, which are the auto-accept sweep's input. */
  touched: string[];
  seenAt: Date;
  /** Filters every request in this crawl carries on top of the date range. */
  filter: UvsQuery;
  maxRequests: number;
  requestsBefore: number;
  /** When set, partial counters land in this job_runs row as the crawl walks. */
  runId?: string;
  /** Whether coveredThrough advances as the walk moves; the crawls set it. */
  checkpoints: boolean;
  rangesAtLastBeat: number;
  consecutiveFailures: number;
  stopped: boolean;
}

function newContext(
  deps: MetaSyncDeps,
  options: { filter?: UvsQuery; maxRequests: number; runId?: string; checkpoints?: boolean },
): CrawlContext {
  return {
    result: emptyResult(),
    touched: [],
    seenAt: clock(deps),
    filter: options.filter ?? {},
    maxRequests: options.maxRequests,
    requestsBefore: deps.client.requests,
    runId: options.runId,
    checkpoints: options.checkpoints ?? false,
    rangesAtLastBeat: 0,
    consecutiveFailures: 0,
    stopped: false,
  };
}

function record(ctx: CrawlContext, message: string): void {
  if (ctx.result.errors.length < MAX_ERRORS) {
    ctx.result.errors.push(message);
  }
}

/** Marks a gap in coverage. The counters alone cannot say a crawl fell short. */
function skip(ctx: CrawlContext, detail: string): void {
  ctx.result.complete = false;
  if (ctx.result.skippedRanges.length < MAX_SKIPPED) {
    ctx.result.skippedRanges.push(detail);
  }
}

/**
 * Ranges are visited in chronological order, so a finished range means every
 * event starting at or before its end has been attempted. That single instant
 * is the whole resume state.
 */
function cover(ctx: CrawlContext, to: Date): void {
  if (ctx.checkpoints) {
    ctx.result.coveredThrough = to.toISOString();
  }
}

function spent(deps: MetaSyncDeps, ctx: CrawlContext): number {
  return deps.client.requests - ctx.requestsBefore;
}

/**
 * The budget check and the heartbeat, run before every request. A crawl that
 * stops here has to say so: a silent halt reads as complete coverage, which is
 * exactly the lie that left a third of the catalogue stale for a week.
 */
async function keepGoing(deps: MetaSyncDeps, ctx: CrawlContext): Promise<boolean> {
  if (ctx.stopped) {
    return false;
  }
  if (spent(deps, ctx) >= ctx.maxRequests) {
    ctx.stopped = true;
    ctx.result.complete = false;
    record(ctx, `Stopped at the ${ctx.maxRequests}-request budget`);
    return false;
  }
  if (ctx.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    ctx.stopped = true;
    ctx.result.complete = false;
    record(ctx, `Stopped after ${ctx.consecutiveFailures} listing queries failed in a row`);
    return false;
  }
  if (ctx.result.ranges - ctx.rangesAtLastBeat >= HEARTBEAT_RANGES) {
    ctx.rangesAtLastBeat = ctx.result.ranges;
    await heartbeat(deps, ctx);
  }
  return !ctx.stopped;
}

/**
 * A failed progress write must never kill a crawl that is an hour into its
 * ranges, so the error is logged and the walk continues. The same beat re-reads
 * the row, which is how an out-of-band cancel reaches a job already running.
 */
async function heartbeat(deps: MetaSyncDeps, ctx: CrawlContext): Promise<void> {
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
    await writeRunHeartbeat(
      deps.repos.jobRuns,
      runId,
      { ...ctx.result, requests: spent(deps, ctx) },
      clock(deps),
    );
  } catch (error) {
    deps.log.warn({ err: error, runId }, "Crawl heartbeat write failed");
  }
}

function rangeLabel(from: Date, to: Date): string {
  return from.getTime() === to.getTime()
    ? from.toISOString()
    : `${from.toISOString()}..${to.toISOString()}`;
}

async function readRange(
  deps: MetaSyncDeps,
  ctx: CrawlContext,
  from: Date,
  to: Date,
  page: number,
  pageSize: number,
): Promise<{ results: unknown[]; count: number } | null> {
  try {
    const body = await deps.client.page<unknown>(
      EVENTS_PATH,
      {
        game_slug: GAME_SLUG,
        ...ctx.filter,
        start_date_after: from.toISOString(),
        start_date_before: to.toISOString(),
      },
      page,
      pageSize,
    );
    ctx.result.ranges++;
    ctx.consecutiveFailures = 0;
    return { results: body.results, count: body.count };
  } catch (error) {
    ctx.consecutiveFailures++;
    record(ctx, errorText(error, `${rangeLabel(from, to)} page ${page}`));
    return null;
  }
}

async function absorb(deps: MetaSyncDeps, ctx: CrawlContext, rows: unknown[]): Promise<void> {
  ctx.result.rows += rows.length;
  const projections: UvsgamesCatalogProjection[] = [];
  for (const raw of rows) {
    const projection = projectCatalogRow(raw);
    if (projection === null) {
      ctx.result.unreadable++;
      continue;
    }
    projections.push(projection);
  }

  const written = await deps.repos.uvsgamesEvents.upsertBatch(projections, ctx.seenAt);
  ctx.result.inserted += written.inserted.length;
  ctx.result.changed += written.changed.length;
  ctx.result.unchanged += written.unchanged.length;
  ctx.touched.push(...written.inserted, ...written.changed);
}

/**
 * How many pieces an oversized range breaks into, never fewer than two: a split
 * that handed back the same range would recurse forever.
 */
function splitParts(count: number): number {
  return Math.min(MAX_SPLIT, Math.max(2, Math.ceil(count / MAX_PAGE_SIZE)));
}

/**
 * Contiguous inclusive sub-ranges covering `[from, to]` exactly once, which is
 * what makes the walk lossless: every instant belongs to one slice, and the
 * source's own bounds are inclusive at both ends. A range narrower than `parts`
 * milliseconds yields one slice per millisecond instead.
 */
export function sliceRange(from: Date, to: Date, parts: number): { from: Date; to: Date }[] {
  const start = from.getTime();
  const points = to.getTime() - start + 1;
  const slices = Math.min(parts, points);
  const out: { from: Date; to: Date }[] = [];
  let cursor = start;
  for (let index = 1; index <= slices; index++) {
    const end = start + Math.floor((index * points) / slices) - 1;
    out.push({ from: new Date(cursor), to: new Date(end) });
    cursor = end + 1;
  }
  return out;
}

async function crawlSlices(
  deps: MetaSyncDeps,
  ctx: CrawlContext,
  from: Date,
  to: Date,
  parts: number,
): Promise<void> {
  for (const slice of sliceRange(from, to, parts)) {
    await crawlRange(deps, ctx, slice.from, slice.to);
  }
}

/**
 * Reads `[from, to]` completely, or says which part of it it could not.
 *
 * One request settles a range whose events fit in a page. Anything else is a
 * split: too many events splits by the count, and a refusal splits in half,
 * because halving is the cheapest way to corner whichever row the source
 * cannot serialize.
 */
async function crawlRange(
  deps: MetaSyncDeps,
  ctx: CrawlContext,
  from: Date,
  to: Date,
): Promise<void> {
  if (!(await keepGoing(deps, ctx))) {
    return;
  }

  const body = await readRange(deps, ctx, from, to, 1, MAX_PAGE_SIZE);
  if (body === null) {
    if (from.getTime() < to.getTime()) {
      await crawlSlices(deps, ctx, from, to, 2);
      return;
    }
    await salvageInstant(deps, ctx, from);
    cover(ctx, to);
    return;
  }

  // The slices re-read this whole range, page one included, so absorbing it
  // here first would count every row on it twice in the run's summary.
  if (body.count > body.results.length && from.getTime() < to.getTime()) {
    await crawlSlices(deps, ctx, from, to, splitParts(body.count));
    return;
  }

  await absorb(deps, ctx, body.results);
  if (body.count > body.results.length) {
    await drainInstant(deps, ctx, from, body.count);
  }
  cover(ctx, to);
}

/**
 * An instant carrying more events than one page holds. Time cannot split it any
 * further, so this is the one place left that pages by offset, and the one
 * place the listing's unstable tie order can still drop a row.
 */
async function drainInstant(
  deps: MetaSyncDeps,
  ctx: CrawlContext,
  at: Date,
  count: number,
): Promise<void> {
  const pages = Math.ceil(count / MAX_PAGE_SIZE);
  for (let page = 2; page <= pages; page++) {
    if (!(await keepGoing(deps, ctx))) {
      return;
    }
    const body = await readRange(deps, ctx, at, at, page, MAX_PAGE_SIZE);
    if (body === null) {
      skip(ctx, `${at.toISOString()} page ${page}`);
      continue;
    }
    await absorb(deps, ctx, body.results);
  }
}

/**
 * One instant the source refused to serve as a page, walked a row at a time so
 * the row that breaks its serializer is the only thing lost. The row count
 * comes from the first page that answers, which is why the walk keeps probing
 * past a failure instead of giving up on the first one.
 */
async function salvageInstant(deps: MetaSyncDeps, ctx: CrawlContext, at: Date): Promise<void> {
  let total: number | null = null;
  let page = 1;

  while (page <= Math.min(total ?? INSTANT_PROBE_PAGES, MAX_INSTANT_ROWS)) {
    if (!(await keepGoing(deps, ctx))) {
      return;
    }
    const body = await readRange(deps, ctx, at, at, page, 1);
    if (body === null) {
      ctx.result.skipped++;
      skip(ctx, `${at.toISOString()} row ${page}`);
      page++;
      continue;
    }
    total = body.count;
    await absorb(deps, ctx, body.results);
    page++;
  }

  if (total === null) {
    skip(ctx, `${at.toISOString()} (unreadable at every probed row)`);
  }
}

/**
 * The template refresh runs after the crawl rather than before it, so a
 * template id the crawl just met gets its row in the same run. A crawl that
 * stopped short skips it: the run is over, and it would spend one more request.
 */
async function finish(deps: MetaSyncDeps, ctx: CrawlContext): Promise<MetaCatalogSyncResult> {
  const auto = await autoAcceptCatalogEvents(deps, [...new Set(ctx.touched)]);
  ctx.result.autoAccepted = auto.accepted;
  for (const message of auto.errors) {
    record(ctx, message);
  }
  if (!ctx.stopped) {
    const templates = await syncEventTemplates(deps);
    ctx.result.templatesNamed = templates.named;
    ctx.result.templatesRetired = templates.retired;
    for (const message of templates.errors) {
      record(ctx, message);
    }
  }
  ctx.result.requests = spent(deps, ctx);
  return ctx.result;
}

function shift(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS);
}

/**
 * The daily catalogue sync, `[now − 7d, now + horizon]`, one crawl doing three
 * jobs. The future side is discovery: every event is future-dated when it is
 * first listed, so the upsert's inserted count is exactly "events that did not
 * exist before", and known future events get their registration changes on the
 * same pass. The past side re-reads the last week, where events complete,
 * standings finalize, and decklists publish.
 *
 * Stored rows in the past slice the crawl did not return are flagged missing.
 * The source's own filter is what makes that sound: it returns every event
 * starting inside the range, so a stored row there that did not come back is a
 * row the source dropped. Only a run that covered everything is allowed to say
 * that, which is what `complete` is for. The future slice flags nothing — a
 * vanished future listing is routine cancellation churn, not a dropped row.
 *
 * Anything older than the lookback belongs to the recheck ladder (accepted
 * events) or the occasional manual backfill (everything else).
 */
export async function syncCatalog(
  deps: MetaSyncDeps,
  runId?: string,
): Promise<MetaCatalogSyncResult> {
  const now = clock(deps);
  const from = shift(now, -SYNC_LOOKBACK_DAYS);
  const ctx = newContext(deps, { maxRequests: MAX_REQUESTS_PER_CRAWL, runId, checkpoints: true });

  await crawlRange(deps, ctx, from, shift(now, FUTURE_HORIZON_DAYS));

  if (ctx.result.complete) {
    ctx.result.missing = await deps.repos.uvsgamesEvents.markMissing({
      from,
      to: now,
      seenBefore: now,
      at: now,
    });
  }

  return await finish(deps, ctx);
}

export interface BackfillOptions {
  /**
   * A prior run's `coveredThrough`. The crawl restarts one millisecond past it,
   * which loses nothing because the source's bounds are inclusive.
   */
  resumeFrom?: Date;
}

/**
 * The manual full resync, the archive's whole span in one walk. Nothing
 * scheduled runs this: old completed events are crawled once, by this, and
 * never again.
 *
 * It takes hours, so it checkpoints. A run that stops early leaves
 * `coveredThrough` behind and the next one carries on from there.
 */
export async function backfillCatalog(
  deps: MetaSyncDeps,
  runId?: string,
  options: BackfillOptions = {},
): Promise<MetaCatalogSyncResult> {
  const now = clock(deps);
  const to = shift(now, FUTURE_HORIZON_DAYS);
  const ctx = newContext(deps, { maxRequests: MAX_REQUESTS_PER_CRAWL, runId, checkpoints: true });

  const resumeFrom = options.resumeFrom;
  const from = resumeFrom === undefined ? ARCHIVE_START : new Date(resumeFrom.getTime() + 1);
  if (resumeFrom !== undefined) {
    ctx.result.resumedFrom = resumeFrom.toISOString();
    ctx.result.coveredThrough = resumeFrom.toISOString();
  }

  if (from.getTime() <= to.getTime()) {
    await crawlRange(deps, ctx, from, to);
  }

  return await finish(deps, ctx);
}
