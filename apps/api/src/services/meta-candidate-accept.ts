/**
 * Turns reviewed meta-archive candidates into live rows. Link/relink/unlink
 * move only the FK, citation, and deck source keys — never field values — so
 * crediting a source does not depend on taking any of its values.
 *
 * The create and the link are deliberately not one transaction: the retry
 * inside `createArchivedDeck` re-runs the whole share-token mint on a
 * collision, and a transaction would have to re-run itself from inside itself.
 * A crash between the two leaves a live row with no candidate pointing at it,
 * which the manual link action already repairs.
 *
 * The source key is a separate write from the link (`meta_event_sources` /
 * `meta_deck_sources`): ignoring a candidate deletes its row, so a key held
 * only there would make un-ignoring it archive a second copy of everything
 * that source already produced.
 */
import { ERROR_CODES, WellKnown } from "@openrift/shared";
import type {
  MetaDeckAcceptField,
  MetaEventAcceptField,
} from "@openrift/shared/contracts/admin/meta";
import { META_USER_SUBMISSION_PROVIDER } from "@openrift/shared/contracts/meta-submissions";

import type { Repos } from "../deps.js";
import { AppError } from "../errors.js";
import { assertKnownFormat } from "../lib/deck-format-validation.js";
import type { MetaDeckCardEntry } from "../lib/meta-candidate-diff.js";
import { collapseCardEntries, diffMetaDeckCards, hasCardDiff } from "../lib/meta-candidate-diff.js";
import { defaultMetaDeckName, metaEventSlugCandidates } from "../lib/meta-candidate-naming.js";
import type {
  CandidateMetaDeckRow,
  CandidateMetaEventRow,
} from "../repositories/meta-candidates.js";
import type { MetaDeckCardInput, MetaDeckPatch, MetaDeckSourceKey } from "../repositories/meta.js";
import { loadCardNameIndex, resolveCardIdByName } from "./candidate-links.js";
import { createArchivedDeck, updateArchivedDeck } from "./create-archived-deck.js";

/** `meta_event_sources.label` CHECK bound. */
const MAX_CITATION_LABEL_LENGTH = 60;

export interface AcceptedMetaEvent {
  metaEventId: string;
  slug: string;
  created: boolean;
}

export interface AcceptedMetaDeck {
  deckId: string;
  created: boolean;
}

export interface MetaEventLinkResult {
  metaEventId: string | null;
  slug: string | null;
}

export interface MetaDeckLinkResult {
  deckId: string | null;
}

interface SkippedMetaDeck {
  candidateDeckId: string;
  externalId: string;
  playerName: string;
  reason: string;
}

export interface AcceptedMetaEventWithDecks extends AcceptedMetaEvent {
  acceptedDecks: AcceptedMetaDeck[];
  skippedDecks: SkippedMetaDeck[];
}

export interface MetaRematchResult {
  /** Decks that held at least one unresolved name before the pass. */
  examined: number;
  /** Decks whose card list gained at least one resolution. */
  updated: number;
  /** Card rows (not decks) that went from unresolved to a live card. */
  resolved: number;
}

export interface MetaAcceptOptions {
  resolvedByUserId?: string;
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

async function requireDeck(repos: Repos, id: string): Promise<CandidateMetaDeckRow> {
  const row = await repos.metaCandidates.deckById(id);
  if (row === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Candidate deck not found");
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
 * A provider's deck inherits its candidate event's link; a user submission
 * targets a live event directly and has no candidate parent. The table's CHECK
 * guarantees exactly one of the two, so this never has to pick.
 */
async function deckTarget(
  repos: Repos,
  deck: CandidateMetaDeckRow,
): Promise<{ metaEventId: string | null; parent: CandidateMetaEventRow | null }> {
  if (deck.candidateEventId === null) {
    return { metaEventId: deck.metaEventId, parent: null };
  }
  const parent = await requireEvent(repos, deck.candidateEventId);
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

/**
 * Null for a user submission: it has no source event to scope a deck id to,
 * which is also why it cannot be ignored.
 */
function deckSourceKey(
  parent: CandidateMetaEventRow | null,
  deck: CandidateMetaDeckRow,
): MetaDeckSourceKey | null {
  if (parent === null) {
    return null;
  }
  return {
    provider: parent.provider,
    eventExternalId: parent.externalId,
    externalId: deck.externalId,
  };
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

  if (candidate.metaEventId !== null) {
    const live = await requireLiveEvent(repos, candidate.metaEventId);
    await assertOverwriteAllowed(repos, candidate, live.id, options);
    await meta.updateEvent(live.id, fields);
    await metaCandidates.setEventCheckedAt(candidateEventId, new Date());
    return { metaEventId: live.id, slug: live.slug, created: false };
  }

  const slug = await resolveEventSlug(meta, candidate.name, candidate.eventDate);
  const created = await meta.createEvent({ slug, ...fields });
  await writeEventCitation(repos, candidate, created.id);
  await metaCandidates.linkEvent(candidateEventId, created.id, new Date());
  await creditEventProposers(repos, candidate, created.id);
  return { metaEventId: created.id, slug, created: true };
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

  // `checked_at` is deliberately left alone. Taking one field is not reviewing
  // the row — the admin may still be taking the next field from another source.
  await meta.updateEvent(live.id, { [input.field]: candidate[input.field] });
  return { metaEventId: live.id };
}

/**
 * The archetype gate is separate because the general "every card resolved"
 * gate would pass a deck with no legend at all, whose entry would then sit in
 * the legend play-rates filed under nothing.
 */
function deckBlockedReason(metaEventId: string | null, deck: CandidateMetaDeckRow): string | null {
  if (metaEventId === null) {
    return "Accept the event first — its decks have nowhere to go yet.";
  }
  const unresolved = [...new Set(deck.cards.filter((c) => c.cardId === null).map((c) => c.name))];
  if (unresolved.length > 0) {
    return `Unmatched card names: ${unresolved.join(", ")}. Add a card name alias and rematch.`;
  }
  if (deck.listStatus === "archetype" && !hasResolvedLegend(deck)) {
    return "An archetype needs its legend. This deck has no legend-zone card that matched, so there is nothing to file it under.";
  }
  return null;
}

function hasResolvedLegend(deck: CandidateMetaDeckRow): boolean {
  return deck.cards.some((card) => card.zone === WellKnown.deckZone.LEGEND && card.cardId !== null);
}

/**
 * Two source rows can legitimately resolve to the same card and zone — a
 * playset split across lines, or an alias fix mapping two spellings onto one
 * card — and `deck_cards` is unique on `(deck, card, zone)`, so duplicates are
 * summed rather than failing the accept on the second insert.
 */
function toCardEntries(deck: CandidateMetaDeckRow): MetaDeckCardEntry[] {
  return collapseCardEntries(
    deck.cards.map((card) => ({
      cardId: card.cardId as string,
      zone: card.zone,
      quantity: card.quantity,
    })),
  );
}

function toDeckCardInputs(deck: CandidateMetaDeckRow): MetaDeckCardInput[] {
  return toCardEntries(deck).map((entry) => ({
    cardId: entry.cardId,
    zone: entry.zone as MetaDeckCardInput["zone"],
    quantity: entry.quantity,
    preferredPrintingId: null,
  }));
}

export async function linkCandidateDeck(
  repos: Repos,
  candidateDeckId: string,
  deckId: string,
): Promise<MetaDeckLinkResult> {
  const deck = await requireDeck(repos, candidateDeckId);
  if (deck.deckId !== null) {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      "This candidate is already linked. Relink it to move it to another deck.",
    );
  }
  return applyDeckLink(repos, deck, deckId);
}

export async function relinkCandidateDeck(
  repos: Repos,
  candidateDeckId: string,
  deckId: string,
): Promise<MetaDeckLinkResult> {
  const deck = await requireDeck(repos, candidateDeckId);
  return applyDeckLink(repos, deck, deckId);
}

async function applyDeckLink(
  repos: Repos,
  deck: CandidateMetaDeckRow,
  deckId: string,
): Promise<MetaDeckLinkResult> {
  const { metaEventId, parent } = await deckTarget(repos, deck);
  if (metaEventId === null) {
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      "Link this deck's event to a live event first.",
    );
  }
  const [live] = await repos.metaCandidates.liveDecksByIds([deckId]);
  if (live === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Archived deck not found");
  }
  if (live.metaEventId !== metaEventId) {
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      "That deck belongs to a different event. A candidate deck can only link inside its own event.",
    );
  }
  await writeDeckSource(repos, deckSourceKey(parent, deck), deckId);
  await repos.metaCandidates.linkDeck(deck.id, deckId, new Date());
  return { deckId };
}

async function writeDeckSource(
  repos: Repos,
  key: MetaDeckSourceKey | null,
  deckId: string,
): Promise<void> {
  if (key !== null) {
    await repos.meta.writeDeckSource(deckId, key);
  }
}

export async function unlinkCandidateDeck(
  repos: Repos,
  candidateDeckId: string,
): Promise<MetaDeckLinkResult> {
  const deck = await requireDeck(repos, candidateDeckId);
  if (deck.deckId !== null && deck.submittedByUserId !== null) {
    // Scoped to this submitter: several people can have contributed to one
    // archived deck, and detaching one of them must not silence the others.
    await repos.meta.deleteCreditsForDeck(deck.deckId, deck.submittedByUserId);
  }
  // The source key goes with the link: this provider no longer claims to
  // describe that archived deck, so the next upload of the same key must stage
  // as new rather than re-link.
  const { parent } = await deckTarget(repos, deck);
  const key = deckSourceKey(parent, deck);
  if (key !== null) {
    await repos.meta.deleteDeckSourceByKey(key);
  }
  await repos.metaCandidates.unlinkDeck(deck.id);
  return { deckId: null };
}

export async function acceptCandidateDeck(
  repos: Repos,
  candidateDeckId: string,
  options?: MetaAcceptOptions,
): Promise<AcceptedMetaDeck> {
  const deck = await requireDeck(repos, candidateDeckId);
  const { metaEventId, parent } = await deckTarget(repos, deck);
  const blocked = deckBlockedReason(metaEventId, deck);
  if (blocked !== null) {
    throw new AppError(400, ERROR_CODES.BAD_REQUEST, blocked);
  }
  return acceptResolvedDeck(repos, metaEventId as string, deck, parent, options);
}

/**
 * Split from {@link acceptCandidateDeck} so the whole-event accept reads the
 * parent once, not once per deck.
 */
async function acceptResolvedDeck(
  repos: Repos,
  metaEventId: string,
  deck: CandidateMetaDeckRow,
  parent: CandidateMetaEventRow | null,
  options?: MetaAcceptOptions,
): Promise<AcceptedMetaDeck> {
  const { meta, metaCandidates } = repos;
  const now = new Date();
  const sourceKey = deckSourceKey(parent, deck);

  if (deck.deckId !== null) {
    // Card replacement is wholesale, so it is only worth doing when the list
    // actually moved — an untouched deck should not churn `decks.updated_at`.
    const liveCards = await metaCandidates.liveDeckCards([deck.deckId]);
    const cardsChanged = hasCardDiff(diffMetaDeckCards(liveCards, toCardEntries(deck)));
    // Through the service, not the repo: this accept is how a source's
    // archetype gets published with a main deck, and that has to mint the
    // permalink the deck never had.
    await updateArchivedDeck(meta, deck.deckId, {
      eventId: metaEventId,
      // A source that ships no deck name is not proposing to rename the
      // archived deck; it just never had one.
      ...(deck.name === null ? {} : { name: deck.name }),
      playerName: deck.playerName,
      finishTier: deck.finishTier,
      record: deck.record,
      listStatus: deck.listStatus,
      ...(cardsChanged ? { cards: toDeckCardInputs(deck) } : {}),
    });
    await writeDeckSource(repos, sourceKey, deck.deckId);
    await metaCandidates.setDeckCheckedAt(deck.id, now);
    await creditDeckAccept(repos, deck, metaEventId, deck.deckId, options);
    return { deckId: deck.deckId, created: false };
  }

  const liveEvent = await requireLiveEvent(repos, metaEventId);

  const created = await createArchivedDeck(meta, {
    eventId: metaEventId,
    name: deck.name ?? (await deriveDeckName(repos, deck, liveEvent.name)),
    // The event's format, not the candidate's: the archive's own vocabulary is
    // already FK-valid.
    format: liveEvent.format,
    formatConfig: null,
    cards: toDeckCardInputs(deck),
    playerName: deck.playerName,
    finishTier: deck.finishTier,
    record: deck.record,
    listStatus: deck.listStatus,
  });
  if (created === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Linked event no longer exists");
  }

  await writeDeckSource(repos, sourceKey, created.deckId);
  await metaCandidates.linkDeck(deck.id, created.deckId, now);
  await creditDeckAccept(repos, deck, metaEventId, created.deckId, options);
  return { deckId: created.deckId, created: true };
}

/**
 * Must write through `updateArchivedDeck`: promoting a deck out of
 * `"archetype"` via `listStatus` is what mints its permalink.
 */
export async function acceptMetaDeckField(
  repos: Repos,
  input: { candidateDeckId: string; field: MetaDeckAcceptField },
  options?: MetaAcceptOptions,
): Promise<{ deckId: string }> {
  const deck = await requireLinkedDeck(repos, input.candidateDeckId);
  const patch: MetaDeckPatch = { [input.field]: deck.candidate[input.field] };
  await updateArchivedDeck(repos.meta, deck.deckId, patch);
  await creditDeckAccept(repos, deck.candidate, deck.metaEventId, deck.deckId, options);
  return { deckId: deck.deckId };
}

/**
 * The list moves whole rather than card by card — per-card accept would be a
 * marginal gain over "take the list, then edit it in the deck editor".
 * `listStatus` travels with it: a list and how complete it is are one
 * statement.
 */
export async function acceptMetaDeckList(
  repos: Repos,
  candidateDeckId: string,
  options?: MetaAcceptOptions,
): Promise<{ deckId: string }> {
  const deck = await requireLinkedDeck(repos, candidateDeckId);
  const blocked = deckBlockedReason(deck.metaEventId, deck.candidate);
  if (blocked !== null) {
    throw new AppError(400, ERROR_CODES.BAD_REQUEST, blocked);
  }
  await updateArchivedDeck(repos.meta, deck.deckId, {
    cards: toDeckCardInputs(deck.candidate),
    listStatus: deck.candidate.listStatus,
  });
  await creditDeckAccept(repos, deck.candidate, deck.metaEventId, deck.deckId, options);
  return { deckId: deck.deckId };
}

async function requireLinkedDeck(
  repos: Repos,
  candidateDeckId: string,
): Promise<{ candidate: CandidateMetaDeckRow; deckId: string; metaEventId: string }> {
  const candidate = await requireDeck(repos, candidateDeckId);
  if (candidate.deckId === null) {
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      "Link this candidate to an archived deck before taking its values.",
    );
  }
  const { metaEventId } = await deckTarget(repos, candidate);
  if (metaEventId === null) {
    throw new AppError(400, ERROR_CODES.BAD_REQUEST, "This deck's event is not linked yet.");
  }
  return { candidate, deckId: candidate.deckId, metaEventId };
}

/**
 * Credit and ledger settle in one transaction (`recordAcceptance`), so a
 * person is never credited without their submission saying so, or the
 * reverse.
 */
async function creditDeckAccept(
  repos: Repos,
  candidate: CandidateMetaDeckRow,
  metaEventId: string,
  deckId: string,
  options?: MetaAcceptOptions,
): Promise<void> {
  const userId = candidate.submittedByUserId;
  if (userId === null) {
    return;
  }
  const submission = await repos.metaSubmissions.byCandidateDeckId(candidate.id);
  await repos.metaSubmissions.recordAcceptance({
    submissionId: submission?.id ?? null,
    credit: { metaEventId, deckId, userId },
    acceptedDeckId: deckId,
    resolvedAt: new Date(),
    resolvedByUserId: options?.resolvedByUserId ?? null,
  });
}

/**
 * Candidate events carry no submitter of their own, so the proposers are the
 * distinct submitters among their decks. Their ledger rows stay pending: what
 * they sent was a decklist, and that settles when the deck is accepted.
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
  const decks = await repos.metaCandidates.decksByCandidateEventIds([candidate.id]);
  const proposers = new Set(
    decks
      .map((deck) => deck.submittedByUserId)
      .filter((userId): userId is string => userId !== null),
  );
  for (const userId of proposers) {
    await repos.meta.insertCredit({ metaEventId, deckId: null, userId });
  }
}

async function deriveDeckName(
  repos: Repos,
  deck: CandidateMetaDeckRow,
  eventName: string,
): Promise<string> {
  const legend = deck.cards.find((card) => card.zone === WellKnown.deckZone.LEGEND);
  const legendCardId = legend?.cardId ?? null;
  const names =
    legendCardId === null
      ? new Map<string, string>()
      : await repos.metaCandidates.cardNamesByIds([legendCardId]);
  const legendName = legendCardId === null ? null : (names.get(legendCardId) ?? null);
  return defaultMetaDeckName(legendName, deck.playerName, eventName);
}

/**
 * A blocked deck is skipped with its reason rather than failing the call: the
 * usual shape of a real event is "nine lists land, one has a typo", and
 * blocking the other nine on it would make the queue useless.
 */
export async function acceptCandidateEventWithDecks(
  repos: Repos,
  candidateEventId: string,
  options?: MetaAcceptOptions & MetaEventAcceptOptions,
): Promise<AcceptedMetaEventWithDecks> {
  const event = await acceptCandidateEvent(repos, candidateEventId, options);
  const decks = await repos.metaCandidates.decksByCandidateEventIds([candidateEventId]);
  const parent = await requireEvent(repos, candidateEventId);

  const acceptedDecks: AcceptedMetaDeck[] = [];
  const skippedDecks: SkippedMetaDeck[] = [];
  for (const deck of decks) {
    const blocked = deckBlockedReason(event.metaEventId, deck);
    if (blocked !== null) {
      skippedDecks.push({
        candidateDeckId: deck.id,
        externalId: deck.externalId,
        playerName: deck.playerName,
        reason: blocked,
      });
      continue;
    }
    acceptedDecks.push(await acceptResolvedDeck(repos, event.metaEventId, deck, parent, options));
  }

  return { ...event, acceptedDecks, skippedDecks };
}

/**
 * The second half of the alias-fix flow: an admin adds a `card_name_aliases`
 * row, then rematches so already-staged decks pick it up without waiting for
 * the next upload. `checked_at` is deliberately left alone — resolving a name
 * is not a source change, so a reviewed deck does not re-enter the queue.
 */
export async function rematchMetaCandidates(repos: Repos): Promise<MetaRematchResult> {
  const [decks, index] = await Promise.all([
    repos.metaCandidates.decksWithUnresolvedCards(),
    loadCardNameIndex(repos.ingest),
  ]);

  let updated = 0;
  let resolved = 0;
  for (const deck of decks) {
    let deckResolved = 0;
    const cards = deck.cards.map((card) => {
      if (card.cardId !== null) {
        return card;
      }
      const cardId = resolveCardIdByName(index, card.name);
      if (cardId === null) {
        return card;
      }
      deckResolved++;
      return { ...card, cardId };
    });

    if (deckResolved > 0) {
      await repos.metaCandidates.updateDeck(deck.id, { cards });
      updated++;
      resolved += deckResolved;
    }
  }

  return { examined: decks.length, updated, resolved };
}
