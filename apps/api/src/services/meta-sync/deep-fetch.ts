import { DECKLIST_PUBLISHED } from "../../lib/meta-recheck-schedule.js";
import { mapSourceFormat, UVSGAMES_PROVIDER } from "../../lib/uvsgames-catalog.js";
import type { UvsDeepFetchRaw, UvsRoundMeta } from "../../lib/uvsgames-transform.js";
import {
  completedRounds,
  projectPhases,
  projectRoundMatches,
  referencedDeckIds,
  storedDecks,
  transformUvsEvent,
} from "../../lib/uvsgames-transform.js";
import type { UvsgamesListRow } from "../../repositories/uvsgames-events.js";
import { ingestMetaCandidates } from "../ingest-meta-candidates.js";
import { materializeCandidateMatches, syncEventPhases } from "../meta-event-matches.js";
import { autoAcceptFetchedPlayers } from "./accept.js";
import type { MetaSyncDeps } from "./deps.js";
import { clock, errorText } from "./deps.js";
import { MAX_PAGE_SIZE, UvsHttpError } from "./uvsgames-client.js";

/**
 * One accepted event's results: the detail, the whole
 * registration list, the final standings, the last completed round's standings
 * for the legend each player played, and every completed round's match list —
 * about five requests plus one per round — plus one request per decklist, and
 * only when the organizer published them.
 *
 * The output is an ordinary candidate, written through the same ingest the push
 * endpoint uses, so review, linking, per-field accept, and diffs are all shared.
 * Matches are parsed straight into `candidate_meta_matches` and never ride in
 * the raw payload; a round already staged is never
 * refetched, the same accumulate-and-never-retry contract the decks follow.
 */

/**
 * The ceiling on decklist requests for one event. A published 500-player event
 * would otherwise spend five minutes of the sync's whole weekly budget in one
 * pass; the remainder is picked up by the next ladder step.
 */
const MAX_DECK_FETCHES = 400;

export interface MetaDeepFetchResult {
  externalId: string;
  requests: number;
  players: number;
  decks: number;
  /** Registrations with no name or no placement. */
  dropped: number;
  /** Matches newly staged this pass, across every round fetched. */
  stagedMatches: number;
  /** Staged matches copied onto the live event this pass. */
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
 * the ingest replaces an event's staged players with what it is handed, so a
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
 * `transformUvsEvent` keeps the first row it sees per registration, so latest
 * first is what gives a cut player their top-cut row and everyone else their
 * last swiss one.
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
 * Pulls one event and stages it as a candidate. Failures are collected rather
 * than thrown, since the run has other events to visit, but a read that came
 * back short or failed stops the pass before the ingest: the event keeps what
 * it already has, and the next visit fetches it again.
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
    errors.push("The event's player list came back incomplete, so nothing was staged.");
    return emptyFetchResult(id, deps.client.requests - before, errors);
  }

  // Read before the deck crawl: the stored raw says which decks are already
  // held, and the staged format guards the ingest below either way.
  const [staged, formatMappings, templateTiers] = await Promise.all([
    deps.repos.metaCandidates.eventsBySourceKeys(UVSGAMES_PROVIDER, [id]).then((rows) => rows[0]),
    deps.repos.uvsgamesEvents.formatMappings(),
    deps.repos.uvsgamesEvents.templateTiers(),
  ]);

  const decks = await fetchDecks(deps, row, registrations, storedDecks(staged?.raw), errors, runId);

  const raw: UvsDeepFetchRaw = {
    detail: sanitizeDetail(detail),
    registrations,
    standings,
    roundStandings,
    decks,
  };
  const transformed = transformUvsEvent(
    {
      externalId: id,
      name: row.name,
      startAt: row.startAt,
      timezone: row.timezone,
      eventFormat: row.eventFormat,
      playerCount: row.playerCount === null || row.playerCount === 0 ? null : row.playerCount,
      storeName: row.storeDisplayName,
      location: row.location,
      templateTier:
        row.eventConfigurationTemplate === null
          ? null
          : (templateTiers.get(row.eventConfigurationTemplate) ?? null),
    },
    raw,
  );

  // A fetch must not revert the format an admin picked by hand at accept, which
  // is the only way an event the source files as something unmappable gets into
  // the archive at all. The source's own vocabulary wins whenever it maps.
  const format =
    mapSourceFormat(formatMappings, row.eventFormat) ?? staged?.format ?? transformed.event.format;

  const ingest = await ingestMetaCandidates(deps.transact, UVSGAMES_PROVIDER, [
    { ...transformed.event, format },
  ]);
  errors.push(...ingest.errors);

  const result: MetaDeepFetchResult = {
    ...emptyFetchResult(id, deps.client.requests - before, errors),
    players: transformed.event.players.length,
    decks: Object.values(decks).filter((deck) => deck !== null).length,
    dropped: transformed.dropped,
  };

  // Re-read only when the ingest was the thing that created the row.
  const [candidate] =
    staged === undefined
      ? await deps.repos.metaCandidates.eventsBySourceKeys(UVSGAMES_PROVIDER, [id])
      : [staged];
  if (candidate === undefined) {
    // Only reachable when the key is on the ignore list: ingest skipped it, so
    // there is nothing to stamp and nothing to accept.
    return result;
  }
  await deps.repos.metaCandidates.updateEvent(candidate.id, { raw, fetchedAt: clock(deps) });

  // The players the registrations named, recorded once and then stamped onto the
  // rows the ingest just staged. Both halves run after the ingest: the staged
  // rows have to exist before they can be keyed to a player.
  await deps.repos.uvsgamesEvents.upsertPlayers(
    transformed.players.map((player) => ({ id: player.userId, displayName: player.displayName })),
  );
  await deps.repos.metaCandidates.setPlayerUvsIds(
    candidate.id,
    new Map(transformed.players.map((player) => [player.registrationId, player.userId])),
  );

  result.stagedMatches = await stageEventMatches(deps, candidate.id, rounds, errors);

  if (candidate.metaEventId !== null) {
    const accepted = await autoAcceptFetchedPlayers(deps, candidate.id, candidate.metaEventId);
    result.acceptedPlayers = accepted.accepted;
    result.skippedPlayers = accepted.skipped;
    errors.push(...accepted.errors);
    // A skipped player is work the pipeline left for a human — an unresolved
    // card name or a failed accept — so the event goes back into the review
    // queue rather than sitting published-but-partial behind a settled check.
    // Ignoring the player or fixing the card alias clears it on the next pass.
    if (accepted.skipped > 0) {
      await deps.repos.metaCandidates.setEventCheckedAt(candidate.id, null);
    }
    const matches = await materializeCandidateMatches(
      deps.repos,
      candidate.id,
      candidate.metaEventId,
    );
    result.liveMatches = matches.materialized;
    result.phases = await syncEventPhases(deps.repos, candidate.metaEventId, raw.detail);
  }

  return result;
}

/**
 * Every completed round's matches, staged as `candidate_meta_matches`.
 * Rounds already staged are skipped for good — a completed round's
 * matches are locked — and a round whose pages did not all arrive is not staged
 * at all, so the next visit retries it instead of holding half a round forever.
 *
 * @returns How many matches were newly staged.
 */
async function stageEventMatches(
  deps: MetaSyncDeps,
  candidateEventId: string,
  rounds: readonly UvsRoundMeta[],
  errors: string[],
): Promise<number> {
  if (rounds.length === 0) {
    return 0;
  }
  const held = new Set(await deps.repos.metaCandidates.matchRoundIds(candidateEventId));
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
      await deps.repos.metaCandidates.replaceRoundMatches(
        candidateEventId,
        round.roundId,
        projected.matches.map((match) => ({ candidateEventId, ...match })),
      );
    } catch (error) {
      // A refused round (say, a participant no player row could be written
      // for) stays unstaged, so the next visit retries it whole.
      errors.push(errorText(error, `Round ${round.roundNumber} staging`));
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
 * The event detail carries the store's contact email; the archive stores the
 * detail for re-transforms and has no use for an address, so it never lands.
 */
function sanitizeDetail(detail: unknown): unknown {
  if (typeof detail !== "object" || detail === null || Array.isArray(detail)) {
    return detail;
  }
  const row = detail as Record<string, unknown>;
  const store = row.store;
  if (typeof store !== "object" || store === null || !("email" in store)) {
    return detail;
  }
  const { email: _email, ...cleanStore } = store as Record<string, unknown>;
  return { ...row, store: cleanStore };
}

/** How many deck fetches pass between progress writes on a long fetch. */
const DECK_HEARTBEAT = 25;

/**
 * The individual decklists, which are readable only while the source says they
 * are published. Decklists are locked once the event runs, so entries already
 * held — a deck, or the null recording a refusal — are never requested again:
 * each pass fetches only the gap, capped, until every referenced id has an
 * entry. A deck that fails to load still leaves its player as a standings row.
 */
async function fetchDecks(
  deps: MetaSyncDeps,
  row: UvsgamesListRow,
  registrations: readonly unknown[],
  known: Record<string, unknown>,
  errors: string[],
  runId?: string,
): Promise<Record<string, unknown>> {
  const decks: Record<string, unknown> = { ...known };
  if (row.decklistStatus !== DECKLIST_PUBLISHED) {
    return decks;
  }
  const missing = referencedDeckIds(registrations).filter((id) => !Object.hasOwn(decks, id));
  const wanted = missing.slice(0, MAX_DECK_FETCHES);
  let fetched = 0;
  for (const deckId of wanted) {
    const deck = await readDeck(deps, deckId, errors);
    fetched++;
    if (deck !== SKIPPED) {
      decks[deckId] = deck;
    }
    if (runId !== undefined && fetched % DECK_HEARTBEAT === 0) {
      await deckHeartbeat(deps, runId, row.externalId, fetched, wanted.length);
    }
  }
  return decks;
}

/** No entry is written: the failure looked transient, so the id stays fetchable. */
const SKIPPED = Symbol("deck skipped");

/**
 * One decklist, or what its failure means for the stored entry: a 4xx is the
 * source refusing the deck for good and is recorded as a null marker, while a
 * transient failure (the client's retries already exhausted) leaves no entry so
 * the next pass tries again.
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
