import { META_ENTRY_STATUSES, REQUIRED_ZONES, WellKnown, ZONE_EXPECTED } from "@openrift/shared";
import type { MetaEntryStatus } from "@openrift/shared";

/**
 * Projects one deep fetch's responses into the source mirror's columns.
 * Allowlist: only fields named here reach `uvsgames_*`. Fields are `unknown`
 * because the source publishes no schema; a changed shape degrades to a
 * drop, not a crawl-wide throw.
 */

export interface UvsDeepFetchResponses {
  detail: unknown;
  registrations: unknown[];
  standings: unknown[];
  roundStandings: unknown[];
}

/** One row of `uvsgames_event_standings`, minus the event key the caller adds. */
interface UvsStandingProjection {
  registrationId: string;
  uvsgamesPlayerId: number | null;
  playerName: string | null;
  rank: number | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  matchPoints: number | null;
  opponentMatchWinPct: number | null;
  gameWinPct: number | null;
  opponentGameWinPct: number | null;
  entryStatus: MetaEntryStatus | null;
  legendName: string | null;
  sourceDeckId: string | null;
}

export interface UvsTransformResult {
  standings: UvsStandingProjection[];
  dropped: number;
  players: UvsPlayerIdentity[];
}

interface UvsPlayerIdentity {
  registrationId: string;
  userId: number;
  displayName: string;
}

const ZONE_BY_SECTION: Readonly<Record<string, string>> = {
  main: WellKnown.deckZone.MAIN,
  main_deck: WellKnown.deckZone.MAIN,
  sideboard: WellKnown.deckZone.SIDEBOARD,
  side_deck: WellKnown.deckZone.SIDEBOARD,
  legend: WellKnown.deckZone.LEGEND,
  champion: WellKnown.deckZone.CHAMPION,
  rune_pool: WellKnown.deckZone.RUNES,
  runes: WellKnown.deckZone.RUNES,
  battlefield: WellKnown.deckZone.BATTLEFIELD,
  battlefields: WellKnown.deckZone.BATTLEFIELD,
};

const ZONE_BY_CARD_TYPE: Readonly<Record<string, string>> = {
  legend: WellKnown.deckZone.LEGEND,
  rune: WellKnown.deckZone.RUNES,
  battlefield: WellKnown.deckZone.BATTLEFIELD,
};

type Json = Record<string, unknown>;

function record(value: unknown): Json | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Json)
    : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

/** A tiebreaker percentage. The live CHECK is 0..1, so anything else is dropped. */
function fraction(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : null;
}

function entryStatus(value: unknown): MetaEntryStatus | null {
  const lowered = text(value)?.toLowerCase();
  return META_ENTRY_STATUSES.find((status) => status === lowered) ?? null;
}

function positive(value: unknown): number | null {
  const parsed = count(value);
  return parsed === null || parsed === 0 ? null : parsed;
}

export interface UvsRoundMeta {
  roundId: string;
  phaseOrder: number;
  roundNumber: number;
}

/**
 * Standings are named only by a phase's last round; a top cut is a separate
 * phase, so `phaseOrder` lets the caller find the phase a cut left behind.
 */
export function completedRounds(detail: unknown): UvsRoundMeta[] {
  const rounds: UvsRoundMeta[] = [];
  const phases = array(record(detail)?.tournament_phases);
  for (const [phaseOrder, phase] of phases.entries()) {
    const phaseRounds = array(record(phase)?.rounds);
    const numbered = phaseRounds.map((round) => positive(record(round)?.round_number));
    // Source numbers are only usable when they're distinct across the phase;
    // mixed with the positional fallback, two rounds could share a number.
    const useSource =
      numbered.every((number) => number !== null) && new Set(numbered).size === numbered.length;
    for (const [index, round] of phaseRounds.entries()) {
      const row = record(round);
      const roundId = text(row?.id);
      const status = text(row?.status)?.toLowerCase();
      if (roundId !== null && (status === "complete" || status === "completed")) {
        rounds.push({
          roundId,
          phaseOrder,
          roundNumber: (useSource ? numbered[index] : null) ?? index + 1,
        });
      }
    }
  }
  return rounds;
}

/** One mirrored match, as `uvsgames_event_matches` stores it minus the event FK. */
interface UvsMatchProjection {
  sourceMatchId: string;
  roundId: string;
  phaseOrder: number;
  roundNumber: number;
  tableNumber: number | null;
  isBye: boolean;
  isDraw: boolean;
  player1UvsgamesId: number;
  player2UvsgamesId: number | null;
  winnerUvsgamesId: number | null;
  gamesWonP1: number | null;
  gamesWonP2: number | null;
}

export interface UvsRoundMatchesResult {
  matches: UvsMatchProjection[];
  players: Map<number, string>;
  dropped: number;
}

interface UvsMatchSeat {
  userId: number;
  won: boolean;
  gamesWon: number | null;
}

function matchSeatUserId(seat: Json | null): number | null {
  const direct = record(record(seat?.user_event_status)?.user)?.id;
  if (typeof direct === "number" && Number.isInteger(direct) && direct > 0) {
    return direct;
  }
  const legacy = record(seat?.player)?.id;
  return typeof legacy === "number" && Number.isInteger(legacy) && legacy > 0 ? legacy : null;
}

/**
 * `best_identifier` means the handle on `user_event_status` but the account's
 * real name on `user`/`player`; check `user_event_status` first or every
 * participant's handle gets overwritten with their real name.
 */
function matchSeatName(seat: Json | null): string | null {
  return (
    text(record(seat?.user_event_status)?.best_identifier) ??
    text(record(seat?.player)?.best_identifier) ??
    text(record(record(seat?.user_event_status)?.user)?.best_identifier)
  );
}

function seatWon(seat: Json | null, userId: number, winningPlayer: number | null): boolean {
  if (seat?.is_winner === true) {
    return true;
  }
  if (winningPlayer === null) {
    return false;
  }
  return winningPlayer === userId || winningPlayer === record(seat?.player)?.id;
}

/**
 * The source's match id keys the staged row, so a player paired twice in one
 * round keeps both matches. Rows with no id, no readable seat, a missing
 * opponent on a non-bye, or more than two seats are dropped and counted.
 */
export function projectRoundMatches(
  round: UvsRoundMeta,
  rows: readonly unknown[],
): UvsRoundMatchesResult {
  const matches: UvsMatchProjection[] = [];
  const players = new Map<number, string>();
  let dropped = 0;

  for (const raw of rows) {
    const row = record(raw);
    const sourceMatchId = text(row?.id);
    if (row === null || sourceMatchId === null) {
      dropped++;
      continue;
    }
    const winningPlayer =
      typeof row.winning_player === "number" && Number.isInteger(row.winning_player)
        ? row.winning_player
        : null;
    // v2 keeps the rich per-seat rows in player_match_relationships; `players`
    // is the legacy shape's home and a bare id array on v2.
    const relationshipSeats = array(row.player_match_relationships);
    const seatRows = relationshipSeats.length > 0 ? relationshipSeats : array(row.players);

    const seats: UvsMatchSeat[] = [];
    let unreadableSeats = 0;
    for (const rawSeat of seatRows) {
      const seat = record(rawSeat);
      const userId = seat === null ? null : matchSeatUserId(seat);
      if (seat === null || userId === null) {
        unreadableSeats++;
        continue;
      }
      const name = matchSeatName(seat);
      if (name !== null && !players.has(userId)) {
        players.set(userId, name);
      }
      seats.push({
        userId,
        won: seatWon(seat, userId, winningPlayer),
        gamesWon: count(seat.games_won),
      });
    }

    const isBye = row.match_is_bye === true;
    const representable =
      seats.length > 0 &&
      seats.length <= 2 &&
      (isBye || (seats.length === 2 && unreadableSeats === 0));
    if (!representable) {
      dropped++;
      continue;
    }

    seats.sort((a, b) => a.userId - b.userId);
    const [first, second = null] = seats;

    const winner = seats.find((seat) => seat.won) ?? null;
    // v2 carries no per-seat games_won; derive it from the match-level
    // winner/loser counts when the outcome is known.
    const wonByWinner = count(row.games_won_by_winner);
    const wonByLoser = count(row.games_won_by_loser);
    const gamesFor = (seat: UvsMatchSeat): number | null => {
      if (seat.gamesWon !== null) {
        return seat.gamesWon;
      }
      if (winner === null) {
        return null;
      }
      return seat.won ? wonByWinner : wonByLoser;
    };

    matches.push({
      sourceMatchId,
      roundId: round.roundId,
      phaseOrder: round.phaseOrder,
      roundNumber: round.roundNumber,
      tableNumber: positive(row.table_number),
      isBye,
      isDraw: row.match_is_intentional_draw === true || row.match_is_unintentional_draw === true,
      player1UvsgamesId: first.userId,
      player2UvsgamesId: second === null ? null : second.userId,
      winnerUvsgamesId: winner === null ? null : winner.userId,
      gamesWonP1: gamesFor(first),
      gamesWonP2: second === null ? null : gamesFor(second),
    });
  }

  return { matches, players, dropped };
}

export function referencedDeckIds(registrations: readonly unknown[]): string[] {
  const ids = new Set<string>();
  for (const row of registrations) {
    const deckId = text(record(row)?.deck_id);
    if (deckId !== null) {
      ids.add(deckId);
    }
  }
  return [...ids];
}

/** What the per-round standings say about one registration beyond its rank. */
interface UvsStandingDetail {
  legendName: string | null;
  matchPoints: number | null;
  opponentMatchWinPct: number | null;
  gameWinPct: number | null;
  opponentGameWinPct: number | null;
}

/** First row per registration wins. Callers must hand rounds latest-first. */
function standingsByRegistration(
  roundStandings: readonly unknown[],
): Map<string, UvsStandingDetail> {
  const details = new Map<string, UvsStandingDetail>();
  for (const rawRow of roundStandings) {
    const row = record(rawRow);
    const status = record(row?.user_event_status);
    const registrationId = text(status?.id);
    if (registrationId === null || details.has(registrationId)) {
      continue;
    }
    details.set(registrationId, {
      legendName: text(record(status?.deck_defining_card)?.name),
      matchPoints: count(row?.match_points) ?? count(status?.total_match_points),
      opponentMatchWinPct: fraction(row?.opponent_match_win_percentage),
      gameWinPct: fraction(row?.game_win_percentage),
      opponentGameWinPct: fraction(row?.opponent_game_win_percentage),
    });
  }
  return details;
}

/** One phase of the source's tournament structure, as `meta_event_phases` stores it. */
export interface UvsPhaseProjection {
  phaseOrder: number;
  name: string | null;
  roundType: string;
  roundCount: number | null;
  rankRequired: number | null;
  maxGameWins: number | null;
}

/**
 * Cut size comes from `rank_required_to_enter_phase`; the source's own
 * `top_cut_size` field is null on every event observed.
 */
export function projectPhases(detail: unknown): UvsPhaseProjection[] {
  const phases: UvsPhaseProjection[] = [];
  for (const [phaseOrder, rawPhase] of array(record(detail)?.tournament_phases).entries()) {
    const phase = record(rawPhase);
    const roundType = text(phase?.round_type);
    if (roundType === null) {
      continue;
    }
    phases.push({
      phaseOrder,
      name: text(phase?.phase_name)?.slice(0, 120) ?? null,
      roundType,
      roundCount: positive(phase?.number_of_rounds),
      rankRequired: positive(phase?.rank_required_to_enter_phase),
      maxGameWins: positive(phase?.effective_maximum_number_of_game_wins_per_match),
    });
  }
  return phases;
}

/** Names that appear twice are dropped: a wrong rank is worse than a missing player. */
function ranksByDisplayName(standings: readonly unknown[]): Map<string, number> {
  const seen = new Map<string, number | null>();
  for (const row of standings) {
    const entry = record(row);
    const name = text(entry?.tv_display_name);
    const rank = positive(entry?.rank);
    if (name === null || rank === null) {
      continue;
    }
    const key = name.toLowerCase();
    seen.set(key, seen.has(key) ? null : rank);
  }
  const ranks = new Map<string, number>();
  for (const [name, rank] of seen) {
    if (rank !== null) {
      ranks.set(name, rank);
    }
  }
  return ranks;
}

interface DeckLine {
  name: string;
  zone: string;
  quantity: number;
}

interface DeckLines {
  cards: DeckLine[];
  championName: string | null;
}

/**
 * Probes `section_type`, `type`, then `name`: today's shape names the zone in
 * `section_type` (`main`, `rune_pool`); the older shape only in `name`.
 */
function sectionZone(section: Json | null): string {
  for (const raw of [section?.section_type, section?.type, section?.name]) {
    const key = text(raw)
      ?.toLowerCase()
      .replaceAll(/[\s-]+/gu, "_");
    const zone = key === undefined || key === null ? undefined : ZONE_BY_SECTION[key];
    if (zone !== undefined) {
      return zone;
    }
  }
  return WellKnown.deckZone.MAIN;
}

export function readDeckLines(deck: unknown): DeckLines | null {
  const row = record(deck);
  if (row === null) {
    return null;
  }
  const sections = [row.sections, row.deck_sections, row.card_sections].find((value) =>
    Array.isArray(value),
  );
  const cards: DeckLine[] = [];
  let championName: string | null = null;

  for (const rawSection of array(sections)) {
    const section = record(rawSection);
    const sectionSlot = sectionZone(section);
    for (const rawEntry of array(section?.cards ?? section?.entries)) {
      const entry = record(rawEntry);
      const card = record(entry?.card);
      const name = text(entry?.name) ?? text(card?.name) ?? text(entry?.card_name);
      if (name === null) {
        continue;
      }
      const byType = ZONE_BY_CARD_TYPE[text(card?.type)?.toLowerCase() ?? ""];
      const zone =
        sectionSlot === WellKnown.deckZone.MAIN && byType !== undefined ? byType : sectionSlot;
      const quantity = positive(entry?.quantity) ?? positive(entry?.count) ?? 1;
      cards.push({ name, zone, quantity });
      if (zone === WellKnown.deckZone.CHAMPION && championName === null) {
        championName = name;
      }
    }
  }

  return cards.length === 0 ? null : { cards, championName };
}

/**
 * Requires {@link withSingleChampion} to have already run; an unnormalised
 * champion playset leaves `main` short and misreads as partial.
 */
export function listStatusFor(
  cards: readonly DeckLine[],
  standingsLegend: string | null,
): "full" | "partial" {
  const held = new Map<string, number>();
  for (const card of cards) {
    held.set(card.zone, (held.get(card.zone) ?? 0) + card.quantity);
  }
  if (standingsLegend !== null) {
    held.set(WellKnown.deckZone.LEGEND, Math.max(held.get(WellKnown.deckZone.LEGEND) ?? 0, 1));
  }
  const complete = REQUIRED_ZONES.every(
    (zone) => (held.get(zone) ?? 0) >= (ZONE_EXPECTED[zone] ?? 0),
  );
  return complete ? "full" : "partial";
}

/** Moves champion-zone lines past the first copy into the main deck; the zone holds exactly one card. */
export function withSingleChampion<TLine extends { zone: string; quantity: number }>(
  cards: readonly TLine[],
): TLine[] {
  let seatsLeft = 1;
  return cards.flatMap((line): TLine[] => {
    if (line.zone !== WellKnown.deckZone.CHAMPION) {
      return [line];
    }
    const seated = Math.min(seatsLeft, line.quantity);
    seatsLeft -= seated;
    const spilled = line.quantity - seated;
    return [
      ...(seated > 0 ? [{ ...line, quantity: seated }] : []),
      ...(spilled > 0 ? [{ ...line, zone: WellKnown.deckZone.MAIN, quantity: spilled }] : []),
    ];
  });
}

export function projectUvsStandings(raw: UvsDeepFetchResponses): UvsTransformResult {
  const standings = standingsByRegistration(raw.roundStandings);
  const ranks = ranksByDisplayName(raw.standings);

  const rows: UvsStandingProjection[] = [];
  const identities: UvsPlayerIdentity[] = [];
  let dropped = 0;

  for (const rawRegistration of raw.registrations) {
    const registration = record(rawRegistration);
    const registrationId = text(registration?.id);
    const playerName = text(registration?.best_identifier);
    if (registrationId === null || playerName === null) {
      dropped++;
      continue;
    }
    const rank =
      positive(registration?.final_place_in_standings) ??
      ranks.get(playerName.toLowerCase()) ??
      null;
    if (rank === null) {
      dropped++;
      continue;
    }

    const rawUserId = record(registration?.user)?.id;
    const userId =
      typeof rawUserId === "number" && Number.isInteger(rawUserId) && rawUserId > 0
        ? rawUserId
        : null;
    if (userId !== null) {
      identities.push({ registrationId, userId, displayName: playerName });
    }

    const sourceDeckId = text(registration?.deck_id);

    const standing = standings.get(registrationId) ?? null;
    rows.push({
      registrationId,
      uvsgamesPlayerId: userId,
      // A keyed player is rendered under `uvsgames_players.display_name`.
      // The mirror stores a name only where there is no id to resolve.
      playerName: userId === null ? playerName.slice(0, 80) : null,
      rank,
      wins: count(registration?.matches_won),
      losses: count(registration?.matches_lost),
      draws: count(registration?.matches_drawn),
      matchPoints: standing?.matchPoints ?? count(registration?.total_match_points),
      opponentMatchWinPct: standing?.opponentMatchWinPct ?? null,
      gameWinPct: standing?.gameWinPct ?? null,
      opponentGameWinPct: standing?.opponentGameWinPct ?? null,
      entryStatus: entryStatus(registration?.registration_status),
      legendName: standing?.legendName ?? null,
      sourceDeckId,
    });
  }

  // A TO reporting no results shows every player as 0-0-1 from a placeholder
  // round; null the record out unless it's a genuine two-player all-draw.
  const matchesTracked =
    rows.length <= 2 || rows.some((row) => (row.wins ?? 0) > 0 || (row.losses ?? 0) > 0);
  if (!matchesTracked) {
    for (const row of rows) {
      row.wins = null;
      row.losses = null;
      row.draws = null;
    }
  }

  return { standings: rows, dropped, players: identities };
}

/** One fetched decklist as `uvsgames_decklist_cards` rows, in published order. */
export interface UvsDecklistLineProjection {
  lineNumber: number;
  zone: string;
  quantity: number;
  cardName: string;
}

/** Null when the payload carries no readable lines: recorded as a fetched deck with no lines, never retried. */
export function projectUvsDecklistCards(deck: unknown): UvsDecklistLineProjection[] | null {
  const lines = readDeckLines(deck);
  if (lines === null) {
    return null;
  }
  return lines.cards.map((card, index) => ({
    lineNumber: index,
    zone: card.zone,
    quantity: card.quantity,
    cardName: card.name,
  }));
}
