import { DECKLIST_PUBLISHED } from "../../lib/meta-recheck-schedule.js";
import { UVSGAMES_PROVIDER } from "../../lib/uvsgames-catalog.js";
import type { UvsDeepFetchResponses, UvsRoundMeta } from "../../lib/uvsgames-transform.js";
import {
  completedRounds,
  projectPhases,
  projectRoundMatches,
  projectUvsDecklistCards,
  projectUvsStandings,
} from "../../lib/uvsgames-transform.js";
import type { UvsgamesListRow } from "../../repositories/uvsgames-events.js";
import { promoteMetaEvent } from "../meta-promote.js";
import type { MetaSyncDeps } from "./deps.js";
import { clock, errorText } from "./deps.js";
import { MAX_PAGE_SIZE, UvsHttpError } from "./uvsgames-client.js";

/**
 * One accepted event's results: the detail, the whole registration list, the
 * final standings, the last completed round's standings for the legend each
 * player played, and every completed round's match list. About five requests
 * plus one per round, plus one per decklist and only when the organizer
 * published them.
 *
 * The output is this source's own mirror tables (ADR-014 revision 3). Every
 * response is projected into named columns as it arrives and then dropped: no
 * body is stored, so nothing the archive did not ask for can land. Promotion is
 * what turns any of it into live rows.
 *
 * Two things are fetched once and never again, because the source cannot change
 * them: a completed round's pairings, and a published decklist. Both are
 * recorded as held so the next pass can tell "already have it" from "not asked
 * yet" with a query rather than a scan.
 */

/**
 * The ceiling on decklist requests for one event. A published 500-player event
 * would otherwise spend five minutes of the sync's whole weekly budget in one
 * pass; the remainder is picked up by the next ladder step.
 */
const MAX_DECK_FETCHES = 400;

/** How often a long deck crawl reports progress into its job run. */
const DECK_HEARTBEAT = 25;

export interface MetaDeepFetchResult {
  externalId: string;
  requests: number;
  players: number;
  decks: number;
  /** Registrations with no name or no placement. */
  dropped: number;
  /** Matches newly mirrored this pass, across every round fetched. */
  stagedMatches: number;
  /** Mirror matches promoted onto the live event this pass. */
  liveMatches: number;
  /** Phase rows the live event now carries. */
  phases: number;
  acceptedPlayers: number;
  skippedPlayers: number;
  errors: string[];
}

/** The zeroed result: what a pass that wrote nothing reports, and where one that writes starts. */
function emptyFetchResult(
  externalId: string,
  requests: number,
  errors: string[],
): MetaDeepFetchResult {
  return {
    externalId,
    requests,
    players: 0,
    decks: 0,
    dropped: 0,
    stagedMatches: 0,
    liveMatches: 0,
    phases: 0,
    acceptedPlayers: 0,
    skippedPlayers: 0,
    errors,
  };
}

/** The `tv/*` endpoints page at 500 where everything else caps at 250. */
const TV_PAGE_SIZE = 500;

/**
 * The bound on a paginated read, so a source bug that never stops handing out
 * next pointers cannot spin a fetch forever. Reaching it is a failed read, not
 * a short one: every caller replaces stored rows with what it is handed.
 */
const MAX_PAGES = 100;

/**
 * Every page of a paginated endpoint, following the envelope's own next
 * pointer, or null when any page failed. A short list is worse than no list:
 * the mirror replaces an event's standings with what it is handed, so a
 * missing page would delete the players it did not carry.
 */
async function allPages(
  deps: MetaSyncDeps,
  path: string,
  errors: string[],
  label: string,
  pageSize = MAX_PAGE_SIZE,
): Promise<unknown[] | null> {
  const rows: unknown[] = [];
  let page = 1;
  for (let guard = 0; guard < MAX_PAGES; guard++) {
    const outcome = await readPage(deps, path, page, pageSize, errors, label);
    if (outcome === null) {
      return null;
    }
    rows.push(...outcome.results);
    if (outcome.nextPage === null || outcome.nextPage <= page) {
      return rows;
    }
    page = outcome.nextPage;
  }
  errors.push(`${label} kept paging past ${MAX_PAGES} pages, so the list is not complete.`);
  return null;
}

async function readPage(
  deps: MetaSyncDeps,
  path: string,
  page: number,
  pageSize: number,
  errors: string[],
  label: string,
): Promise<{ results: unknown[]; nextPage: number | null } | null> {
  try {
    return await deps.client.page<unknown>(path, {}, page, pageSize);
  } catch (error) {
    errors.push(errorText(error, `${label} page ${page}`));
    return null;
  }
}

/**
 * The rounds whose standings carry each player's legend and tiebreakers, latest
 * first. One round is not enough on an event with a top cut: that round's
 * standings only cover the players who made the cut, leaving the rest of the
 * field with no legend at all. Walking the phases backwards and taking each
 * one's last completed round stops at the first phase nobody was cut from,
 * which is the last round every remaining player was still seated in.
 *
 * A phase the source gives no `rank_required_to_enter_phase` is treated as
 * ungated, so an event with no phase metadata reads exactly one round the way
 * it always did.
 */
function standingsRounds(rounds: readonly UvsRoundMeta[], detail: unknown): UvsRoundMeta[] {
  const gated = new Map(
    projectPhases(detail).map((phase) => [phase.phaseOrder, phase.rankRequired !== null]),
  );
  const lastPerPhase = new Map<number, UvsRoundMeta>();
  for (const round of rounds) {
    lastPerPhase.set(round.phaseOrder, round);
  }

  const picked: UvsRoundMeta[] = [];
  for (const phaseOrder of [...lastPerPhase.keys()].toSorted((a, b) => b - a)) {
    const round = lastPerPhase.get(phaseOrder);
    if (round !== undefined) {
      picked.push(round);
    }
    if (gated.get(phaseOrder) !== true) {
      break;
    }
  }
  return picked;
}

/**
 * The picked rounds' standings, concatenated in the order they were picked.
 * The projection keeps the first row it sees per registration, so latest first
 * is what gives a cut player their top-cut row and everyone else their last
 * swiss one.
 */
async function readStandings(
  deps: MetaSyncDeps,
  rounds: readonly UvsRoundMeta[],
  errors: string[],
): Promise<unknown[] | null> {
  const rows: unknown[] = [];
  for (const round of rounds) {
    const page = await allPages(
      deps,
      `/api/v2/tournament-rounds/${round.roundId}/standings/paginated/`,
      errors,
      `Round ${round.roundNumber} standings`,
    );
    if (page === null) {
      return null;
    }
    rows.push(...page);
  }
  return rows;
}

async function readOne(
  deps: MetaSyncDeps,
  path: string,
  errors: string[],
  label: string,
): Promise<unknown> {
  try {
    return await deps.client.get<unknown>(path);
  } catch (error) {
    errors.push(errorText(error, label));
    return null;
  }
}

/**
 * Pulls one event into this source's mirror, then promotes it. Failures are
 * collected rather than thrown, since the run has other events to visit, but a
 * read that came back short or failed stops the pass before anything is
 * written: the event keeps what it already has, and the next visit refetches.
 *
 * `knownDetail` is the recheck's already-fetched detail row, so a visit that
 * decides to fetch does not read the same URL twice.
 */
export async function deepFetchEvent(
  deps: MetaSyncDeps,
  row: UvsgamesListRow,
  runId?: string,
  knownDetail?: unknown,
): Promise<MetaDeepFetchResult> {
  const result = await fetchEvent(deps, row, runId, knownDetail);
  return {
    ...result,
    errors: result.errors.map((text) => `Event "${row.name}" (${row.externalId}): ${text}`),
  };
}

async function fetchEvent(
  deps: MetaSyncDeps,
  row: UvsgamesListRow,
  runId?: string,
  knownDetail?: unknown,
): Promise<MetaDeepFetchResult> {
  const before = deps.client.requests;
  const errors: string[] = [];
  const id = row.externalId;

  const detail =
    knownDetail === undefined
      ? await readOne(deps, `/api/v2/events/${id}/`, errors, "Event detail")
      : knownDetail;
  const registrations = await allPages(
    deps,
    `/api/v2/events/${id}/registrations/`,
    errors,
    "Registrations",
  );
  // Paged: a Regional's field runs to ~2 000 players, four tv pages deep.
  const standings = await allPages(
    deps,
    `/api/v2/player/events/${id}/tv/standings/`,
    errors,
    "Final standings",
    TV_PAGE_SIZE,
  );

  const rounds = completedRounds(detail);
  const roundStandings = await readStandings(deps, standingsRounds(rounds, detail), errors);

  if (detail === null || registrations === null || standings === null || roundStandings === null) {
    errors.push("The event's player list came back incomplete, so nothing was written.");
    return emptyFetchResult(id, deps.client.requests - before, errors);
  }

  const responses: UvsDeepFetchResponses = {
    detail,
    registrations,
    standings,
    roundStandings,
  };
  const projected = projectUvsStandings(responses);

  // Participants first: the standings rows reference them by user id, and a
  // seat the registrations named still needs its player row.
  await deps.repos.uvsgamesEvents.upsertPlayers(
    projected.players.map((player) => ({ id: player.userId, displayName: player.displayName })),
  );
  await deps.repos.uvsgamesResults.replaceStandings(
    id,
    projected.standings.map((standing) => ({
      ...standing,
      externalId: id,
      fetchedAt: clock(deps),
    })),
  );
  // Standings or no standings: a cancelled event's fetch also completed, and
  // the recheck ladder must not revisit it forever.
  await deps.repos.uvsgamesEvents.markResultsFetched(id, clock(deps));

  const phases = projectPhases(detail);
  if (phases.length > 0) {
    await deps.repos.uvsgamesResults.replacePhases(
      id,
      phases.map((phase) => ({ ...phase, externalId: id })),
    );
  }

  // Read after the standings write, so a first pass sees the deck ids it just
  // mirrored; decks already held, or already refused, are never requested
  // twice.
  const coverage = await deps.repos.uvsgamesResults.deckCoverage(id);
  const fetchedDecks = await fetchDecks(deps, row, id, coverage.outstanding, errors, runId);

  const stagedMatches = await stageEventMatches(deps, id, rounds, errors);
  const result: MetaDeepFetchResult = {
    ...emptyFetchResult(id, deps.client.requests - before, errors),
    players: projected.standings.length,
    decks: fetchedDecks,
    dropped: projected.dropped,
    stagedMatches,
  };

  // Everything above wrote this source's mirror. Turning it into live rows is
  // promotion's job, and it is safe to run whether or not this pass changed
  // anything: it re-reads the mirrors, re-applies the accepted overlays, and
  // updates the live rows in place.
  const source = await deps.repos.meta.sourceByKey(UVSGAMES_PROVIDER, id);
  if (source !== undefined) {
    const promoted = await promoteMetaEvent(deps.repos, source.metaEventId);
    result.acceptedPlayers = promoted.players;
    result.liveMatches = promoted.matches;
    result.phases = promoted.phases;
    errors.push(...promoted.errors);
    // Names the catalog could not match are the reviewer's queue, not a
    // failure: the standings row is live, only its list is withheld.
    result.skippedPlayers = promoted.unresolvedNames.length;
  }

  return result;
}

/**
 * Every completed round's matches, mirrored as `uvsgames_event_matches`.
 *
 * Rounds already held are skipped for good, because a completed round's
 * pairings are locked at the source. A round whose pages did not all arrive is
 * not written at all, so the next visit retries it whole instead of leaving
 * half a round mirrored forever.
 *
 * @returns How many matches were newly mirrored.
 */
async function stageEventMatches(
  deps: MetaSyncDeps,
  externalId: string,
  rounds: readonly UvsRoundMeta[],
  errors: string[],
): Promise<number> {
  if (rounds.length === 0) {
    return 0;
  }
  const held = new Set(await deps.repos.uvsgamesResults.heldRoundIds(externalId));
  let staged = 0;
  for (const round of rounds) {
    if (held.has(round.roundId)) {
      continue;
    }
    const rows = await readRoundMatches(deps, round, errors);
    if (rows === null) {
      continue;
    }
    const projected = projectRoundMatches(round, rows);
    if (projected.dropped > 0) {
      errors.push(`Round ${round.roundNumber}: ${projected.dropped} matches were unreadable.`);
    }
    if (projected.matches.length === 0) {
      continue;
    }
    // Participants first: the staged rows reference them, and a seat the
    // registrations never named (a late add, a dropped row) still needs its
    // player row.
    await deps.repos.uvsgamesEvents.upsertPlayers(
      [...projected.players].map(([id, displayName]) => ({ id, displayName })),
    );
    try {
      await deps.repos.uvsgamesResults.replaceRoundMatches(
        externalId,
        round.roundId,
        projected.matches.map((match) => ({ ...match, externalId })),
      );
    } catch (error) {
      // A refused round (say, a participant no player row could be written
      // for) stays unmirrored, so the next visit retries it whole.
      errors.push(errorText(error, `Round ${round.roundNumber}`));
      continue;
    }
    staged += projected.matches.length;
  }
  return staged;
}

/** One round's match pages, or null when any page failed. */
async function readRoundMatches(
  deps: MetaSyncDeps,
  round: UvsRoundMeta,
  errors: string[],
): Promise<unknown[] | null> {
  const rows: unknown[] = [];
  let page = 1;
  for (let guard = 0; guard < MAX_PAGES; guard++) {
    let outcome;
    try {
      outcome = await deps.client.page<unknown>(
        `/api/v2/tournament-rounds/${round.roundId}/matches/paginated/`,
        {},
        page,
        MAX_PAGE_SIZE,
      );
    } catch (error) {
      errors.push(errorText(error, `Round ${round.roundNumber} matches page ${page}`));
      return null;
    }
    rows.push(...outcome.results);
    if (outcome.nextPage === null || outcome.nextPage <= page) {
      return rows;
    }
    page = outcome.nextPage;
  }
  errors.push(
    `Round ${round.roundNumber} kept paging past ${MAX_PAGES} pages, so it was not staged.`,
  );
  return null;
}

/**
 * The decklists this event still owes, up to the per-pass ceiling.
 *
 * A published 500-player event would otherwise spend minutes of the weekly
 * budget in one visit; the remainder is picked up by the next ladder step,
 * because `outstanding` is recomputed from what the mirror already holds.
 */
async function fetchDecks(
  deps: MetaSyncDeps,
  row: UvsgamesListRow,
  externalId: string,
  outstanding: readonly string[],
  errors: string[],
  runId?: string,
): Promise<number> {
  if (row.decklistStatus !== DECKLIST_PUBLISHED) {
    return 0;
  }
  const wanted = outstanding.slice(0, MAX_DECK_FETCHES);
  let fetched = 0;
  for (const deckId of wanted) {
    const deck = await readDeck(deps, deckId, errors);
    fetched++;
    if (deck !== SKIPPED) {
      // A refused deck is recorded with no lines rather than left out, which is
      // what stops the next pass asking again. Same for one the source served
      // whose sections held nothing readable: it was answered, and re-reading
      // it would answer the same way.
      const lines = deck === null ? null : projectUvsDecklistCards(deck);
      await deps.repos.uvsgamesResults.putDecklist(
        {
          sourceDeckId: deckId,
          externalId,
          fetchStatus: deck === null ? "refused" : "fetched",
          fetchedAt: clock(deps),
        },
        lines ?? [],
      );
    }
    if (runId !== undefined && fetched % DECK_HEARTBEAT === 0) {
      await deckHeartbeat(deps, runId, row.externalId, fetched, wanted.length);
    }
  }
  return fetched;
}

/** Nothing is recorded: the failure looked transient, so the id stays fetchable. */
const SKIPPED = Symbol("deck skipped");

/**
 * One decklist, or what its failure means for the mirror: a 4xx is the source
 * refusing the deck for good and is recorded as `refused`, while a transient
 * failure (the client's retries already exhausted) records nothing so the next
 * pass tries again.
 */
async function readDeck(deps: MetaSyncDeps, deckId: string, errors: string[]): Promise<unknown> {
  try {
    return await deps.client.get<unknown>(`/api/v2/deckbuilder/decks/${deckId}/`);
  } catch (error) {
    errors.push(errorText(error, `Deck ${deckId}`));
    const refused = error instanceof UvsHttpError && error.status >= 400 && error.status < 500;
    return refused ? null : SKIPPED;
  }
}

/**
 * A published Regional spends minutes here at one request per second. The
 * progress is merged, not written: a deck fetch runs inside a recheck pass, and
 * a plain write would replace that pass's counters with this event's.
 */
async function deckHeartbeat(
  deps: MetaSyncDeps,
  runId: string,
  externalId: string,
  fetched: number,
  total: number,
): Promise<void> {
  try {
    await deps.repos.jobRuns.mergeResult(runId, {
      phase: "decks",
      event: externalId,
      decksFetched: fetched,
      decksTotal: total,
    });
  } catch (error) {
    deps.log.warn({ err: error, runId }, "Deck-fetch heartbeat write failed");
  }
}
