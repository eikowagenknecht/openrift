import { META_ENTRY_STATUSES, REQUIRED_ZONES, WellKnown, ZONE_EXPECTED } from "@openrift/shared";
import type { MetaEntryStatus } from "@openrift/shared";

/**
 * Projects one deep fetch's responses into the source mirror's columns
 * (ADR-014 revision 3).
 *
 * This is an allowlist, and that is the storage contract: a field named here
 * reaches `uvsgames_*`, and everything else is dropped where it is read. No
 * response body is kept, so a contact detail the source starts publishing
 * tomorrow cannot land in the database by default.
 *
 * Nothing here matches a card, maps a format or classifies a tier. Those are
 * promotion's job, and keeping them out is what makes a mapping fix a
 * re-promote instead of a re-crawl.
 *
 * Everything reads `unknown`. The source publishes no schema, so a field that
 * changed shape must degrade to "we don't know that" rather than throw
 * mid-crawl: a player with no name is dropped and counted, an unreadable deck
 * section becomes a standings-only row.
 */

/** The responses one deep fetch makes, held only long enough to project them. */
export interface UvsDeepFetchResponses {
  detail: unknown;
  registrations: unknown[];
  standings: unknown[];
  roundStandings: unknown[];
}

/** One row of `uvsgames_event_standings`, minus the event key the caller adds. */
export interface UvsStandingProjection {
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
  /** Registrations with no usable name or placement. Reported, never guessed at. */
  dropped: number;
  /** The player behind each registration, upserted into `uvsgames_players`. */
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

/** Source section key → `WellKnown.deckZone`. Anything else lands in the main deck. */
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

/**
 * Where a card belongs when the source filed it in the main deck but typed it
 * as something the main deck cannot hold. The source's own vocabulary, not the
 * catalog's, because the transform is pure and never sees a resolved card.
 * Only main-deck lines consult it: a Champion is a Unit, so a section that
 * names its zone outright is always the better authority.
 */
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

/** One mirrored match, as `uvsgames_event_matches` stores it minus the event FK. */
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
 * The zone one deck section stands for. The source names it in `section_type`
 * (`main`, `rune_pool`, `battlefield`) on today's shape and in `name` alone
 * (`Main Deck`, `Rune Pool`, `Battlefields`) on the older one, so all three
 * keys are probed and the first recognised spelling wins. An unknown key is a
 * section shape nobody has seen, whose cards are worth more in the main deck
 * than dropped.
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

/**
 * One fetched decklist as ingest card lines. The source publishes no schema, so
 * the section list, the key naming each section, and each entry's name and
 * quantity are all probed rather than destructured.
 */
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
 * Whether a list is the whole record of what was played, or only the part the
 * source published.
 *
 * uvsgames fills the Legend, Chosen Champion and Battlefields sections on a few
 * dozen of its several thousand lists and leaves them empty on the rest, so
 * `full` is earned per list rather than granted to every list that parsed. The
 * marker is what turns the deck page's missing zones into dashed "Unknown"
 * slots instead of zones the player is shown as having left empty.
 *
 * The standings legend counts as held: promotion files it into the list's own
 * Legend zone when the list carries none.
 *
 * The targets are the constructed baselines rather than `zoneExpected`, because
 * the mirror's format is still the source's unmapped string here.
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

/**
 * Every registration as a mirror row.
 *
 * Players come from the registrations, the only endpoint public for every
 * event, with the tiebreakers and the legend joined from the round standings
 * and the deck id kept as the source's own reference. The list behind that id
 * is projected separately, because a deck is fetched once and a standings row
 * is re-read on every visit.
 */
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
      // No placement anywhere: a drop, a no-show, or an event the source has
      // not finalised. Promotion has nothing to file such a row under, so it
      // is counted and skipped rather than mirrored rankless.
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

    // The registrations endpoint carries the record and the status; the
    // tiebreakers and the legend only exist on the round standings row.
    const standing = standings.get(registrationId) ?? null;
    rows.push({
      registrationId,
      uvsgamesPlayerId: userId,
      // A keyed player is rendered under `uvsgames_players.display_name`, so
      // the mirror stores a name only where there is no id to resolve.
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

  // A TO who reports no match results still enters placements, and the source
  // then shows every player as 0-0-1 from a single placeholder round. A field
  // with zero wins and zero losses means matches were never tracked, so no
  // record is stored. A two-player field is exempt: one genuinely drawn match
  // is the only real all-draw event.
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

/**
 * @returns The deck's lines, or null when the payload carried none readable —
 *   which the caller records as a fetched deck with no lines rather than
 *   retrying it.
 */
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
