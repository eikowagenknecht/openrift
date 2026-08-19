/**
 * Turning reviewed meta-archive candidates into live rows, plus the linking and
 * per-field actions around that (ADR-014, amended 2026-08-18).
 *
 * Since migration 255 the live tables carry no provider key: the link is
 * `candidate_meta_events.meta_event_id` / `candidate_meta_decks.deck_id`, both
 * many-to-one, so uvsgames and playriftbound can describe one tournament and an
 * admin reconciles them. That gives three tiers of write here, and the tier is
 * the whole point of the split:
 *
 *   - **link / relink / unlink** move the FK, this provider's citation and its
 *     deck source keys, and write no field values at all. A source whose values
 *     you rejected still contributed, usually its decks, so crediting it must
 *     not depend on taking any of them.
 *   - **accept** is unchanged for an *unlinked* candidate: one click creates the
 *     live row, links it, and cites the source. That path must not get slower —
 *     it is what a single-source event still uses.
 *   - **acceptMetaEventField / acceptMetaDeckField / acceptMetaDeckList** take
 *     exactly one source's version of one thing, which is what the compare grid
 *     needs once a second source is linked.
 *
 * Nothing here wraps the create and the link in one transaction, on purpose:
 * the retry inside `createArchivedDeck` re-runs the whole share-token mint on a
 * collision, and a transaction would have to re-run itself from inside itself.
 * A crash between the two leaves a live row with no candidate pointing at it,
 * which an admin links by hand — the same repair the multi-source model already
 * has an action for.
 *
 * The source *key* is a separate write from the link, in `meta_event_sources`
 * and `meta_deck_sources` (migration 256): ignoring a candidate deletes the row,
 * so a key held only there would make un-ignoring it archive a second copy of
 * everything that source already produced.
 */
import { ERROR_CODES, WellKnown } from "@openrift/shared";
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

/**
 * The live event columns one source's value can be taken into.
 *
 * Exported as the write side's own list. `packages/shared` cannot import from
 * `apps/api`, so the contract declares the same vocabulary and the route asserts
 * the two types are equal in both directions — a field name only one of them
 * knows is a 500 waiting to happen, and the assertion is what catches it at
 * build time rather than in review.
 *
 * `slug` is absent because it is minted once at accept and renaming it breaks
 * every published link. Attribution is absent because it is no longer a column:
 * a source's URL becomes its `meta_event_sources` row when it is linked.
 */
export const META_EVENT_ACCEPT_FIELDS = [
  "name",
  "eventDate",
  "format",
  "playerCount",
  "organizer",
  "notes",
] as const;

/** One column {@link acceptMetaEventField} can write. */
export type MetaEventAcceptField = (typeof META_EVENT_ACCEPT_FIELDS)[number];

/**
 * The archived-deck columns one source's value can be taken into. The card list
 * is not among them: it moves whole, through {@link acceptMetaDeckList}.
 */
export const META_DECK_ACCEPT_FIELDS = [
  "playerName",
  "finishTier",
  "record",
  "listStatus",
] as const;

/** One column {@link acceptMetaDeckField} can write. */
export type MetaDeckAcceptField = (typeof META_DECK_ACCEPT_FIELDS)[number];

/** `meta_event_sources.label` CHECK bound. */
const MAX_CITATION_LABEL_LENGTH = 60;

/** What accepting one candidate event did. */
export interface AcceptedMetaEvent {
  metaEventId: string;
  slug: string;
  /** False when the candidate was already linked and the accept applied a diff. */
  created: boolean;
}

/** What accepting one candidate deck did. */
export interface AcceptedMetaDeck {
  deckId: string;
  created: boolean;
}

/** Where a link, relink or unlink left a candidate event. */
export interface MetaEventLinkResult {
  /** The live event the candidate now points at, or null after an unlink. */
  metaEventId: string | null;
  slug: string | null;
}

/** Where a link, relink or unlink left a candidate deck. */
export interface MetaDeckLinkResult {
  /** The archived deck the candidate now points at, or null after an unlink. */
  deckId: string | null;
}

/** A deck `acceptCandidateEventWithDecks` could not take, and why. */
interface SkippedMetaDeck {
  candidateDeckId: string;
  externalId: string;
  playerName: string;
  reason: string;
}

/** The event accept plus the per-deck outcome of the same call. */
export interface AcceptedMetaEventWithDecks extends AcceptedMetaEvent {
  acceptedDecks: AcceptedMetaDeck[];
  skippedDecks: SkippedMetaDeck[];
}

/** How much a rematch pass moved. */
export interface MetaRematchResult {
  /** Candidate decks that held at least one unresolved name before the pass. */
  examined: number;
  /** Decks whose card list gained at least one resolution. */
  updated: number;
  /** Individual card rows that went from unresolved to a live card. */
  resolved: number;
}

/** Who performed an accept, for the submission ledger's resolver column. */
export interface MetaAcceptOptions {
  /** The reviewing admin, when the caller knows one. */
  resolvedByUserId?: string;
}

/** The extra confirmation a whole-entity event accept needs. */
export interface MetaEventAcceptOptions {
  /**
   * Confirms taking every field of this source over an event a second source
   * also feeds. Required in that case and ignored otherwise — see
   * {@link assertOverwriteAllowed}.
   */
  overwriteAll?: boolean;
}

/** @returns The candidate event with that id. Throws 404 when it is gone. */
async function requireEvent(repos: Repos, id: string): Promise<CandidateMetaEventRow> {
  const row = await repos.metaCandidates.eventById(id);
  if (row === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Candidate event not found");
  }
  return row;
}

/** @returns The candidate deck with that id. Throws 404 when it is gone. */
async function requireDeck(repos: Repos, id: string): Promise<CandidateMetaDeckRow> {
  const row = await repos.metaCandidates.deckById(id);
  if (row === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Candidate deck not found");
  }
  return row;
}

/**
 * @param repos The repositories.
 * @param id The live event id.
 * @returns The live event. Throws 404 when it is gone.
 */
async function requireLiveEvent(repos: Repos, id: string) {
  const row = await repos.meta.eventById(id);
  if (row === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Event not found");
  }
  return row;
}

/**
 * The live event a candidate deck belongs under, and the candidate event it
 * hangs off when it has one.
 *
 * A provider's deck sits under its own candidate event and inherits that
 * event's link. A user submission (ADR-036) targets a live event directly, so
 * it has no candidate parent and its own column is the answer. The table's
 * CHECK guarantees exactly one of the two, so this never has to pick.
 *
 * @param repos The repositories.
 * @param deck The candidate deck.
 * @returns The live event id (null while the parent is unlinked) and the parent.
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
 * The first slug from {@link metaEventSlugCandidates} no live event holds.
 *
 * Checked one at a time rather than in a batch because the first candidate is
 * free in the overwhelming majority of accepts, and a batch would read fifty
 * rows to learn that.
 *
 * @param meta The meta-archive repo.
 * @param name The event name.
 * @param eventDate The event's ISO date.
 * @returns A free, valid, non-reserved slug.
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
 * Writes this provider's citation onto a live event, replacing whatever that
 * key cited before.
 *
 * The delete is what makes a relink work: `(provider, external_id)` is unique
 * across the whole table, so moving a source from one event to another has to
 * take its citation with it rather than leave a stale credit behind.
 *
 * @param repos The repositories.
 * @param candidate The candidate event being linked.
 * @param metaEventId The live event it now points at.
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
    // The provider string is what the event page prints. There is no prettier
    // name to reach for: providers are implicit here, a new string is a new
    // provider, and nothing maps them to display names.
    label: candidate.provider.slice(0, MAX_CITATION_LABEL_LENGTH),
    sourceUrl: candidate.sourceUrl,
  });
}

/**
 * The `meta_deck_sources` key naming one candidate deck, or null when no
 * provider named it — a user submission hangs off a live event directly and has
 * no source event to scope a deck id to. Same reason it cannot be ignored.
 *
 * @param parent The candidate deck's parent event, null for a submission.
 * @param deck The candidate deck.
 * @returns The source key, or null.
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

/**
 * Points an unlinked candidate event at a live event that already exists, and
 * cites it. Writes no field values: the admin picks those field by field
 * afterwards, or never.
 *
 * @param repos The repositories.
 * @param candidateEventId The candidate to link.
 * @param metaEventId The live event to link it to.
 * @returns The live event it now points at.
 */
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

/**
 * Moves an already-linked candidate event to a different live event, taking its
 * citation with it.
 *
 * @param repos The repositories.
 * @param candidateEventId The candidate to move.
 * @param metaEventId The live event to move it to.
 * @returns The live event it now points at.
 */
export async function relinkCandidateEvent(
  repos: Repos,
  candidateEventId: string,
  metaEventId: string,
): Promise<MetaEventLinkResult> {
  const candidate = await requireEvent(repos, candidateEventId);
  return applyEventLink(repos, candidate, metaEventId);
}

/**
 * The write behind link and relink.
 * @param repos The repositories.
 * @param candidate The candidate event.
 * @param metaEventId The live event to point at.
 * @returns The live event it now points at.
 */
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
 * Detaches a candidate event from its live event and removes the citation that
 * link wrote. Every field on the live event stays exactly as it was — including
 * the ones this source contributed, which are the archive's values now.
 *
 * @param repos The repositories.
 * @param candidateEventId The candidate to detach.
 * @returns The (now empty) link.
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

/**
 * Creates the live event a candidate proposes, or overwrites the one it is
 * already linked to, then marks the candidate reviewed.
 *
 * The unlinked path is the one-click accept a single-source event still uses:
 * create, link, cite. The linked path is the blunt "take everything this source
 * says", which stays available because one source is still the common case;
 * picking values apart is {@link acceptMetaEventField}. Once a second source is
 * linked, the blunt path needs `overwriteAll` — see
 * {@link assertOverwriteAllowed}.
 *
 * @param repos The repositories.
 * @param candidateEventId The candidate to accept.
 * @param options Confirmation for a multi-source overwrite.
 * @returns The live event id and whether it was created.
 */
export async function acceptCandidateEvent(
  repos: Repos,
  candidateEventId: string,
  options?: MetaEventAcceptOptions,
): Promise<AcceptedMetaEvent> {
  const { meta, metaCandidates, deckFormats } = repos;
  const candidate = await requireEvent(repos, candidateEventId);

  // A candidate may carry any format string; the live column FKs to
  // `deck_formats`, so an unknown one has to stop here with a usable message
  // rather than at the insert.
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
 * Refuses a whole-entity accept that would overwrite another source's values
 * unless the admin said so.
 *
 * This is the bug the multi-source amendment exists to prevent: with uvsgames
 * and playriftbound both feeding one event, "accept" on either one silently
 * reverts whatever the maintainer curated from the other, and the next
 * re-publish does it again. So the blunt path stays, but only on purpose. A
 * single-source event has no other candidate to clobber and needs no flag, so
 * the one-click accept is unaffected.
 *
 * @param repos The repositories.
 * @param candidate The candidate being accepted whole.
 * @param metaEventId The live event it is linked to.
 * @param options The caller's confirmation, if any.
 * @returns void — throws AppError(409) naming the other sources when the
 *   overwrite is unconfirmed.
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

/**
 * Writes one source's value into one column of the live event it is linked to,
 * and touches nothing else.
 *
 * This is the compare grid's arrow: with two sources on one event, "accept"
 * cannot mean "take all of it" without one provider silently reverting the
 * other's name every time it re-publishes.
 *
 * @param repos The repositories.
 * @param input The candidate and which of its fields to take.
 * @returns The live event that was written.
 */
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

  // Same gate as the whole-entity accept: the live column FKs to
  // `deck_formats`, and a candidate carries whatever its source called it.
  if (input.field === "format") {
    await assertKnownFormat(deckFormats, candidate.format);
  }

  // `checked_at` is deliberately left alone. Taking one field is not reviewing
  // the row — the admin may still be taking the next field from another source.
  await meta.updateEvent(live.id, { [input.field]: candidate[input.field] });
  return { metaEventId: live.id };
}

/**
 * Why this candidate deck cannot be accepted, or null when it can.
 *
 * An archetype-only deck carries the archive's whole claim about it in its
 * legend row, so it needs one that resolved. The general "every card matched"
 * gate below would pass a deck holding nothing but a champion, and that entry
 * would then sit in the legend play-rate under no legend at all.
 *
 * @param metaEventId The live event the deck would land under, or null.
 * @param deck The candidate deck.
 * @returns A reason string, or null.
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

/**
 * @param deck The candidate deck.
 * @returns Whether it holds a legend-zone card that resolved to a live card.
 */
function hasResolvedLegend(deck: CandidateMetaDeckRow): boolean {
  return deck.cards.some((card) => card.zone === WellKnown.deckZone.LEGEND && card.cardId !== null);
}

/**
 * The candidate's cards as diff entries, one row per card and zone.
 *
 * Two rows can legitimately resolve to the same card and zone — a source that
 * splits a playset across lines, or an alias fix that maps two spellings onto
 * one card — and `deck_cards` is unique on `(deck, card, zone)`, so they are
 * summed here rather than 500-ing the accept on the second insert.
 *
 * Unresolved rows must be gone already; the caller gates on that.
 *
 * @param deck The candidate deck, fully resolved.
 * @returns Its cards, duplicates summed.
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

/** @returns The candidate's cards in the repo's insert shape. @see toCardEntries */
function toDeckCardInputs(deck: CandidateMetaDeckRow): MetaDeckCardInput[] {
  return toCardEntries(deck).map((entry) => ({
    cardId: entry.cardId,
    zone: entry.zone as MetaDeckCardInput["zone"],
    quantity: entry.quantity,
    preferredPrintingId: null,
  }));
}

/**
 * Points an unlinked candidate deck at an archived deck that already exists.
 *
 * A candidate deck may only link inside its own event: the deck it points at
 * has to sit under the live event its parent (or its own `meta_event_id`)
 * resolves to, or the archive would gain a deck filed under one event and
 * described by a source about another.
 *
 * @param repos The repositories.
 * @param candidateDeckId The candidate to link.
 * @param deckId The archived deck to link it to.
 * @returns The archived deck it now points at.
 */
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

/**
 * Moves an already-linked candidate deck to a different archived deck.
 * @param repos The repositories.
 * @param candidateDeckId The candidate to move.
 * @param deckId The archived deck to move it to.
 * @returns The archived deck it now points at.
 */
export async function relinkCandidateDeck(
  repos: Repos,
  candidateDeckId: string,
  deckId: string,
): Promise<MetaDeckLinkResult> {
  const deck = await requireDeck(repos, candidateDeckId);
  return applyDeckLink(repos, deck, deckId);
}

/**
 * The write behind linking and relinking a deck, including the same-event
 * check both owe.
 *
 * @param repos The repositories.
 * @param deck The candidate deck.
 * @param deckId The archived deck to point at.
 * @returns The archived deck it now points at.
 */
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

/**
 * Records the source key on the archived deck it now describes, so the pairing
 * outlives the candidate row. Skips a submission, which has no key.
 *
 * @param repos The repositories.
 * @param key The source's key, or null for a user submission.
 * @param deckId The archived deck.
 * @returns Nothing.
 */
async function writeDeckSource(
  repos: Repos,
  key: MetaDeckSourceKey | null,
  deckId: string,
): Promise<void> {
  if (key !== null) {
    await repos.meta.writeDeckSource(deckId, key);
  }
}

/**
 * Detaches a candidate deck from its archived deck. The archived deck keeps
 * every value this source gave it; only the link and this contributor's credit
 * for it go away.
 *
 * @param repos The repositories.
 * @param candidateDeckId The candidate to detach.
 * @returns The (now empty) link.
 */
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
  // The source key goes with the link, exactly as an event's citation does:
  // this provider no longer claims to describe that archived deck, so the next
  // upload of the same key must stage as new rather than re-link.
  const { parent } = await deckTarget(repos, deck);
  const key = deckSourceKey(parent, deck);
  if (key !== null) {
    await repos.meta.deleteDeckSourceByKey(key);
  }
  await repos.metaCandidates.unlinkDeck(deck.id);
  return { deckId: null };
}

/**
 * Creates the live archived deck a candidate proposes, or applies its diff to
 * the one it is already linked to, then marks the candidate reviewed.
 *
 * Requires the parent to be linked and every card name to have resolved; both
 * refusals are BAD_REQUEST with the reason, because both are things the admin
 * fixes and retries rather than server faults.
 *
 * @param repos The repositories.
 * @param candidateDeckId The candidate deck to accept.
 * @param options Who is accepting, for any submission ledger this settles.
 * @returns The live deck id and whether it was created.
 */
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
 * The accept itself, once the caller has established that the deck has a live
 * event to land in and that every card resolved. Split out so the whole-event
 * accept doesn't re-read the parent once per deck.
 *
 * @param repos The repositories.
 * @param metaEventId The live event the deck belongs under.
 * @param deck The candidate deck, fully resolved.
 * @param parent The deck's candidate event, null for a user submission. Passed
 *   in rather than re-read so the whole-event accept reads it once.
 * @param options Who is accepting, for any submission ledger this settles.
 * @returns The live deck id and whether it was created.
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
    // Through the service: this is the path a source's archetype takes when it
    // is finally published with a main deck, and that accept has to mint the
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
    // The event's format is the archive's own vocabulary, already FK-valid.
    // The candidate's format string was checked when its event was accepted.
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
 * Writes one source's value into one column of the archived deck it is linked
 * to. @see acceptMetaEventField
 *
 * `listStatus` goes through `updateArchivedDeck` like every other write of it,
 * because promoting a deck out of `"archetype"` is what mints its permalink.
 *
 * @param repos The repositories.
 * @param input The candidate and which of its fields to take.
 * @param options Who is accepting, for any submission ledger this settles.
 * @returns The archived deck that was written.
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
 * Replaces the archived deck's card list with this source's, along with the
 * completeness the source claims for it.
 *
 * The list moves whole rather than card by card: per-card accept would write
 * `deck_cards` one row at a time for a marginal gain over "take
 * playriftbound's list, then edit it in the deck editor". `listStatus` travels
 * with it because the two are one statement — a list and how much of a list it
 * is — and because promoting out of `"archetype"` is what gives the deck its
 * page.
 *
 * @param repos The repositories.
 * @param candidateDeckId The candidate whose list to take.
 * @param options Who is accepting, for any submission ledger this settles.
 * @returns The archived deck that was written.
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

/**
 * The candidate deck a per-field or per-list accept works on, with the link
 * both of them require already established.
 *
 * @param repos The repositories.
 * @param candidateDeckId The candidate deck.
 * @returns The candidate, the archived deck it points at, and their event.
 */
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
 * Credits the contributor behind an accepted candidate deck and settles their
 * ledger row, in one transaction so a person is never credited without their
 * submission saying so (or the reverse).
 *
 * Provider ingest and hand entry write nothing: `submitted_by_user_id` is set
 * only for the `usersubmission` provider, and a citation is what credits a
 * source.
 *
 * @param repos The repositories.
 * @param candidate The accepted candidate deck.
 * @param metaEventId The event the deck sits under.
 * @param deckId The archived deck.
 * @param options Who accepted it.
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
 * Credits the users whose submissions proposed an event, at the moment that
 * event becomes real.
 *
 * Candidate events carry no submitter of their own — a person submits a deck,
 * and the event they proposed alongside it is that candidate's parent — so the
 * proposers are the distinct submitters among its decks. Their ledger rows stay
 * pending: what they sent was a decklist, and that is settled when the deck is
 * accepted.
 *
 * @param repos The repositories.
 * @param candidate The candidate event just accepted.
 * @param metaEventId The live event it created.
 */
async function creditEventProposers(
  repos: Repos,
  candidate: CandidateMetaEventRow,
  metaEventId: string,
): Promise<void> {
  // Gated on the provider so the one-click accept a scraped event takes gains
  // no read at all: only user submissions can carry a submitter.
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

/**
 * Names a deck whose source shipped none, after the legend it plays.
 *
 * @param repos The repositories.
 * @param deck The candidate deck, fully resolved.
 * @param eventName The live event's name, the fallback when there is no legend.
 * @returns A display name for the archived deck.
 */
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
 * Accepts a candidate event and then every deck under it that is ready.
 *
 * A deck that still has unmatched card names is skipped with its reason rather
 * than failing the call: the usual shape of a real event is "nine lists land,
 * one has a typo", and blocking the other nine on it would make the queue
 * useless.
 *
 * @param repos The repositories.
 * @param candidateEventId The candidate event to accept.
 * @param options Who is accepting, for any submission ledgers this settles,
 *   plus the confirmation a multi-source overwrite needs.
 * @returns The event outcome plus what happened to each deck.
 */
export async function acceptCandidateEventWithDecks(
  repos: Repos,
  candidateEventId: string,
  options?: MetaAcceptOptions & MetaEventAcceptOptions,
): Promise<AcceptedMetaEventWithDecks> {
  const event = await acceptCandidateEvent(repos, candidateEventId, options);
  const decks = await repos.metaCandidates.decksByCandidateEventIds([candidateEventId]);
  // Read once for the whole batch: every deck under one candidate event shares
  // its provider and event key, which is two thirds of each deck's source key.
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
 * Re-runs card-name resolution over every candidate deck that still holds an
 * unmatched name.
 *
 * This is the second half of the alias-fix flow: an admin adds a
 * `card_name_aliases` row for a name a source spells differently, then rematches
 * so the decks already staged pick it up without waiting for the next upload.
 * Same idea as `relink-candidates.ts` does for candidate printings.
 *
 * Resolving a name is not a *source* change, so `checked_at` is deliberately
 * left alone — a deck an admin already reviewed does not re-enter the queue
 * just because we finally understand one of its cards.
 *
 * @param repos The repositories.
 * @returns How many decks were examined, updated, and card rows resolved.
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
