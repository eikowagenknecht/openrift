import { UVSGAMES_PROVIDER } from "../../../../lib/meta-providers.js";
import { DECKLIST_PUBLISHED } from "../../lib/meta-recheck-schedule.js";
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

const MAX_DECK_FETCHES = 400;
const COMPLETE = "complete";
const DECK_HEARTBEAT = 25;

export interface MetaDeepFetchResult {
  externalId: string;
  requests: number;
  players: number;
  decks: number;
  dropped: number;
  stagedMatches: number;
  liveMatches: number;
  phases: number;
  acceptedPlayers: number;
  skippedPlayers: number;
  errors: string[];
}

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

const MAX_PAGES = 100;

/**
 * Reaching MAX_PAGES is treated as a failed read, not a short one: callers
 * replace stored rows wholesale, so a partial list would delete rows.
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
 * Walks phases latest-first, taking each one's last completed round, and stops
 * after the first ungated phase: a top-cut round's standings omit players cut
 * before it, so this is the last round every remaining player was still seated in.
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
 * The projection keeps the first row it sees per registration, so passing
 * rounds latest-first gives a cut player their top-cut row and everyone else
 * their last swiss one.
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
 * A short or failed read aborts the whole pass before anything is written: the
 * event keeps what it already has, and the next visit refetches. `knownDetail`
 * is the recheck's already-fetched detail row, so this does not re-read it.
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
  // Mid-event, the round standings carry every rank the tv sheet would, so a
  // sheet the source withholds until the finals does not block the fetch.
  const standings =
    (await allPages(
      deps,
      `/api/v2/player/events/${id}/tv/standings/`,
      errors,
      "Final standings",
      TV_PAGE_SIZE,
    )) ?? (row.displayStatus === COMPLETE ? null : []);

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

  // Must precede the standings write: those rows reference players by user id.
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
  // Called even with zero standings, or a cancelled event's recheck never stops.
  await deps.repos.uvsgamesEvents.markResultsFetched(id, clock(deps));

  const phases = projectPhases(detail);
  if (phases.length > 0) {
    await deps.repos.uvsgamesResults.replacePhases(
      id,
      phases.map((phase) => ({ ...phase, externalId: id })),
    );
  }

  // Must run after the standings write, so a first pass sees the deck ids it
  // just mirrored.
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

  const source = await deps.repos.meta.sourceByKey(UVSGAMES_PROVIDER, id);
  if (source !== undefined) {
    const promoted = await promoteMetaEvent(deps.repos, source.metaEventId);
    result.acceptedPlayers = promoted.players;
    result.liveMatches = promoted.matches;
    result.phases = promoted.phases;
    errors.push(...promoted.errors);
    result.skippedPlayers = promoted.unresolvedNames.length;
  }

  return result;
}

/**
 * Rounds already held are skipped for good: a completed round's pairings are
 * locked at the source. A round whose pages did not all arrive is not written
 * at all, so the next visit retries it whole.
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
    // Must precede the match write: staged rows reference players by id.
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
      errors.push(errorText(error, `Round ${round.roundNumber}`));
      continue;
    }
    staged += projected.matches.length;
  }
  return staged;
}

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
      // Recorded with null lines, not skipped, or the next pass re-fetches it.
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

/** A 4xx means the source refuses the deck for good; anything else is transient. */
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
 * Merged, not written: a deck fetch runs inside a recheck pass, and a plain
 * write would replace that pass's counters with this event's.
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
