import { TOPDECK_FORMATS } from "@openrift/shared/types/enums";
import type { Insertable } from "kysely";

import type {
  TopdeckDecklistCardsTable,
  TopdeckEventStandingsTable,
} from "../../../../db/index.js";
import {
  legendFromTopdeckLines,
  projectTopdeckDeckLines,
  projectTournament,
  referencedShortCodes,
  TOPDECK_GAME,
} from "../../lib/topdeck-catalog.js";
import type {
  TopdeckStandingProjection,
  TopdeckTournamentProjection,
} from "../../lib/topdeck-catalog.js";
import type { TopdeckUpsertInput } from "../../repositories/topdeck-events.js";
import { runCancelRequested, writeRunHeartbeat } from "./crawl-checkpoint.js";
import { errorText } from "./deps.js";
import type { MetaSyncResultBase } from "./result.js";
import { emptyMetaSyncResult } from "./result.js";
import { autoAcceptTopdeckEvents } from "./topdeck-accept.js";
import { TopdeckThrottledError } from "./topdeck-client.js";
import type { TopdeckSyncDeps } from "./topdeck-deps.js";
import { clock } from "./topdeck-deps.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const SYNC_LOOKBACK_DAYS = 30;

const BACKFILL_CHUNK_DAYS = 90;

const ARCHIVE_START = new Date("2025-06-01T00:00:00Z");

// `decklist` is the column that carries the lists; asking for `deckObj`
// without it returns neither.
const SEARCH_COLUMNS = ["name", "id", "decklist", "wins", "losses", "draws"];

const MAX_ERRORS = 50;

export interface TopdeckSyncResult extends MetaSyncResultBase {
  players: number;
  decks: number;
  throttled: boolean;
}

function emptyResult(): TopdeckSyncResult {
  return { ...emptyMetaSyncResult(), players: 0, decks: 0, throttled: false };
}

export function isTopdeckSyncNoop(result: TopdeckSyncResult): boolean {
  return (
    result.inserted === 0 &&
    result.changed === 0 &&
    result.missing === 0 &&
    result.autoAccepted === 0 &&
    !result.throttled
  );
}

function shift(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS);
}

function unixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

// Capped so one bad run cannot fill `job_runs` with error lines.
function record(errors: string[], messages: readonly string[]): void {
  for (const message of messages) {
    if (errors.length >= MAX_ERRORS) {
      return;
    }
    errors.push(message);
  }
}

// The card bridge is built once per tournament: one query, not one per list.
async function writeResults(
  deps: TopdeckSyncDeps,
  projection: TopdeckTournamentProjection,
  now: Date,
): Promise<{ players: number; decks: number }> {
  const { event, standings } = projection;
  const bridge = await deps.repos.topdeckEvents.cardsByShortCode(referencedShortCodes(standings));

  const deckLines = new Map<string, ReturnType<typeof projectTopdeckDeckLines>>();
  for (const standing of standings) {
    if (standing.sourceDeckId === null || standing.deckSections === null) {
      continue;
    }
    deckLines.set(standing.sourceDeckId, projectTopdeckDeckLines(standing.deckSections, bridge));
  }

  const rows: Insertable<TopdeckEventStandingsTable>[] = standings.map(
    (standing: TopdeckStandingProjection) => ({
      tid: event.tid,
      playerKey: standing.playerKey,
      sourcePlayerId: standing.sourcePlayerId,
      playerName: standing.playerName,
      rank: standing.rank,
      wins: standing.wins,
      losses: standing.losses,
      draws: standing.draws,
      // The deck's Legend line carries our catalogue's spelling and wins over
      // the source's own `leader` string when a list was submitted.
      legendName:
        legendFromTopdeckLines(deckLines.get(standing.sourceDeckId ?? "") ?? []) ??
        standing.legendName,
      sourceDeckId: standing.sourceDeckId,
      fetchedAt: now,
    }),
  );

  // Decklists reference the event row; this must run after the event upsert
  // and before the lists are written.
  await deps.repos.topdeckResults.replaceStandings(event.tid, rows);

  let decks = 0;
  for (const [sourceDeckId, lines] of deckLines) {
    if (lines.length === 0) {
      continue;
    }
    const cards: Omit<Insertable<TopdeckDecklistCardsTable>, "sourceDeckId">[] = lines.map(
      (line) => ({
        lineNumber: line.lineNumber,
        zone: line.zone,
        quantity: line.quantity,
        cardName: line.cardName,
      }),
    );
    await deps.repos.topdeckResults.putDecklist(
      { sourceDeckId, tid: event.tid, fetchStatus: "fetched", fetchedAt: now },
      cards,
    );
    decks++;
  }
  return { players: rows.length, decks };
}

interface CrawlContext {
  result: TopdeckSyncResult;
  touched: string[];
  runId?: string;
  now: Date;
}

// An unchanged event's results are not rewritten. The content hash covers
// the standings count, so a grown field counts as a change.
async function crawlFormatWindow(
  deps: TopdeckSyncDeps,
  ctx: CrawlContext,
  format: string,
  from: Date,
  to: Date,
): Promise<void> {
  const body = await deps.client.searchTournaments({
    game: TOPDECK_GAME,
    format,
    start: unixSeconds(from),
    end: unixSeconds(to),
    columns: SEARCH_COLUMNS,
  });
  ctx.result.rows += body.length;

  const projections = body.map((raw) => projectTournament(raw)).filter((p) => p !== null);
  const upserts: TopdeckUpsertInput[] = projections.map((p) => p.event);
  const written = await deps.repos.topdeckEvents.upsertBatch(upserts, ctx.now);
  ctx.result.inserted += written.inserted.length;
  ctx.result.changed += written.changed.length;
  ctx.result.unchanged += written.unchanged.length;

  const rewrite = new Set([...written.inserted, ...written.changed]);
  ctx.touched.push(...rewrite);
  const failed: string[] = [];
  for (const projection of projections) {
    if (!rewrite.has(projection.event.tid)) {
      continue;
    }
    try {
      const counts = await writeResults(deps, projection, ctx.now);
      ctx.result.players += counts.players;
      ctx.result.decks += counts.decks;
    } catch (error) {
      failed.push(projection.event.tid);
      record(ctx.result.errors, [errorText(error, `topdeck ${projection.event.tid}`)]);
    }
  }
  if (failed.length > 0) {
    ctx.result.complete = false;
    await deps.repos.topdeckEvents.requeueResults(failed);
  }

  // Only a run that covered the whole window may call a stored row dropped: a
  // gap in coverage is indistinguishable from a row the source stopped listing.
  if (ctx.result.complete) {
    ctx.result.missing += await deps.repos.topdeckEvents.markMissing({
      from,
      to,
      format,
      seenBefore: ctx.now,
      at: ctx.now,
    });
  }
}

async function finish(deps: TopdeckSyncDeps, ctx: CrawlContext): Promise<TopdeckSyncResult> {
  const auto = await autoAcceptTopdeckEvents(deps, [...new Set(ctx.touched)]);
  ctx.result.autoAccepted = auto.accepted;
  record(ctx.result.errors, auto.errors);
  ctx.result.requests = deps.client.requests;
  return ctx.result;
}

export async function syncTopdeckCatalog(deps: TopdeckSyncDeps): Promise<TopdeckSyncResult> {
  const now = clock(deps);
  const ctx: CrawlContext = { result: emptyResult(), touched: [], now };
  const from = shift(now, -SYNC_LOOKBACK_DAYS);
  try {
    for (const format of TOPDECK_FORMATS) {
      await crawlFormatWindow(deps, ctx, format, from, now);
    }
  } catch (error) {
    if (error instanceof TopdeckThrottledError) {
      ctx.result.throttled = true;
      ctx.result.complete = false;
    } else {
      throw error;
    }
  }
  return await finish(deps, ctx);
}

export interface TopdeckBackfillOptions {
  resumeFrom?: Date;
}

// The source pages nothing, so the chunk bounds the response: the full
// Constructed archive in one call is eleven megabytes.
export async function backfillTopdeck(
  deps: TopdeckSyncDeps,
  runId?: string,
  options: TopdeckBackfillOptions = {},
): Promise<TopdeckSyncResult> {
  const now = clock(deps);
  const ctx: CrawlContext = { result: emptyResult(), touched: [], runId, now };
  const resumeFrom = options.resumeFrom;
  let from = resumeFrom === undefined ? ARCHIVE_START : new Date(resumeFrom.getTime() + 1);
  if (resumeFrom !== undefined) {
    ctx.result.resumedFrom = resumeFrom.toISOString();
    ctx.result.coveredThrough = resumeFrom.toISOString();
  }

  try {
    while (from.getTime() <= now.getTime()) {
      if (runId !== undefined && (await runCancelRequested(deps.repos.jobRuns, runId))) {
        ctx.result.cancelRequested = true;
        ctx.result.complete = false;
        break;
      }
      const to = new Date(Math.min(shift(from, BACKFILL_CHUNK_DAYS).getTime(), now.getTime()));
      for (const format of TOPDECK_FORMATS) {
        await crawlFormatWindow(deps, ctx, format, from, to);
      }
      ctx.result.coveredThrough = to.toISOString();
      if (runId !== undefined) {
        await writeRunHeartbeat(deps.repos.jobRuns, runId, ctx.result, clock(deps));
      }
      from = new Date(to.getTime() + 1);
    }
  } catch (error) {
    if (error instanceof TopdeckThrottledError) {
      ctx.result.throttled = true;
      ctx.result.complete = false;
    } else {
      throw error;
    }
  }
  return await finish(deps, ctx);
}
