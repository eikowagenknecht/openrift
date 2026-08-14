/**
 * Turning reviewed meta-archive candidates into live rows, and the two review
 * actions that stop short of that (ADR-014).
 *
 * Accepts are whole-entity: an unlinked candidate creates the live row, a
 * linked one overwrites it with what the candidate says. There is no per-field
 * merge — the card pipeline's compare grid exists because many providers
 * disagree field by field, and the archive has one or two sources.
 *
 * Nothing here wraps the create and the link in one transaction, on purpose.
 * The live row is written with its source columns *first* (`source_provider` +
 * `source_external_id`, and on a deck `source_event_external_id` too, since
 * deck ids repeat across events), which is the key the next upload re-links on. So a
 * crash between the two leaves a live row that the next ingest finds and
 * re-links by itself, rather than a transaction that would have to re-run the
 * share-token retry from inside itself.
 */
import { ERROR_CODES, WellKnown } from "@openrift/shared";

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
import type { MetaDeckCardInput } from "../repositories/meta.js";
import { loadCardNameIndex, resolveCardIdByName } from "./candidate-links.js";
import { createArchivedDeck, updateArchivedDeck } from "./create-archived-deck.js";

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
 * Creates the live event a candidate proposes, or overwrites the one it is
 * already linked to, then marks the candidate reviewed.
 *
 * @param repos The repositories.
 * @param candidateEventId The candidate to accept.
 * @returns The live event id and whether it was created.
 */
export async function acceptCandidateEvent(
  repos: Repos,
  candidateEventId: string,
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
    sourceUrl: candidate.sourceUrl,
    notes: candidate.notes,
  };

  if (candidate.metaEventId !== null) {
    const live = await meta.eventById(candidate.metaEventId);
    if (live === undefined) {
      // The FK is ON DELETE SET NULL, so this is unreachable short of a manual
      // delete racing this call.
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Linked event no longer exists");
    }
    await meta.updateEvent(live.id, fields);
    await metaCandidates.setEventCheckedAt(candidateEventId, new Date());
    return { metaEventId: live.id, slug: live.slug, created: false };
  }

  const slug = await resolveEventSlug(meta, candidate.name, candidate.eventDate);
  const created = await meta.createEvent({
    slug,
    ...fields,
    sourceProvider: candidate.provider,
    sourceExternalId: candidate.externalId,
  });
  await metaCandidates.linkEvent(candidateEventId, created.id, new Date());
  return { metaEventId: created.id, slug, created: true };
}

/**
 * Why this candidate deck cannot be accepted, or null when it can.
 *
 * An archetype-only deck carries the archive's whole claim about it in its
 * legend row, so it needs one that resolved. The general "every card matched"
 * gate below would pass a deck holding nothing but a champion, and that entry
 * would then sit in the legend play-rate under no legend at all.
 *
 * @param parent The deck's candidate event.
 * @param deck The candidate deck.
 * @returns A reason string, or null.
 */
function deckBlockedReason(
  parent: CandidateMetaEventRow,
  deck: CandidateMetaDeckRow,
): string | null {
  if (parent.metaEventId === null) {
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
 * Creates the live archived deck a candidate proposes, or applies its diff to
 * the one it is already linked to, then marks the candidate reviewed.
 *
 * Requires the parent candidate to be linked and every card name to have
 * resolved; both refusals are BAD_REQUEST with the reason, because both are
 * things the admin fixes and retries rather than server faults.
 *
 * @param repos The repositories.
 * @param candidateDeckId The candidate deck to accept.
 * @returns The live deck id and whether it was created.
 */
export async function acceptCandidateDeck(
  repos: Repos,
  candidateDeckId: string,
): Promise<AcceptedMetaDeck> {
  const deck = await requireDeck(repos, candidateDeckId);
  const parent = await requireEvent(repos, deck.candidateEventId);
  const blocked = deckBlockedReason(parent, deck);
  if (blocked !== null) {
    throw new AppError(400, ERROR_CODES.BAD_REQUEST, blocked);
  }
  return acceptResolvedDeck(repos, parent, deck);
}

/**
 * The accept itself, once the caller has established that the parent is linked
 * and every card resolved. Split out so the whole-event accept doesn't re-read
 * the parent once per deck.
 *
 * @param repos The repositories.
 * @param parent The deck's candidate event, already linked.
 * @param deck The candidate deck, fully resolved.
 * @returns The live deck id and whether it was created.
 */
async function acceptResolvedDeck(
  repos: Repos,
  parent: CandidateMetaEventRow,
  deck: CandidateMetaDeckRow,
): Promise<AcceptedMetaDeck> {
  const { meta, metaCandidates } = repos;
  const metaEventId = parent.metaEventId as string;
  const now = new Date();

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
    await metaCandidates.setDeckCheckedAt(deck.id, now);
    return { deckId: deck.deckId, created: false };
  }

  const liveEvent = await meta.eventById(metaEventId);
  if (liveEvent === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Linked event no longer exists");
  }

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
    sourceProvider: parent.provider,
    sourceEventExternalId: parent.externalId,
    sourceExternalId: deck.externalId,
  });
  if (created === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Linked event no longer exists");
  }

  await metaCandidates.linkDeck(deck.id, created.deckId, now);
  return { deckId: created.deckId, created: true };
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
 * @returns The event outcome plus what happened to each deck.
 */
export async function acceptCandidateEventWithDecks(
  repos: Repos,
  candidateEventId: string,
): Promise<AcceptedMetaEventWithDecks> {
  const event = await acceptCandidateEvent(repos, candidateEventId);

  // Re-read: the accept is what linked it, and the deck path needs the link.
  const parent = await requireEvent(repos, candidateEventId);
  const decks = await repos.metaCandidates.decksByCandidateEventIds([candidateEventId]);

  const acceptedDecks: AcceptedMetaDeck[] = [];
  const skippedDecks: SkippedMetaDeck[] = [];
  for (const deck of decks) {
    const blocked = deckBlockedReason(parent, deck);
    if (blocked !== null) {
      skippedDecks.push({
        candidateDeckId: deck.id,
        externalId: deck.externalId,
        playerName: deck.playerName,
        reason: blocked,
      });
      continue;
    }
    acceptedDecks.push(await acceptResolvedDeck(repos, parent, deck));
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
