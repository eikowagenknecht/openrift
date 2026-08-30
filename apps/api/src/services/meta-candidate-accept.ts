/**
 * Turns reviewed meta-archive candidates into live rows. Link/relink/unlink
 * move only the FK and the citation — never field values — so crediting a
 * source does not depend on taking any of its values.
 *
 * The candidate row itself is the source key: `(provider, external_id)` on the
 * event, plus `external_id` on each of its players. An ignore marks the key and
 * leaves the row and its live link in place (ADR-014, second revision), so
 * there is no second table holding a key that has to outlive the candidate.
 *
 * The create and the link are deliberately not one transaction: the retry
 * inside `createMetaEventPlayer` re-runs the whole share-token mint on a
 * collision, and a transaction would have to re-run itself from inside itself.
 * A crash between the two leaves a live row with no candidate pointing at it,
 * which the manual link action already repairs.
 */
import { ERROR_CODES } from "@openrift/shared";
import type {
  MetaEventAcceptField,
  MetaPlayerAcceptField,
} from "@openrift/shared/contracts/admin/meta";
import { META_USER_SUBMISSION_PROVIDER } from "@openrift/shared/contracts/meta-submissions";
import type { MetaListStatus } from "@openrift/shared/types";

import type { CandidateMetaDeckCard } from "../db/index.js";
import type { Repos } from "../deps.js";
import { AppError } from "../errors.js";
import { assertKnownFormat } from "../lib/deck-format-validation.js";
import {
  diffMetaDeckCards,
  hasCardDiff,
  META_EVENT_NO_CLAIM_FIELDS,
  metaDeckCardEntries,
  resolveMetaPlayerCards,
} from "../lib/meta-candidate-diff.js";
import { defaultMetaDeckName, metaEventSlugCandidates } from "../lib/meta-candidate-naming.js";
import { classifyMetaEventTier } from "../lib/meta-event-classify.js";
import type {
  CandidateMetaEventRow,
  CandidateMetaPlayerRow,
} from "../repositories/meta-candidates.js";
import type {
  LiveMetaPlayerRow,
  MetaArchivedDeckInput,
  MetaDeckCardInput,
  MetaEventPlayerPatch,
} from "../repositories/meta.js";
import { loadCardNameIndex, resolveCardIdByName } from "./candidate-links.js";
import { materializeCandidateMatches, syncEventPhases } from "./meta-event-matches.js";
import { createMetaEventPlayer, setMetaPlayerList } from "./meta-event-players.js";

/** `meta_event_sources.label` CHECK bound. */
const MAX_CITATION_LABEL_LENGTH = 60;

export interface AcceptedMetaEvent {
  metaEventId: string;
  slug: string;
  created: boolean;
}

export interface AcceptedMetaPlayer {
  metaEventPlayerId: string;
  deckId: string | null;
  created: boolean;
}

export interface MetaEventLinkResult {
  metaEventId: string | null;
  slug: string | null;
}

export interface MetaPlayerLinkResult {
  metaEventPlayerId: string | null;
  deckId: string | null;
}

interface SkippedMetaPlayer {
  candidatePlayerId: string;
  externalId: string;
  playerName: string;
  reason: string;
}

export interface AcceptedMetaEventWithPlayers extends AcceptedMetaEvent {
  acceptedPlayers: AcceptedMetaPlayer[];
  skippedPlayers: SkippedMetaPlayer[];
}

export interface MetaRematchResult {
  /** Candidate rows that held at least one unresolved name before the pass. */
  examined: number;
  /** Rows that gained at least one resolution. */
  updated: number;
  /** Individual names (card lines, legends, champions) that went from unresolved to a card. */
  resolved: number;
}

export interface MetaAcceptOptions {
  resolvedByUserId?: string;
}

export interface MetaPlayerAcceptOptions extends MetaAcceptOptions {
  /**
   * Files a standings-only entry whose legend name matched nothing. Deliberate
   * admin action, because the alternative is a silent hole in the play-rate
   * stats. Never covers an entry with a list: an unresolved card name is a
   * missing alias, and the fix is `resolveName`.
   */
  allowUnresolvedLegend?: boolean;
  /**
   * Leaves staged matches unmaterialized. For callers accepting a whole
   * field player by player, which materialize once at the end instead of
   * rescanning the pending matches after every row.
   */
  skipMatchMaterialization?: boolean;
}

export interface MetaEventAcceptOptions {
  /** Confirms overwriting an event a second source also feeds; ignored otherwise. */
  overwriteAll?: boolean;
}

async function requireEvent(repos: Repos, id: string): Promise<CandidateMetaEventRow> {
  const row = await repos.metaCandidates.eventById(id);
  if (row === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Candidate event not found");
  }
  return row;
}

async function requirePlayer(repos: Repos, id: string): Promise<CandidateMetaPlayerRow> {
  const row = await repos.metaCandidates.playerById(id);
  if (row === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Candidate player not found");
  }
  return row;
}

async function requireLiveEvent(repos: Repos, id: string) {
  const row = await repos.meta.eventById(id);
  if (row === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Event not found");
  }
  return row;
}

/**
 * A provider's player inherits its candidate event's link; a user submission
 * targets a live event directly and has no candidate parent. The table's CHECK
 * guarantees exactly one of the two, so this never has to pick.
 */
async function playerTarget(
  repos: Repos,
  player: CandidateMetaPlayerRow,
): Promise<{ metaEventId: string | null; parent: CandidateMetaEventRow | null }> {
  if (player.candidateEventId === null) {
    return { metaEventId: player.metaEventId, parent: null };
  }
  const parent = await requireEvent(repos, player.candidateEventId);
  return { metaEventId: parent.metaEventId, parent };
}

/**
 * Checked one at a time rather than in a batch: the first slug candidate is
 * free in almost every accept, and a batch would read fifty rows to learn
 * that.
 */
async function resolveEventSlug(
  meta: Repos["meta"],
  name: string,
  eventDate: string,
): Promise<string> {
  for (const slug of metaEventSlugCandidates(name, eventDate)) {
    const taken = await meta.eventBySlug(slug);
    if (taken === undefined) {
      return slug;
    }
  }
  throw new AppError(
    409,
    ERROR_CODES.CONFLICT,
    `Could not find a free slug for "${name}". Rename the event, or accept it by hand.`,
  );
}

/**
 * The delete first is what makes a relink work: `(provider, external_id)` is
 * unique across the whole table, so moving a source between events must take
 * its citation with it rather than leave a stale credit behind.
 */
async function writeEventCitation(
  repos: Repos,
  candidate: CandidateMetaEventRow,
  metaEventId: string,
): Promise<void> {
  await repos.meta.deleteEventSourceByKey(candidate.provider, candidate.externalId);
  await repos.meta.insertEventSource({
    metaEventId,
    provider: candidate.provider,
    externalId: candidate.externalId,
    // Providers have no display names; the raw provider string is what the
    // event page prints.
    label: candidate.provider.slice(0, MAX_CITATION_LABEL_LENGTH),
    sourceUrl: candidate.sourceUrl,
  });
}

/** Writes the link and citation only — field values are taken separately, or never. */
export async function linkCandidateEvent(
  repos: Repos,
  candidateEventId: string,
  metaEventId: string,
): Promise<MetaEventLinkResult> {
  const candidate = await requireEvent(repos, candidateEventId);
  if (candidate.metaEventId !== null) {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      "This candidate is already linked. Relink it to move it to another event.",
    );
  }
  return applyEventLink(repos, candidate, metaEventId);
}

export async function relinkCandidateEvent(
  repos: Repos,
  candidateEventId: string,
  metaEventId: string,
): Promise<MetaEventLinkResult> {
  const candidate = await requireEvent(repos, candidateEventId);
  return applyEventLink(repos, candidate, metaEventId);
}

async function applyEventLink(
  repos: Repos,
  candidate: CandidateMetaEventRow,
  metaEventId: string,
): Promise<MetaEventLinkResult> {
  const live = await requireLiveEvent(repos, metaEventId);
  await writeEventCitation(repos, candidate, live.id);
  await repos.metaCandidates.linkEvent(candidate.id, live.id, new Date());
  return { metaEventId: live.id, slug: live.slug };
}

/**
 * Every live-event field stays exactly as it was — including the ones this
 * source contributed, which are the archive's values now.
 */
export async function unlinkCandidateEvent(
  repos: Repos,
  candidateEventId: string,
): Promise<MetaEventLinkResult> {
  const candidate = await requireEvent(repos, candidateEventId);
  await repos.meta.deleteEventSourceByKey(candidate.provider, candidate.externalId);
  await repos.metaCandidates.unlinkEvent(candidate.id);
  return { metaEventId: null, slug: null };
}

export async function acceptCandidateEvent(
  repos: Repos,
  candidateEventId: string,
  options?: MetaEventAcceptOptions,
): Promise<AcceptedMetaEvent> {
  const { event } = await acceptCandidateEventRow(repos, candidateEventId, options);
  return event;
}

/** Hands the candidate row back too, so a caller needing its payload re-reads nothing. */
async function acceptCandidateEventRow(
  repos: Repos,
  candidateEventId: string,
  options?: MetaEventAcceptOptions,
): Promise<{ event: AcceptedMetaEvent; candidate: CandidateMetaEventRow }> {
  const { meta, metaCandidates, deckFormats } = repos;
  const candidate = await requireEvent(repos, candidateEventId);

  // A candidate carries whatever format string its source used; the live
  // column FKs to `deck_formats`, so an unknown one must stop here with a
  // usable message rather than at the insert.
  await assertKnownFormat(deckFormats, candidate.format);

  const fields = {
    name: candidate.name,
    eventDate: candidate.eventDate,
    format: candidate.format,
    playerCount: candidate.playerCount,
    organizer: candidate.organizer,
    notes: candidate.notes,
  };
  const claimed = claimedNoClaimFields(candidate);

  if (candidate.metaEventId !== null) {
    const live = await requireLiveEvent(repos, candidate.metaEventId);
    await assertOverwriteAllowed(repos, candidate, live.id, options);
    await meta.updateEvent(live.id, { ...fields, ...claimed });
    await metaCandidates.setEventCheckedAt(candidateEventId, new Date());
    return { event: { metaEventId: live.id, slug: live.slug, created: false }, candidate };
  }

  const slug = await resolveEventSlug(meta, candidate.name, candidate.eventDate);
  const created = await meta.createEvent({
    slug,
    ...fields,
    // The live column is NOT NULL: a candidate no producer classified (a user
    // submission's proposed event) gets the player-count placeholder at accept.
    tier: classifyMetaEventTier({ playerCount: candidate.playerCount }),
    ...claimed,
  });
  await writeEventCitation(repos, candidate, created.id);
  await metaCandidates.linkEvent(candidateEventId, created.id, new Date());
  await creditEventProposers(repos, candidate, created.id);
  return { event: { metaEventId: created.id, slug, created: true }, candidate };
}

/**
 * The no-claim fields this source actually holds a value for. A whole-entity
 * accept from a source with no venue must not null out what another source
 * filled in, and a null tier cannot go near a NOT NULL column.
 */
function claimedNoClaimFields(candidate: CandidateMetaEventRow): Partial<{
  [Field in (typeof META_EVENT_NO_CLAIM_FIELDS)[number]]: NonNullable<CandidateMetaEventRow[Field]>;
}> {
  return Object.fromEntries(
    META_EVENT_NO_CLAIM_FIELDS.filter((field) => candidate[field] !== null).map((field) => [
      field,
      candidate[field],
    ]),
  );
}

/**
 * With two sources feeding one event, a whole-entity accept on either would
 * silently revert whatever was curated from the other — and the next
 * re-publish would do it again. So the blunt path needs explicit confirmation.
 * A single-source event has nothing to clobber, so the one-click accept is
 * unaffected.
 */
async function assertOverwriteAllowed(
  repos: Repos,
  candidate: CandidateMetaEventRow,
  metaEventId: string,
  options?: MetaEventAcceptOptions,
): Promise<void> {
  if (options?.overwriteAll === true) {
    return;
  }
  const linked = await repos.metaCandidates.eventsByMetaEventId(metaEventId);
  const others = [
    ...new Set(linked.filter((row) => row.id !== candidate.id).map((row) => row.provider)),
  ];
  if (others.length === 0) {
    return;
  }
  throw new AppError(
    409,
    ERROR_CODES.CONFLICT,
    `This event also carries values from ${others.join(", ")}. Accepting all of ${candidate.provider} would overwrite them — take the fields you want one at a time, or confirm the overwrite.`,
  );
}

export async function acceptMetaEventField(
  repos: Repos,
  input: { candidateEventId: string; field: MetaEventAcceptField },
): Promise<{ metaEventId: string }> {
  const { meta, deckFormats } = repos;
  const candidate = await requireEvent(repos, input.candidateEventId);
  if (candidate.metaEventId === null) {
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      "Link this candidate to a live event before taking its fields.",
    );
  }
  const live = await requireLiveEvent(repos, candidate.metaEventId);

  // Same gate as the whole-entity accept: the live column FKs to `deck_formats`.
  if (input.field === "format") {
    await assertKnownFormat(deckFormats, candidate.format);
  }

  // A no-claim field this source holds nothing for is never offered as a diff,
  // and taking it anyway would null a NOT NULL column or erase another
  // source's value.
  const noClaim = META_EVENT_NO_CLAIM_FIELDS.find((field) => field === input.field);
  if (noClaim !== undefined && candidate[noClaim] === null) {
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      `This source holds no ${input.field} for the event.`,
    );
  }

  // `checked_at` is deliberately left alone. Taking one field is not reviewing
  // the row — the admin may still be taking the next field from another source.
  await meta.updateEvent(live.id, { [input.field]: candidate[input.field] });
  return { metaEventId: live.id };
}

/**
 * Why this candidate cannot become a live standings row yet, or null when it
 * can.
 *
 * The two gates answer different questions. An entry with a list needs every
 * card name resolved, because `deck_cards` needs real card ids. An entry
 * without one needs its legend, because a legend-less row sits in the play-rate
 * stats filed under nothing — but that one is only a warning the admin can wave
 * through, since the archive still knows who played and how they finished.
 */
function playerBlockedReason(
  metaEventId: string | null,
  player: CandidateMetaPlayerRow,
  allowUnresolvedLegend: boolean,
): string | null {
  if (metaEventId === null) {
    return "Accept the event first — its standings have nowhere to go yet.";
  }
  if (player.cards !== null) {
    const unresolved = unresolvedCardNames(player.cards);
    if (unresolved.length > 0) {
      return `Unmatched card names: ${unresolved.join(", ")}. Add a card name alias and rematch.`;
    }
    return null;
  }
  if (!allowUnresolvedLegend && player.legendName !== null && player.legendCardId === null) {
    return `The legend "${player.legendName}" matched no card. Add a card name alias and rematch, or accept the entry without a legend.`;
  }
  return null;
}

function unresolvedCardNames(cards: readonly CandidateMetaDeckCard[]): string[] {
  return [...new Set(cards.filter((card) => card.cardId === null).map((card) => card.name))];
}

function toDeckCardInputs(player: CandidateMetaPlayerRow): MetaDeckCardInput[] {
  return metaDeckCardEntries(player).map((entry) => ({
    cardId: entry.cardId,
    zone: entry.zone as MetaDeckCardInput["zone"],
    quantity: entry.quantity,
    preferredPrintingId: null,
  }));
}

/**
 * A candidate the source identified is filed under that identity with no name of
 * its own, so the player's renames reach the archive. One with no identity —
 * pushed, or user-submitted — keeps the name it was staged with, and names no
 * `uvsgamesPlayerId` at all: writing a null there would strip the identity a
 * uvsgames candidate gave the same live row. On the create path the omission
 * still satisfies the identity CHECK, because that branch always carries a name.
 */
function playerIdentity(player: CandidateMetaPlayerRow): {
  playerName: string | null;
  uvsgamesPlayerId?: number;
} {
  return player.uvsgamesPlayerId === null
    ? { playerName: player.playerName }
    : { playerName: null, uvsgamesPlayerId: player.uvsgamesPlayerId };
}

function playerScalars(player: CandidateMetaPlayerRow): MetaEventPlayerPatch {
  return {
    rank: player.rank,
    rankIsTier: player.rankIsTier,
    ...playerIdentity(player),
    wins: player.wins,
    losses: player.losses,
    draws: player.draws,
    matchPoints: player.matchPoints,
    opponentMatchWinPct: player.opponentMatchWinPct,
    gameWinPct: player.gameWinPct,
    opponentGameWinPct: player.opponentGameWinPct,
    entryStatus: player.entryStatus,
    ...resolveMetaPlayerCards(player),
  };
}

export async function linkCandidatePlayer(
  repos: Repos,
  candidatePlayerId: string,
  metaEventPlayerId: string,
): Promise<MetaPlayerLinkResult> {
  const player = await requirePlayer(repos, candidatePlayerId);
  if (player.metaEventPlayerId !== null) {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      "This candidate is already linked. Relink it to move it to another standings row.",
    );
  }
  return applyPlayerLink(repos, player, metaEventPlayerId);
}

export async function relinkCandidatePlayer(
  repos: Repos,
  candidatePlayerId: string,
  metaEventPlayerId: string,
): Promise<MetaPlayerLinkResult> {
  const player = await requirePlayer(repos, candidatePlayerId);
  return applyPlayerLink(repos, player, metaEventPlayerId);
}

async function applyPlayerLink(
  repos: Repos,
  player: CandidateMetaPlayerRow,
  metaEventPlayerId: string,
): Promise<MetaPlayerLinkResult> {
  const { metaEventId } = await playerTarget(repos, player);
  if (metaEventId === null) {
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      "Link this entry's event to a live event first.",
    );
  }
  const [live] = await repos.meta.livePlayersByIds([metaEventPlayerId]);
  if (live === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Standings row not found");
  }
  if (live.metaEventId !== metaEventId) {
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      "That standings row belongs to a different event. A candidate can only link inside its own event.",
    );
  }
  await repos.metaCandidates.linkPlayer(player.id, live.id, new Date());
  return { metaEventPlayerId: live.id, deckId: live.deckId };
}

export async function unlinkCandidatePlayer(
  repos: Repos,
  candidatePlayerId: string,
): Promise<MetaPlayerLinkResult> {
  const player = await requirePlayer(repos, candidatePlayerId);
  if (player.metaEventPlayerId !== null && player.submittedByUserId !== null) {
    // Scoped to this submitter: several people can have contributed to one
    // standings row, and detaching one of them must not silence the others.
    await repos.meta.deleteCreditsForPlayer(player.metaEventPlayerId, player.submittedByUserId);
  }
  await repos.metaCandidates.unlinkPlayer(player.id);
  return { metaEventPlayerId: null, deckId: null };
}

export async function acceptCandidatePlayer(
  repos: Repos,
  candidatePlayerId: string,
  options?: MetaPlayerAcceptOptions,
): Promise<AcceptedMetaPlayer> {
  const player = await requirePlayer(repos, candidatePlayerId);
  const { metaEventId } = await playerTarget(repos, player);
  const blocked = playerBlockedReason(metaEventId, player, options?.allowUnresolvedLegend === true);
  if (blocked !== null) {
    throw new AppError(400, ERROR_CODES.BAD_REQUEST, blocked);
  }
  const accepted = await acceptResolvedPlayer(repos, metaEventId as string, player, options);
  // This accept may have completed pairings whose other seat was already live.
  if (player.candidateEventId !== null && options?.skipMatchMaterialization !== true) {
    await materializeCandidateMatches(repos, player.candidateEventId, metaEventId as string);
  }
  return accepted;
}

/**
 * Split from {@link acceptCandidatePlayer} so the whole-event accept validates
 * the parent once, not once per player.
 */
async function acceptResolvedPlayer(
  repos: Repos,
  metaEventId: string,
  player: CandidateMetaPlayerRow,
  options?: MetaPlayerAcceptOptions,
): Promise<AcceptedMetaPlayer> {
  const { meta, metaCandidates } = repos;
  const now = new Date();
  const liveEvent = await requireLiveEvent(repos, metaEventId);

  if (player.metaEventPlayerId !== null) {
    const [live] = await meta.livePlayersByIds([player.metaEventPlayerId]);
    if (live === undefined) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Linked standings row no longer exists");
    }
    await meta.updatePlayer(live.id, { eventId: metaEventId, ...playerScalars(player) });

    let deckId = live.deckId;
    if (player.cards !== null && (await listMoved(repos, live, player))) {
      const deck = await buildDeckInput(repos, player, liveEvent, live);
      const written = await setMetaPlayerList(meta, live.id, deck);
      deckId = written?.deckId ?? deckId;
    }

    await metaCandidates.setPlayerCheckedAt(player.id, now);
    await creditPlayerAccept(repos, player, metaEventId, live.id, deckId, options);
    return { metaEventPlayerId: live.id, deckId, created: false };
  }

  const created = await createMetaEventPlayer(meta, {
    eventId: metaEventId,
    rank: player.rank,
    rankIsTier: player.rankIsTier,
    ...playerIdentity(player),
    wins: player.wins,
    losses: player.losses,
    draws: player.draws,
    matchPoints: player.matchPoints,
    opponentMatchWinPct: player.opponentMatchWinPct,
    gameWinPct: player.gameWinPct,
    opponentGameWinPct: player.opponentGameWinPct,
    entryStatus: player.entryStatus,
    ...resolveMetaPlayerCards(player),
    deck: player.cards === null ? null : await buildDeckInput(repos, player, liveEvent, null),
  });
  if (created === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Linked event no longer exists");
  }

  await metaCandidates.linkPlayer(player.id, created.metaEventPlayerId, now);
  await creditPlayerAccept(
    repos,
    player,
    metaEventId,
    created.metaEventPlayerId,
    created.deckId,
    options,
  );
  return { metaEventPlayerId: created.metaEventPlayerId, deckId: created.deckId, created: true };
}

/**
 * Whether taking this candidate's list would actually change the live deck.
 * Card replacement is wholesale, so it is only worth doing when the list moved
 * — an untouched deck should not churn `decks.updated_at`.
 */
async function listMoved(
  repos: Repos,
  live: LiveMetaPlayerRow,
  player: CandidateMetaPlayerRow,
): Promise<boolean> {
  if (live.deckId === null || live.listStatus !== player.listStatus) {
    return true;
  }
  const liveCards = await repos.metaCandidates.liveDeckCards([live.deckId]);
  return hasCardDiff(diffMetaDeckCards(liveCards, metaDeckCardEntries(player)));
}

/**
 * The archived deck a candidate's list becomes. The name is the live deck's own
 * when it already has one — a source ships a card list, never a proposal to
 * rename what the maintainer called it — and derived from the legend otherwise.
 * The format is the event's, not the candidate's: the archive's own vocabulary
 * is already FK-valid.
 */
async function buildDeckInput(
  repos: Repos,
  player: CandidateMetaPlayerRow,
  liveEvent: { name: string; format: string },
  live: LiveMetaPlayerRow | null,
): Promise<MetaArchivedDeckInput> {
  return {
    name: live?.deckName ?? (await deriveDeckName(repos, player, liveEvent.name)),
    format: liveEvent.format,
    formatConfig: null,
    cards: toDeckCardInputs(player),
    listStatus: player.listStatus as Exclude<MetaListStatus, "none">,
  };
}

/**
 * Must write through {@link setMetaPlayerList} when the list travels: an entry
 * that leaves `"none"` is what mints its permalink.
 */
export async function acceptMetaPlayerField(
  repos: Repos,
  input: { candidatePlayerId: string; field: MetaPlayerAcceptField },
  options?: MetaAcceptOptions,
): Promise<{ metaEventPlayerId: string }> {
  const linked = await requireLinkedPlayer(repos, input.candidatePlayerId);
  const patch = playerFieldPatch(linked.candidate, input.field);
  await repos.meta.updatePlayer(linked.metaEventPlayerId, patch);
  await creditPlayerAccept(
    repos,
    linked.candidate,
    linked.metaEventId,
    linked.metaEventPlayerId,
    linked.deckId,
    options,
  );
  return { metaEventPlayerId: linked.metaEventPlayerId };
}

/**
 * `legend` and `champion` name what a reviewer sees in the grid; the column
 * behind each is the resolved card id, so a source whose name matched nothing
 * has nothing to take.
 */
function playerFieldPatch(
  candidate: CandidateMetaPlayerRow,
  field: MetaPlayerAcceptField,
): MetaEventPlayerPatch {
  const resolved = resolveMetaPlayerCards(candidate);
  switch (field) {
    case "legend": {
      return { legendCardId: resolved.legendCardId };
    }
    case "champion": {
      return { championCardId: resolved.championCardId };
    }
    default: {
      return { [field]: candidate[field] };
    }
  }
}

/**
 * The list moves whole rather than card by card — per-card accept would be a
 * marginal gain over "take the list, then edit it in the deck editor".
 * `listStatus` travels with it: a list and how complete it is are one
 * statement.
 */
export async function acceptMetaDeckList(
  repos: Repos,
  candidatePlayerId: string,
  options?: MetaAcceptOptions,
): Promise<{ metaEventPlayerId: string; deckId: string }> {
  const linked = await requireLinkedPlayer(repos, candidatePlayerId);
  const { candidate } = linked;
  if (candidate.cards === null) {
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      "This entry carries no list — the source published standings only.",
    );
  }
  const unresolved = unresolvedCardNames(candidate.cards);
  if (unresolved.length > 0) {
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      `Unmatched card names: ${unresolved.join(", ")}. Add a card name alias and rematch.`,
    );
  }

  const liveEvent = await requireLiveEvent(repos, linked.metaEventId);
  const [live] = await repos.meta.livePlayersByIds([linked.metaEventPlayerId]);
  const deck = await buildDeckInput(repos, candidate, liveEvent, live ?? null);
  const written = await setMetaPlayerList(repos.meta, linked.metaEventPlayerId, deck);
  if (written === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Linked standings row no longer exists");
  }

  await creditPlayerAccept(
    repos,
    candidate,
    linked.metaEventId,
    linked.metaEventPlayerId,
    written.deckId,
    options,
  );
  return { metaEventPlayerId: linked.metaEventPlayerId, deckId: written.deckId };
}

async function requireLinkedPlayer(
  repos: Repos,
  candidatePlayerId: string,
): Promise<{
  candidate: CandidateMetaPlayerRow;
  metaEventPlayerId: string;
  metaEventId: string;
  deckId: string | null;
}> {
  const candidate = await requirePlayer(repos, candidatePlayerId);
  if (candidate.metaEventPlayerId === null) {
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      "Link this candidate to a standings row before taking its values.",
    );
  }
  const { metaEventId } = await playerTarget(repos, candidate);
  if (metaEventId === null) {
    throw new AppError(400, ERROR_CODES.BAD_REQUEST, "This entry's event is not linked yet.");
  }
  const [live] = await repos.meta.livePlayersByIds([candidate.metaEventPlayerId]);
  return {
    candidate,
    metaEventPlayerId: candidate.metaEventPlayerId,
    metaEventId,
    deckId: live?.deckId ?? null,
  };
}

/**
 * Credit and ledger settle in one transaction (`recordAcceptance`), so a
 * person is never credited without their submission saying so, or the
 * reverse.
 */
async function creditPlayerAccept(
  repos: Repos,
  candidate: CandidateMetaPlayerRow,
  metaEventId: string,
  metaEventPlayerId: string,
  deckId: string | null,
  options?: MetaAcceptOptions,
): Promise<void> {
  const userId = candidate.submittedByUserId;
  if (userId === null) {
    return;
  }
  const submission = await repos.metaSubmissions.byCandidatePlayerId(candidate.id);
  await repos.metaSubmissions.recordAcceptance({
    submissionId: submission?.id ?? null,
    credit: { metaEventId, metaEventPlayerId, userId },
    acceptedDeckId: deckId,
    resolvedAt: new Date(),
    resolvedByUserId: options?.resolvedByUserId ?? null,
  });
}

/**
 * Candidate events carry no submitter of their own, so the proposers are the
 * distinct submitters among their entries. Their ledger rows stay pending: what
 * they sent was a decklist, and that settles when the entry is accepted.
 */
async function creditEventProposers(
  repos: Repos,
  candidate: CandidateMetaEventRow,
  metaEventId: string,
): Promise<void> {
  // Gated on the provider so a scraped event's one-click accept gains no read
  // at all: only user submissions can carry a submitter.
  if (candidate.provider !== META_USER_SUBMISSION_PROVIDER) {
    return;
  }
  const players = await repos.metaCandidates.playersByCandidateEventIds([candidate.id]);
  const proposers = new Set(
    players
      .map((player) => player.submittedByUserId)
      .filter((userId): userId is string => userId !== null),
  );
  for (const userId of proposers) {
    await repos.meta.insertCredit({ metaEventId, metaEventPlayerId: null, userId });
  }
}

async function deriveDeckName(
  repos: Repos,
  player: CandidateMetaPlayerRow,
  eventName: string,
): Promise<string> {
  const legendCardId = resolveMetaPlayerCards(player).legendCardId;
  const names =
    legendCardId === null
      ? new Map<string, string>()
      : await repos.metaCandidates.cardNamesByIds([legendCardId]);
  const legendName =
    legendCardId === null ? player.legendName : (names.get(legendCardId) ?? player.legendName);
  return defaultMetaDeckName(legendName, player.playerName, eventName);
}

/**
 * A blocked entry is skipped with its reason rather than failing the call: the
 * usual shape of a real event is "the whole field lands, one legend name is
 * misspelled", and blocking the rest on it would make the queue useless.
 */
export async function acceptCandidateEventWithPlayers(
  repos: Repos,
  candidateEventId: string,
  options?: MetaPlayerAcceptOptions & MetaEventAcceptOptions,
): Promise<AcceptedMetaEventWithPlayers> {
  const { event, candidate } = await acceptCandidateEventRow(repos, candidateEventId, options);
  const players = await repos.metaCandidates.playersByCandidateEventIds([candidateEventId]);

  const acceptedPlayers: AcceptedMetaPlayer[] = [];
  const skippedPlayers: SkippedMetaPlayer[] = [];
  for (const player of players) {
    const blocked = playerBlockedReason(
      event.metaEventId,
      player,
      options?.allowUnresolvedLegend === true,
    );
    if (blocked !== null) {
      skippedPlayers.push({
        candidatePlayerId: player.id,
        externalId: player.externalId,
        playerName: player.playerName,
        reason: blocked,
      });
      continue;
    }
    acceptedPlayers.push(await acceptResolvedPlayer(repos, event.metaEventId, player, options));
  }

  await materializeCandidateMatches(repos, candidateEventId, event.metaEventId);
  await syncEventPhases(repos, event.metaEventId, candidate.raw?.detail);

  return { ...event, acceptedPlayers, skippedPlayers };
}

/**
 * The second half of the alias-fix flow: an admin adds a `card_name_aliases`
 * row, then rematches so already-staged rows pick it up without waiting for the
 * next upload. Legends and champions resolve through the same index as the card
 * lines, so a fix reaches the deckless entries too. `checked_at` is deliberately
 * left alone — resolving a name is not a source change, so a reviewed row does
 * not re-enter the queue.
 */
export async function rematchMetaCandidates(repos: Repos): Promise<MetaRematchResult> {
  const [players, index] = await Promise.all([
    repos.metaCandidates.playersWithUnresolvedNames(),
    loadCardNameIndex(repos.ingest),
  ]);

  let updated = 0;
  let resolved = 0;
  for (const player of players) {
    let playerResolved = 0;
    const updates: {
      cards?: CandidateMetaDeckCard[];
      legendCardId?: string;
      championCardId?: string;
    } = {};

    if (player.cards !== null) {
      let cardsResolved = 0;
      const cards = player.cards.map((card) => {
        if (card.cardId !== null) {
          return card;
        }
        const cardId = resolveCardIdByName(index, card.name);
        if (cardId === null) {
          return card;
        }
        cardsResolved++;
        return { ...card, cardId };
      });
      if (cardsResolved > 0) {
        updates.cards = cards;
        playerResolved += cardsResolved;
      }
    }

    if (player.legendName !== null && player.legendCardId === null) {
      const cardId = resolveCardIdByName(index, player.legendName);
      if (cardId !== null) {
        updates.legendCardId = cardId;
        playerResolved++;
      }
    }
    if (player.championName !== null && player.championCardId === null) {
      const cardId = resolveCardIdByName(index, player.championName);
      if (cardId !== null) {
        updates.championCardId = cardId;
        playerResolved++;
      }
    }

    if (playerResolved > 0) {
      await repos.metaCandidates.updatePlayer(player.id, updates);
      updated++;
      resolved += playerResolved;
    }
  }

  return { examined: players.length, updated, resolved };
}
