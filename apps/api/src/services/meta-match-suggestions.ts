/**
 * "Which live row is this candidate probably about?" for the meta archive's
 * multi-source review.
 *
 * Two sources describing one tournament have to be linked by hand, and doing
 * that every week is the friction that would kill the workflow. So ingest
 * proposes and the admin confirms: everything here ranks, nothing here writes,
 * and no suggestion is ever applied on its own. A wrong auto-link would fan two
 * unrelated events into one page, and unpicking that is worse than the click it
 * saved.
 *
 * The signals: for an event, the same format, a close date, and a similar
 * name; for a player inside an already-linked event, the same normalized player
 * name, preferring an equal finish. Name comparison reuses
 * `normalizeNameForIdentity`, the same normalization the card matcher and the
 * deck ingest run on, so "Summoner Skirmish #4" and "summoner skirmish 4" are
 * one name here exactly as they are there.
 */
import { normalizeNameForIdentity } from "@openrift/shared/utils";

import type { Repos } from "../deps.js";
import type { AdminMetaPlayerRow, MetaEventWithCounts } from "../repositories/meta.js";

export interface MetaEventMatchSuggestion {
  metaEventId: string;
  slug: string;
  name: string;
  eventDate: string;
  format: string;
  playerRowCount: number;
  /** Higher is a better match. Comparable only within one call. */
  score: number;
  /** Why it ranked, in the order the signals were weighed. */
  reasons: string[];
}

export interface MetaPlayerMatchSuggestion {
  metaEventPlayerId: string;
  playerName: string;
  rank: number;
  rankIsTier: boolean;
  /** The row's deck, when it already has one. */
  deckId: string | null;
  score: number;
  reasons: string[];
}

export interface MetaEventMatchInput {
  name: string;
  /** ISO `YYYY-MM-DD`. */
  eventDate: string;
  format: string;
}

export interface MetaPlayerMatchInput {
  playerName: string;
  rank: number;
}

/** How many suggestions a review screen is offered. Beyond this it is a search box, not a hint. */
const MAX_SUGGESTIONS = 5;

/**
 * Below this a "match" inside the date window is noise. The window alone scores
 * 2 or 3, so this is what stops "some other event happened that weekend" being
 * offered as a match on its own.
 */
const MIN_EVENT_SCORE = 4;

/**
 * How far apart two dates may be and still be the same tournament.
 *
 * Wider than one day because a multi-day event stores its start
 * (`meta_events.event_date`) and sources disagree about which day that is —
 * uvsgames files a weekend tournament under the Friday, playriftbound files
 * its top 8 under the Sunday. That is exactly the pair a maintainer needs to
 * link, and a one-day window rejects it. Three days covers a Friday-to-Monday
 * spread without reaching the next weekend's events, which are the near-misses
 * the gate is there to stop.
 */
export const MAX_EVENT_MATCH_DAY_DELTA = 3;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * How many events inside the window the ranking will look at. The cap cuts by
 * the listing's own newest-first order, not by score, so a window that overflows
 * it can hide the right event: the number is a guard against an unbounded read,
 * and the week-wide window is what keeps it out of reach.
 */
const MAX_WINDOW_EVENTS = 500;

/** The ISO day `days` away from `day`. */
function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

function dayDelta(a: string, b: string): number | null {
  const left = Date.parse(`${a}T00:00:00Z`);
  const right = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(left) || Number.isNaN(right)) {
    return null;
  }
  return Math.abs(left - right) / MS_PER_DAY;
}

/**
 * Bigram Dice coefficient over the two normalized names, 0 (nothing shared)
 * to 1 (identical).
 *
 * Bigrams rather than whole-token equality because sources disagree in the
 * middle of a name as often as at its edges ("Summoner Skirmish #4" against
 * "Summoner Skirmish 4 - Berlin"), and a coefficient degrades where an
 * all-or-nothing token match would report zero.
 */
export function nameSimilarity(a: string, b: string): number {
  const left = normalizeNameForIdentity(a);
  const right = normalizeNameForIdentity(b);
  if (left === "" || right === "") {
    return 0;
  }
  if (left === right) {
    return 1;
  }
  if (left.length < 2 || right.length < 2) {
    return 0;
  }

  const counts = new Map<string, number>();
  for (let i = 0; i < left.length - 1; i++) {
    const gram = left.slice(i, i + 2);
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }

  let shared = 0;
  for (let i = 0; i < right.length - 1; i++) {
    const gram = right.slice(i, i + 2);
    const seen = counts.get(gram) ?? 0;
    if (seen > 0) {
      counts.set(gram, seen - 1);
      shared++;
    }
  }
  return (2 * shared) / (left.length - 1 + (right.length - 1));
}

/**
 * The date window ({@link MAX_EVENT_MATCH_DAY_DELTA}) is a gate rather than a
 * signal to be outvoted: a recurring series repeats its name and its format
 * every season, so a name match a year out is a near-certain wrong link, and a
 * wrong link fans two unrelated tournaments into one page. Within the window
 * the three signals only decide the order.
 */
export function scoreEventMatch(
  candidate: MetaEventMatchInput,
  live: { name: string; eventDate: string; format: string },
): { score: number; reasons: string[]; withinWindow: boolean } {
  const reasons: string[] = [];
  let score = 0;

  if (live.format === candidate.format) {
    score += 2;
    reasons.push("same format");
  }

  const delta = dayDelta(candidate.eventDate, live.eventDate);
  const withinWindow = delta !== null && delta <= MAX_EVENT_MATCH_DAY_DELTA;
  if (withinWindow) {
    // The exact same day is the stronger signal; anywhere else inside the
    // window is the multi-day spread and scores flat, since a Friday-to-Sunday
    // gap says no less about a weekend event than a Friday-to-Saturday one.
    score += delta === 0 ? 3 : 2;
    reasons.push(delta === 0 ? "same date" : `${delta} day${delta === 1 ? "" : "s"} apart`);
  }

  const similarity = nameSimilarity(candidate.name, live.name);
  if (similarity > 0) {
    score += similarity * 5;
    reasons.push(similarity === 1 ? "same name" : "similar name");
  }

  return { score, reasons, withinWindow };
}

/**
 * The player's name is the whole signal — an event's standings are told apart by
 * who played them — and the finish only breaks ties, because sources disagree
 * about placements far more often than about who was there. That is also why a
 * shared finish alone is not a match: eight entries of a top 8 share four tiers
 * between them.
 */
export function scorePlayerMatch(
  candidate: MetaPlayerMatchInput,
  live: { playerName: string; rank: number },
): { score: number; reasons: string[]; playerMatched: boolean } {
  const reasons: string[] = [];
  let score = 0;

  const similarity = nameSimilarity(candidate.playerName, live.playerName);
  if (similarity === 1) {
    score += 10;
    reasons.push("same player");
  } else if (similarity > 0) {
    score += similarity * 6;
    reasons.push("similar player name");
  }

  if (live.rank === candidate.rank) {
    score += 1;
    reasons.push("same finish");
  }

  return { score, reasons, playerMatched: similarity > 0 };
}

/**
 * The live events an unlinked candidate event probably describes, best first.
 * The date window is the only filter SQL applies; the scoring stays a pure
 * function over the rows it returns, so it is testable without a database.
 */
export async function suggestMetaEventMatches(
  repos: Repos,
  candidateEventId: string,
): Promise<MetaEventMatchSuggestion[]> {
  const candidate = await repos.metaCandidates.eventById(candidateEventId);
  if (candidate === undefined || candidate.metaEventId !== null) {
    return [];
  }
  // Only an event inside the date window can score at all, so the ranking reads
  // that slice rather than the whole archive.
  const { rows } = await repos.meta.listEvents(
    {
      dateFrom: shiftDay(candidate.eventDate, -MAX_EVENT_MATCH_DAY_DELTA),
      dateTo: shiftDay(candidate.eventDate, MAX_EVENT_MATCH_DAY_DELTA),
    },
    { limit: MAX_WINDOW_EVENTS, offset: 0 },
  );
  return rankEventMatches(candidate, rows);
}

export function rankEventMatches(
  candidate: MetaEventMatchInput,
  events: readonly MetaEventWithCounts[],
): MetaEventMatchSuggestion[] {
  return events
    .map((event) => ({ event, ...scoreEventMatch(candidate, event) }))
    .filter((row) => row.withinWindow && row.score >= MIN_EVENT_SCORE)
    .toSorted((a, b) => b.score - a.score || a.event.name.localeCompare(b.event.name))
    .slice(0, MAX_SUGGESTIONS)
    .map((row) => ({
      metaEventId: row.event.id,
      slug: row.event.slug,
      name: row.event.name,
      eventDate: row.event.eventDate,
      format: row.event.format,
      playerRowCount: row.event.playerRowCount,
      score: row.score,
      reasons: row.reasons,
    }));
}

/**
 * The live standings rows an unlinked candidate player probably describes, best
 * first. Scoped to the live event the candidate's own event resolves to,
 * because a candidate may only ever link inside its own event.
 */
export async function suggestMetaPlayerMatches(
  repos: Repos,
  candidatePlayerId: string,
): Promise<MetaPlayerMatchSuggestion[]> {
  const candidate = await repos.metaCandidates.playerById(candidatePlayerId);
  if (candidate === undefined || candidate.metaEventPlayerId !== null) {
    return [];
  }

  let metaEventId = candidate.metaEventId;
  if (metaEventId === null && candidate.candidateEventId !== null) {
    const parent = await repos.metaCandidates.eventById(candidate.candidateEventId);
    metaEventId = parent?.metaEventId ?? null;
  }
  if (metaEventId === null) {
    return [];
  }

  const players = await repos.meta.adminPlayersForEvent(metaEventId);
  return rankPlayerMatches(candidate, players);
}

export function rankPlayerMatches(
  candidate: MetaPlayerMatchInput,
  players: readonly AdminMetaPlayerRow[],
): MetaPlayerMatchSuggestion[] {
  return players
    .map((player) => ({ player, ...scorePlayerMatch(candidate, player) }))
    .filter((row) => row.playerMatched)
    .toSorted((a, b) => b.score - a.score || a.player.playerName.localeCompare(b.player.playerName))
    .slice(0, MAX_SUGGESTIONS)
    .map((row) => ({
      metaEventPlayerId: row.player.id,
      playerName: row.player.playerName,
      rank: row.player.rank,
      rankIsTier: row.player.rankIsTier,
      deckId: row.player.deckId,
      score: row.score,
      reasons: row.reasons,
    }));
}
