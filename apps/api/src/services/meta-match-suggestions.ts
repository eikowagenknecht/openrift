/**
 * Ranks candidate live events/players against a meta archive overlay for
 * manual linking. Ranks only; never applies a suggestion.
 */
import type { MetaOverlayRowMatch } from "@openrift/shared/types/api/meta";
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
  /** Comparable only within one call. */
  score: number;
  reasons: string[];
  isExact: boolean;
}

export interface MetaPlayerMatchSuggestion {
  metaEventPlayerId: string;
  isCurrent: boolean;
  playerName: string;
  rank: number;
  rankIsTier: boolean;
  deckId: string | null;
  score: number;
  reasons: string[];
  isExact: boolean;
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

const MAX_SUGGESTIONS = 5;

/** Must exceed the date-window-only score (2 or 3), or an unrelated same-weekend event qualifies. */
const MIN_EVENT_SCORE = 4;

/** uvsgames files a multi-day event under the Friday, playriftbound under the Sunday; must stay wide enough to bridge that gap. */
export const MAX_EVENT_MATCH_DAY_DELTA = 3;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Cuts by the listing's newest-first order, not score; too small a cap can silently drop the correct event. */
const MAX_WINDOW_EVENTS = 500;

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

/** Bigram Dice coefficient over the two normalized names, 0 (nothing shared) to 1 (identical). */
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

/** Outside the date window ({@link MAX_EVENT_MATCH_DAY_DELTA}), no combination of format/name match qualifies. */
export function scoreEventMatch(
  candidate: MetaEventMatchInput,
  live: { name: string; eventDate: string; format: string },
): { score: number; reasons: string[]; withinWindow: boolean; isExact: boolean } {
  const reasons: string[] = [];
  let score = 0;

  if (live.format === candidate.format) {
    score += 2;
    reasons.push("same format");
  }

  const delta = dayDelta(candidate.eventDate, live.eventDate);
  const withinWindow = delta !== null && delta <= MAX_EVENT_MATCH_DAY_DELTA;
  if (withinWindow) {
    score += delta === 0 ? 3 : 2;
    reasons.push(delta === 0 ? "same date" : `${delta} day${delta === 1 ? "" : "s"} apart`);
  }

  const similarity = nameSimilarity(candidate.name, live.name);
  if (similarity > 0) {
    score += similarity * 5;
    reasons.push(similarity === 1 ? "same name" : "similar name");
  }

  const isExact = similarity === 1 && delta === 0 && live.format === candidate.format;
  return { score, reasons, withinWindow, isExact };
}

export function scorePlayerMatch(
  candidate: MetaPlayerMatchInput,
  live: { playerName: string; rank: number },
): {
  score: number;
  reasons: string[];
  playerMatched: boolean;
  rankMatched: boolean;
  isExact: boolean;
} {
  const reasons: string[] = [];
  let score = 0;

  const similarity = nameSimilarity(candidate.playerName, live.playerName);
  if (similarity === 1) {
    score += 10;
    reasons.push("same player");
  } else if (similarity > 0) {
    score += 2 + similarity * 6;
    reasons.push("similar player name");
  }

  const rankMatched = live.rank === candidate.rank;
  if (rankMatched) {
    score += 1;
    reasons.push("same finish");
  }

  return {
    score,
    reasons,
    playerMatched: similarity > 0,
    rankMatched,
    isExact: similarity === 1 && rankMatched,
  };
}

export async function suggestMetaEventMatches(
  repos: Repos,
  eventOverlayId: string,
): Promise<MetaEventMatchSuggestion[]> {
  const candidate = await repos.metaOverlays.eventOverlayById(eventOverlayId);
  if (candidate === undefined) {
    return [];
  }
  if (candidate.eventDate === null || candidate.format === null || candidate.name === null) {
    return [];
  }
  const { rows } = await repos.meta.listEvents(
    {
      dateFrom: shiftDay(candidate.eventDate, -MAX_EVENT_MATCH_DAY_DELTA),
      dateTo: shiftDay(candidate.eventDate, MAX_EVENT_MATCH_DAY_DELTA),
    },
    { limit: MAX_WINDOW_EVENTS, offset: 0 },
  );
  return rankEventMatches(
    { name: candidate.name, eventDate: candidate.eventDate, format: candidate.format },
    rows,
    candidate.metaEventId,
  );
}

export function rankEventMatches(
  candidate: MetaEventMatchInput,
  events: readonly MetaEventWithCounts[],
  currentMetaEventId: string | null = null,
): MetaEventMatchSuggestion[] {
  return events
    .filter((event) => event.id !== currentMetaEventId)
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
      isExact: row.isExact,
    }));
}

export async function suggestMetaPlayerMatches(
  repos: Repos,
  playerOverlayId: string,
): Promise<MetaPlayerMatchSuggestion[]> {
  const candidate = await repos.metaOverlays.playerOverlayById(playerOverlayId);
  if (candidate === undefined) {
    return [];
  }

  let metaEventId = candidate.metaEventId;
  if (metaEventId === null && candidate.metaEventPlayerId !== null) {
    metaEventId = (await repos.meta.eventIdForPlayer(candidate.metaEventPlayerId)) ?? null;
  }
  if (metaEventId === null && candidate.eventOverlayId !== null) {
    const parent = await repos.metaOverlays.eventOverlayById(candidate.eventOverlayId);
    metaEventId = parent?.metaEventId ?? null;
  }
  if (metaEventId === null) {
    return [];
  }

  const players = await repos.meta.adminPlayersForEvent(metaEventId);
  const anchor = players.find((player) => player.id === candidate.metaEventPlayerId);
  const playerName = candidate.playerName ?? anchor?.playerName ?? null;
  const rank = candidate.rank ?? anchor?.rank ?? null;
  if (playerName === null || rank === null) {
    return [];
  }
  return rankPlayerMatches({ playerName, rank }, players, candidate.metaEventPlayerId);
}

/**
 * The shortlist is the linked row, every exact-name row, and the best other
 * row by name and by finish.
 */
export function rankPlayerMatches(
  candidate: MetaPlayerMatchInput,
  players: readonly AdminMetaPlayerRow[],
  currentPlayerId: string | null = null,
): MetaPlayerMatchSuggestion[] {
  const scored = players
    .map((player) => ({
      player,
      isCurrent: player.id === currentPlayerId,
      ...scorePlayerMatch(candidate, player),
    }))
    .filter((row) => row.playerMatched || row.rankMatched || row.isCurrent)
    .toSorted(
      (a, b) =>
        Number(b.isCurrent) - Number(a.isCurrent) ||
        b.score - a.score ||
        a.player.playerName.localeCompare(b.player.playerName),
    );

  const others = scored.filter((row) => !row.isCurrent);
  const picked = new Set<string>();
  for (const shortlisted of [
    ...scored.filter((row) => row.isCurrent || row.isExact),
    others.find((row) => row.playerMatched),
    others.find((row) => row.rankMatched),
  ]) {
    if (shortlisted !== undefined) {
      picked.add(shortlisted.player.id);
    }
  }

  return scored
    .filter((row) => picked.has(row.player.id))
    .map((row) => ({
      metaEventPlayerId: row.player.id,
      playerName: row.player.playerName,
      rank: row.player.rank,
      rankIsTier: row.player.rankIsTier,
      deckId: row.player.deckId,
      score: row.score,
      reasons: row.reasons,
      isCurrent: row.isCurrent,
      isExact: row.isExact,
    }));
}

export interface LinkedPlayerRow {
  id: string;
  playerName: string;
  rank: number;
  rankIsTier: boolean;
}

export function summarizePlayerMatch(
  suggestions: readonly MetaPlayerMatchSuggestion[],
  linked: LinkedPlayerRow | null,
): MetaOverlayRowMatch {
  if (linked !== null) {
    return {
      state: "linked",
      metaEventPlayerId: linked.id,
      playerName: linked.playerName,
      rank: linked.rank,
      rankIsTier: linked.rankIsTier,
      candidateCount: suggestions.filter((suggestion) => !suggestion.isCurrent).length,
    };
  }
  const exact = suggestions.filter((suggestion) => suggestion.isExact);
  const [only] = exact;
  if (exact.length === 1 && only) {
    return {
      state: "exact",
      metaEventPlayerId: only.metaEventPlayerId,
      playerName: only.playerName,
      rank: only.rank,
      rankIsTier: only.rankIsTier,
      candidateCount: suggestions.length,
    };
  }
  return {
    state: suggestions.length > 0 ? "candidates" : "none",
    metaEventPlayerId: null,
    playerName: null,
    rank: null,
    rankIsTier: null,
    candidateCount: suggestions.length,
  };
}

export const UNSCORED_PLAYER_MATCH: MetaOverlayRowMatch = {
  state: "unscored",
  metaEventPlayerId: null,
  playerName: null,
  rank: null,
  rankIsTier: null,
  candidateCount: 0,
};
