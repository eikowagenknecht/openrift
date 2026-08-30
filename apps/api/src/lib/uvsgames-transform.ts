import { META_ENTRY_STATUSES, WellKnown } from "@openrift/shared";
import type {
  MetaEntryStatus,
  MetaEventTier,
  MetaIngestEvent,
  MetaIngestEventPlayer,
} from "@openrift/shared";

import type { CandidateMetaEventRaw } from "../db/index.js";
import { classifyMetaEventTier, countryFromAddress } from "./meta-event-classify.js";
import { uvsgamesEventUrl, venueLocalDay } from "./uvsgames-catalog.js";

/**
 * Turns one deep fetch's responses into the upload payload the candidate ingest
 * already accepts, so the fetcher and the push endpoint stage identical rows.
 *
 * Everything here reads `unknown`. The source publishes no schema, so a field
 * that changed shape must degrade to "we don't know that" rather than throw
 * mid-crawl: a player with no name is dropped and counted, an unreadable deck
 * section becomes a standings-only row.
 */

/** The five responses one deep fetch makes, as stored on `candidate_meta_events.raw`. */
export interface UvsDeepFetchRaw {
  detail: unknown;
  registrations: unknown[];
  standings: unknown[];
  roundStandings: unknown[];
  /**
   * Keyed by the source's deck id; only populated when the event published its
   * lists. Decklists are locked once the event runs, so entries accumulate
   * across fetches and are never requested twice: a `null` entry records a deck
   * the source refused to serve, kept so the id is not retried every pass.
   */
  decks: Record<string, unknown>;
}

/** The catalogue projection's fields the event payload is built from. */
export interface UvsEventFacts {
  externalId: string;
  name: string;
  startAt: Date;
  timezone: string | null;
  eventFormat: string | null;
  playerCount: number | null;
  storeName: string | null;
  location: string | null;
  /** The admin-mapped tier of the event's template, resolved by the caller; null when unmapped. */
  templateTier: MetaEventTier | null;
}

export interface UvsTransformResult {
  event: MetaIngestEvent;
  /** Registrations with no usable name or placement. Reported, never guessed at. */
  dropped: number;
  /** Decks whose sections carried no readable card line. */
  unreadableDecks: number;
  /**
   * The player behind each registration, keyed by the registration id the staged
   * rows carry. It rides beside the event rather than inside it because the
   * ingest payload is the shared upload shape, which has no place for a
   * source-specific identity — the deep fetch stamps these on afterwards.
   */
  players: UvsPlayerIdentity[];
}

/** One player as the source's registration names them. */
interface UvsPlayerIdentity {
  /** The registration id, which is the staged row's `external_id`. */
  registrationId: string;
  /** The source's global user id. */
  userId: number;
  displayName: string;
}

/** Source section type → `WellKnown.deckZone`. Anything else lands in the main deck. */
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

/** The source's registration status, lowered into the archive's vocabulary. */
function entryStatus(value: unknown): MetaEntryStatus | null {
  const lowered = text(value)?.toLowerCase();
  return META_ENTRY_STATUSES.find((status) => status === lowered) ?? null;
}

function positive(value: unknown): number | null {
  const parsed = count(value);
  return parsed === null || parsed === 0 ? null : parsed;
}

/** One finished round as the detail's phase list names it. */
export interface UvsRoundMeta {
  roundId: string;
  /** Position of the round's phase in the detail (Day 1, Day 2, top cut). */
  phaseOrder: number;
  /** The round's position within its phase, from the source when it says one. */
  roundNumber: number;
}

/**
 * The rounds the source reports as finished, in the order the phases list them.
 * Matches are read from all of them. Standings are read from a few: the last
 * round of a phase names everyone still seated in that phase, but a top cut is
 * a phase of its own, so the field a cut left behind is only named by the phase
 * before it. `phaseOrder` is what lets the caller walk back that far.
 */
export function completedRounds(detail: unknown): UvsRoundMeta[] {
  const rounds: UvsRoundMeta[] = [];
  const phases = array(record(detail)?.tournament_phases);
  for (const [phaseOrder, phase] of phases.entries()) {
    const phaseRounds = array(record(phase)?.rounds);
    const numbered = phaseRounds.map((round) => positive(record(round)?.round_number));
    // The source's own numbers are only usable when it numbers the whole phase
    // distinctly; mixing them with the positional fallback would render two of
    // the phase's rounds under one number.
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

/** One staged match, as `candidate_meta_matches` stores it minus the event FK. */
interface UvsMatchProjection {
  /** The source's own match id, and the staged row's key. */
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
  /** User id -> handle for participants the round names, for the player upsert. */
  players: Map<number, string>;
  /** Rows with no id, no readable seat, an unreadable opponent, or extra seats. */
  dropped: number;
}

interface UvsMatchSeat {
  userId: number;
  won: boolean;
  gamesWon: number | null;
}

/** The source's global user id behind one match seat. */
function matchSeatUserId(seat: Json | null): number | null {
  const direct = record(record(seat?.user_event_status)?.user)?.id;
  if (typeof direct === "number" && Number.isInteger(direct) && direct > 0) {
    return direct;
  }
  const legacy = record(seat?.player)?.id;
  return typeof legacy === "number" && Number.isInteger(legacy) && legacy > 0 ? legacy : null;
}

/**
 * The handle the player entered under, which is what the registrations path
 * stores and what the standings render. `best_identifier` names a different
 * thing at each level: on `user_event_status` it is the handle, on `user` and
 * on the legacy `player` it is the account name, which is a real name for ~90 %
 * of players. Reading those first overwrote every participant's handle with
 * their real name as soon as a round staged. They stay as fallbacks only
 * because a seat with no name at all costs the whole round: its player row
 * cannot be written, so the staging insert fails the FK.
 */
function matchSeatName(seat: Json | null): string | null {
  return (
    text(record(seat?.user_event_status)?.best_identifier) ??
    text(record(seat?.player)?.best_identifier) ??
    text(record(record(seat?.user_event_status)?.user)?.best_identifier)
  );
}

/** Whether this seat won, from its own flag or the match-level winner id. */
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
 * One completed round's matches from `tournament-rounds/{id}/matches/paginated/`,
 * as staged rows (ADR-014, "Pairings"). The source's match id is the row's key,
 * so a player it pairs twice in one round keeps both matches; participants are
 * still ordered by user id, which is what makes the seat columns deterministic.
 * A row that cannot be represented, meaning no id, no readable seat, an
 * unreadable or missing opponent on a non-bye, or more than two seats, is
 * dropped and counted, never guessed at.
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

/** The deck ids the event's registrations reference, deduped and in listing order. */
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

/** The deck entries a stored raw payload already holds, `null` markers included. */
export function storedDecks(
  raw: CandidateMetaEventRaw | null | undefined,
): Record<string, unknown> {
  return record(raw?.decks) ?? {};
}

/** Referenced deck ids a stored raw payload has no entry for — the fetch's remaining work. */
export function unfetchedDeckIds(raw: CandidateMetaEventRaw | null | undefined): string[] {
  const decks = storedDecks(raw);
  const registrations = Array.isArray(raw?.registrations) ? raw.registrations : [];
  return referencedDeckIds(registrations).filter((id) => !Object.hasOwn(decks, id));
}

/** What the per-round standings say about one registration beyond its rank. */
interface UvsStandingDetail {
  legendName: string | null;
  matchPoints: number | null;
  opponentMatchWinPct: number | null;
  gameWinPct: number | null;
  opponentGameWinPct: number | null;
}

/**
 * Registration id → that player's standings row, read from the per-round
 * standings. It carries the legend as `deck_defining_card` (verified to be the
 * legend for effectively every observed deck, and the only place it appears for
 * an event that published no lists) alongside the match points and tiebreakers
 * the standings are ordered by.
 *
 * The registrations endpoint has neither, which is why both are read here.
 *
 * The first row for a registration wins. Callers hand the rounds over latest
 * first, so a player who made the top cut keeps their cut row and everyone else
 * keeps the last round they actually played.
 */
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
 * The event's phase structure, from the same `tournament_phases` list
 * {@link completedRounds} walks for round ids.
 *
 * `rank_required_to_enter_phase` is where a cut size comes from: the source has
 * a `top_cut_size` field of its own and leaves it null on every event observed.
 * A phase with no `round_type` is skipped rather than stored typeless, since
 * the type is the only reason the row is worth keeping.
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

/**
 * Display name → final rank from the tv standings, used only to fill a
 * registration the source left without a placement. Names that appear twice are
 * dropped: a wrong rank is worse than a missing player.
 */
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

interface DeckLines {
  cards: NonNullable<MetaIngestEventPlayer["cards"]>;
  championName: string | null;
}

/**
 * One fetched decklist as ingest card lines. Section shape has moved around, so
 * the section list, its type, and each entry's name and quantity are all probed
 * rather than destructured.
 */
export function readDeckLines(deck: unknown): DeckLines | null {
  const row = record(deck);
  if (row === null) {
    return null;
  }
  const sections = [row.sections, row.deck_sections, row.card_sections].find((value) =>
    Array.isArray(value),
  );
  const cards: DeckLines["cards"] = [];
  let championName: string | null = null;

  for (const rawSection of array(sections)) {
    const section = record(rawSection);
    const type = text(section?.type)?.toLowerCase() ?? "";
    const zone = ZONE_BY_SECTION[type] ?? WellKnown.deckZone.MAIN;
    for (const rawEntry of array(section?.cards ?? section?.entries)) {
      const entry = record(rawEntry);
      const name = text(entry?.name) ?? text(record(entry?.card)?.name) ?? text(entry?.card_name);
      if (name === null) {
        continue;
      }
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
 * The whole event as one upload payload. Players come from the registrations —
 * the only endpoint that is public for every event — with their legend joined
 * from the round standings and their list attached when the organizer published
 * one.
 */
export function transformUvsEvent(facts: UvsEventFacts, raw: UvsDeepFetchRaw): UvsTransformResult {
  const standings = standingsByRegistration(raw.roundStandings);
  const ranks = ranksByDisplayName(raw.standings);

  const players: MetaIngestEventPlayer[] = [];
  const identities: UvsPlayerIdentity[] = [];
  let dropped = 0;
  let unreadableDecks = 0;

  for (const rawRegistration of raw.registrations) {
    const registration = record(rawRegistration);
    const externalId = text(registration?.id);
    const playerName = text(registration?.best_identifier);
    if (externalId === null || playerName === null) {
      dropped++;
      continue;
    }
    const rank =
      positive(registration?.final_place_in_standings) ??
      ranks.get(playerName.toLowerCase()) ??
      null;
    if (rank === null) {
      // No placement anywhere: a drop, a no-show, or an event the source has
      // not finalised. Either way there is no standings row to write.
      dropped++;
      continue;
    }

    const userId = record(registration?.user)?.id;
    if (typeof userId === "number" && Number.isInteger(userId) && userId > 0) {
      identities.push({ registrationId: externalId, userId, displayName: playerName });
    }

    const deckId = text(registration?.deck_id);
    const lines = deckId === null ? null : readDeckLines(raw.decks[deckId]);
    // A null entry is a deck the source refused, not one it served unreadably.
    if (
      deckId !== null &&
      raw.decks[deckId] !== undefined &&
      raw.decks[deckId] !== null &&
      lines === null
    ) {
      unreadableDecks++;
    }

    // The registrations endpoint carries the record and the status; the
    // tiebreakers and the legend only exist on the standings row.
    const standing = standings.get(externalId) ?? null;
    const scalars = {
      externalId,
      // The candidate column CHECKs 1..80.
      playerName: playerName.slice(0, 80),
      rank,
      // The source publishes exact final standings, never cut buckets.
      rankIsTier: false,
      wins: count(registration?.matches_won),
      losses: count(registration?.matches_lost),
      draws: count(registration?.matches_drawn),
      matchPoints: standing?.matchPoints ?? count(registration?.total_match_points),
      opponentMatchWinPct: standing?.opponentMatchWinPct ?? null,
      gameWinPct: standing?.gameWinPct ?? null,
      opponentGameWinPct: standing?.opponentGameWinPct ?? null,
      entryStatus: entryStatus(registration?.registration_status),
      legendName: standing?.legendName ?? null,
      championName: lines?.championName ?? null,
    };
    // The upload shape pairs the list with its status, so the two branches are
    // separate objects rather than one with a nullable field.
    players.push(
      lines === null
        ? { ...scalars, cards: null, listStatus: "none" }
        : { ...scalars, cards: lines.cards, listStatus: "full" },
    );
  }

  // A TO who reports no match results still enters placements, and the source
  // then shows every player as 0-0-1 from a single placeholder round. A field
  // with zero wins and zero losses means matches were never tracked, so no
  // record is stored. A two-player field is exempt: one genuinely drawn match
  // is the only real all-draw event.
  const matchesTracked =
    players.length <= 2 ||
    players.some((player) => (player.wins ?? 0) > 0 || (player.losses ?? 0) > 0);
  if (!matchesTracked) {
    for (const player of players) {
      player.wins = null;
      player.losses = null;
      player.draws = null;
    }
  }

  const detailName = text(record(raw.detail)?.name);
  const name = (detailName ?? facts.name).slice(0, 120);
  const location = facts.location === null ? null : facts.location.trim().slice(0, 500) || null;
  return {
    event: {
      externalId: facts.externalId,
      name,
      eventDate: venueLocalDay(facts.startAt, facts.timezone),
      // The source's own vocabulary, lowercased. Resolving it against the
      // admin's format mappings is the caller's job — this stays a pure
      // transform — and an unmapped format is stored as the source wrote it:
      // the candidate column has no FK, and the review screen reporting
      // "constructed_2v2" beats an event silently filed under the wrong rules.
      format: facts.eventFormat?.toLowerCase() ?? "unknown",
      playerCount: facts.playerCount,
      organizer: facts.storeName === null ? null : facts.storeName.slice(0, 120),
      sourceUrl: uvsgamesEventUrl(facts.externalId),
      notes: null,
      tier: classifyMetaEventTier({
        templateTier: facts.templateTier,
        playerCount: facts.playerCount,
      }),
      country: countryFromAddress(location),
      location,
      extraData: null,
      players,
    },
    dropped,
    unreadableDecks,
    players: identities,
  };
}
