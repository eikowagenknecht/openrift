/**
 * "Which live row is this candidate probably about?" for the meta archive's
 * multi-source review (ADR-014, amended 2026-08-18).
 *
 * Two sources describing one tournament have to be linked by hand, and doing
 * that every week is the friction that would kill the workflow. So ingest
 * proposes and the admin confirms: everything here ranks, nothing here writes,
 * and no suggestion is ever applied on its own. A wrong auto-link would fan two
 * unrelated events into one page, and unpicking that is worse than the click it
 * saved.
 *
 * The signals are the ADR's: for an event, the same format, a date within a
 * day, and a similar name; for a deck inside an already-linked event, the same
 * normalized pilot name, preferring an equal finish. Name comparison reuses
 * `normalizeNameForIdentity`, the same normalization the card matcher and the
 * deck ingest run on, so "Summoner Skirmish #4" and "summoner skirmish 4" are
 * one name here exactly as they are there.
 */
import { normalizeNameForIdentity } from "@openrift/shared/utils";

import type { Repos } from "../deps.js";
import type { AdminMetaDeckRow, MetaEventWithCount } from "../repositories/meta.js";

/** One proposed live event for an unlinked candidate event. */
export interface MetaEventMatchSuggestion {
  metaEventId: string;
  slug: string;
  name: string;
  eventDate: string;
  format: string;
  deckCount: number;
  /** Higher is a better match. Comparable only within one call. */
  score: number;
  /** Why it ranked, in the order the signals were weighed. */
  reasons: string[];
}

/** One proposed archived deck for an unlinked candidate deck. */
export interface MetaDeckMatchSuggestion {
  deckId: string;
  name: string;
  playerName: string;
  finishTier: number;
  score: number;
  reasons: string[];
}

/** The candidate event fields a suggestion is ranked against. */
export interface MetaEventMatchInput {
  name: string;
  /** ISO `YYYY-MM-DD`. */
  eventDate: string;
  format: string;
}

/** The candidate deck fields a suggestion is ranked against. */
export interface MetaDeckMatchInput {
  playerName: string;
  finishTier: number;
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
 * Wider than the ADR's "within one day" because of the case the amendment
 * exists for: a multi-day event stores its start (`meta_events.event_date`),
 * and sources disagree about which day that is — uvsgames files a weekend
 * tournament under the Friday, playriftbound files its top 8 under the Sunday.
 * That is exactly the pair a maintainer needs to link, and a one-day window
 * rejects it. Three days covers a Friday-to-Monday spread without reaching the
 * next weekend's events, which are the near-misses the gate is there to stop.
 */
export const MAX_EVENT_MATCH_DAY_DELTA = 3;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Whole days between two ISO dates, or null when either is unparseable.
 * @param a One ISO date.
 * @param b The other.
 * @returns The absolute day delta.
 */
function dayDelta(a: string, b: string): number | null {
  const left = Date.parse(`${a}T00:00:00Z`);
  const right = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(left) || Number.isNaN(right)) {
    return null;
  }
  return Math.abs(left - right) / MS_PER_DAY;
}

/**
 * Bigram Dice coefficient over the two normalized names.
 *
 * Bigrams rather than whole-token equality because sources disagree in the
 * middle of a name as often as at its edges ("Summoner Skirmish #4" against
 * "Summoner Skirmish 4 - Berlin"), and a coefficient degrades where an
 * all-or-nothing token match would report zero.
 *
 * @param a One name, unnormalized.
 * @param b The other.
 * @returns Similarity from 0 (nothing shared) to 1 (identical).
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
 * Scores one live event against a candidate.
 *
 * The date window ({@link MAX_EVENT_MATCH_DAY_DELTA}) is a gate rather than a
 * signal to be outvoted: a recurring series repeats its name and its format
 * every season, so a name match a year out is a near-certain wrong link, and a
 * wrong link fans two unrelated tournaments into one page. Within the window
 * the three signals only decide the order.
 *
 * @param candidate The candidate event's fields.
 * @param live The live event to score.
 * @returns The score, the signals that produced it, and whether the dates are
 *   close enough for it to be offered at all.
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
 * Scores one archived deck against a candidate deck inside the same event.
 *
 * The pilot's name is the whole signal — an event's decks are told apart by who
 * played them — and the finish only breaks ties, because sources disagree about
 * placements far more often than about who was there. That is also why a shared
 * finish alone is not a match: eight decks of a top 8 share four tiers between
 * them.
 *
 * @param candidate The candidate deck's fields.
 * @param live The archived deck to score.
 * @returns The score, the signals that produced it, and whether the pilot names
 *   overlap at all.
 */
export function scoreDeckMatch(
  candidate: MetaDeckMatchInput,
  live: { playerName: string; finishTier: number },
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

  if (live.finishTier === candidate.finishTier) {
    score += 1;
    reasons.push("same finish");
  }

  return { score, reasons, playerMatched: similarity > 0 };
}

/**
 * The live events an unlinked candidate event probably describes, best first.
 *
 * Reads the whole archive rather than filtering in SQL: it is curated and small
 * by design (ADR-014), the deck browser already fetches all of it, and doing
 * the ranking in one place keeps the scoring testable without a database.
 *
 * @param repos The repositories.
 * @param candidateEventId The unlinked candidate.
 * @returns Up to five suggestions, or an empty list when the candidate is gone
 *   or already linked.
 */
export async function suggestMetaEventMatches(
  repos: Repos,
  candidateEventId: string,
): Promise<MetaEventMatchSuggestion[]> {
  const candidate = await repos.metaCandidates.eventById(candidateEventId);
  if (candidate === undefined || candidate.metaEventId !== null) {
    return [];
  }
  const events = await repos.meta.listEvents();
  return rankEventMatches(candidate, events);
}

/**
 * The ranking half of {@link suggestMetaEventMatches}, without the reads.
 * @param candidate The candidate event's fields.
 * @param events Every live event.
 * @returns Up to five suggestions, best first.
 */
export function rankEventMatches(
  candidate: MetaEventMatchInput,
  events: readonly MetaEventWithCount[],
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
      deckCount: row.event.deckCount,
      score: row.score,
      reasons: row.reasons,
    }));
}

/**
 * The archived decks an unlinked candidate deck probably describes, best first.
 *
 * Scoped to the live event the candidate's own event resolves to, because a
 * candidate deck may only ever link inside its own event.
 *
 * @param repos The repositories.
 * @param candidateDeckId The unlinked candidate deck.
 * @returns Up to five suggestions, or an empty list when there is no linked
 *   event to look inside.
 */
export async function suggestMetaDeckMatches(
  repos: Repos,
  candidateDeckId: string,
): Promise<MetaDeckMatchSuggestion[]> {
  const candidate = await repos.metaCandidates.deckById(candidateDeckId);
  if (candidate === undefined || candidate.deckId !== null) {
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

  const decks = await repos.meta.adminDecksForEvent(metaEventId);
  return rankDeckMatches(candidate, decks);
}

/**
 * The ranking half of {@link suggestMetaDeckMatches}, without the reads.
 * @param candidate The candidate deck's fields.
 * @param decks The archived decks of the event it would land in.
 * @returns Up to five suggestions, best first.
 */
export function rankDeckMatches(
  candidate: MetaDeckMatchInput,
  decks: readonly AdminMetaDeckRow[],
): MetaDeckMatchSuggestion[] {
  return decks
    .map((deck) => ({ deck, ...scoreDeckMatch(candidate, deck) }))
    .filter((row) => row.playerMatched)
    .toSorted((a, b) => b.score - a.score || a.deck.playerName.localeCompare(b.deck.playerName))
    .slice(0, MAX_SUGGESTIONS)
    .map((row) => ({
      deckId: row.deck.deckId,
      name: row.deck.name,
      playerName: row.deck.playerName,
      finishTier: row.deck.finishTier,
      score: row.score,
      reasons: row.reasons,
    }));
}
