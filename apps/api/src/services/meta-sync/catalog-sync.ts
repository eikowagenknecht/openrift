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

// Walked by date range, not page number: the listing has no stable sort and
// ties heavily on start_datetime, so offset paging drops and duplicates rows.

const SYNC_LOOKBACK_DAYS = 7;

export const ARCHIVE_START = new Date("2025-01-01T00:00:00Z");

const FUTURE_HORIZON_DAYS = 730;

const MAX_SPLIT = 12;

const MAX_REQUESTS_PER_CRAWL = 6000;

const MAX_INSTANT_ROWS = 300;

const INSTANT_PROBE_PAGES = 5;

const MAX_CONSECUTIVE_FAILURES = 20;

const HEARTBEAT_RANGES = 25;

const MAX_ERRORS = 50;
const MAX_SKIPPED = 50;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface MetaCatalogSyncResult extends MetaSyncResultBase {
  ranges: number;
  unreadable: number;
  skipped: number;
  templatesNamed: number;
  templatesRetired: number;
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

// A cancelled run never counts as a noop, however little it wrote, so the
// admin who stopped it still sees the stop in the history.
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
  touched: string[];
  seenAt: Date;
  filter: UvsQuery;
  maxRequests: number;
  requestsBefore: number;
  runId?: string;
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

// The counters alone cannot say a crawl fell short, so a gap is marked explicitly.
function skip(ctx: CrawlContext, detail: string): void {
  ctx.result.complete = false;
  if (ctx.result.skippedRanges.length < MAX_SKIPPED) {
    ctx.result.skippedRanges.push(detail);
  }
}

// Ranges are visited in chronological order, so a finished range's end
// instant alone is the whole resume state.
function cover(ctx: CrawlContext, to: Date): void {
  if (ctx.checkpoints) {
    ctx.result.coveredThrough = to.toISOString();
  }
}

function spent(deps: MetaSyncDeps, ctx: CrawlContext): number {
  return deps.client.requests - ctx.requestsBefore;
}

// A crawl that stops here must mark complete=false; a silent halt would
// read as full coverage it never achieved.
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

// A failed heartbeat write is only logged, never thrown, so it can't kill a
// crawl hours into its ranges; the same beat is how an out-of-band cancel reaches it.
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

// Never fewer than two: a split that handed back the same range would recurse forever.
function splitParts(count: number): number {
  return Math.min(MAX_SPLIT, Math.max(2, Math.ceil(count / MAX_PAGE_SIZE)));
}

// Contiguous inclusive sub-ranges covering [from, to] exactly once. A range
// narrower than `parts` milliseconds yields one slice per millisecond instead.
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

// Time cannot split a single instant any further, so this is the one place
// left that pages by offset, and where an unstable tie order can drop a row.
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

// Walks a refused instant a row at a time so only the row that breaks the
// serializer is lost; keeps probing since the row count needs a page to answer.
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

// Runs after the crawl so a template id the crawl just met gets its row in
// the same run; skipped when the crawl stopped short to save one more request.
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

// Rows are flagged missing only when the crawl fully covered the range; a
// partial run must not mistake unreached rows for dropped ones.
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
  resumeFrom?: Date;
}

// Manual full resync only; nothing scheduled calls this. Old completed
// events are crawled once, by this, and never again.
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
