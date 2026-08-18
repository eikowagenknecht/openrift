import type {
  MetaCandidateDeck,
  MetaCandidateDetail,
  MetaCandidateQueueRow,
  MetaCandidateSource,
} from "@openrift/shared";

import type {
  CandidateMetaDeckRow,
  CandidateMetaEventRow,
} from "../repositories/meta-candidates.js";
import type { MetaDeckCardDiff, MetaDeckDiff, MetaFieldDiff } from "./meta-candidate-diff.js";
import { hasDeckDiff, metaCandidateState } from "./meta-candidate-diff.js";

/** Card display names by card id, for the diff rows the review screen renders. */
type CardNames = ReadonlyMap<string, string>;

/** The card-list delta as the wire carries it: every row named for display. */
type CardDiffResponse = NonNullable<MetaCandidateDeck["diff"]>["cards"];

/**
 * The distinct card names in a candidate deck that matched no live card.
 *
 * This is the accept gate: a deck with any entry here cannot become an archived
 * deck, because a `deck_cards` row needs a real card id. The fix is a
 * `card_name_aliases` row plus a rematch, not an edit here.
 *
 * @param deck The candidate deck.
 * @returns The unmatched names, de-duplicated, in first-seen order.
 */
export function unresolvedCardNames(deck: CandidateMetaDeckRow): string[] {
  return [...new Set(deck.cards.filter((card) => card.cardId === null).map((card) => card.name))];
}

/**
 * Swaps the `event` field diff's live-event ids for their names.
 *
 * The diff compares events by id, because two events can share a name and a
 * move between them is still a move. A reviewer needs the name, so it goes on
 * here — an id with no name left stands for itself rather than disappearing.
 *
 * @param fields The deck's field diffs.
 * @param eventNames Live event names by id.
 * @returns The same diffs, with the event row named.
 */
function withEventNames(
  fields: readonly MetaFieldDiff[],
  eventNames: ReadonlyMap<string, string>,
): MetaFieldDiff[] {
  /** @returns The event's name, or the raw value when it is not an id we know. */
  function label(value: MetaFieldDiff["from"]): MetaFieldDiff["from"] {
    return typeof value === "string" ? (eventNames.get(value) ?? value) : value;
  }
  return fields.map((field) =>
    field.field === "event" ? { ...field, from: label(field.from), to: label(field.to) } : field,
  );
}

/**
 * @param diff A card-list delta.
 * @param cardNames Display names for the cards it mentions.
 * @returns The delta with a name on every row.
 */
function toCardDiffResponse(diff: MetaDeckCardDiff, cardNames: CardNames): CardDiffResponse {
  return {
    added: diff.added.map((entry) => ({ ...entry, name: cardNames.get(entry.cardId) ?? null })),
    removed: diff.removed.map((entry) => ({ ...entry, name: cardNames.get(entry.cardId) ?? null })),
    changed: diff.changed.map((entry) => ({ ...entry, name: cardNames.get(entry.cardId) ?? null })),
  };
}

/**
 * @param deck The candidate deck.
 * @param options.diff Its diff against the linked live deck, or null while unlinked.
 * @param options.shareToken The linked live deck's permalink, or null.
 * @param options.cardNames Display names for the cards the diff mentions.
 * @param options.eventNames Display names for the live events the diff mentions.
 * @param options.submittedByName The submitter's display name, for a user
 *   submission. Null for a provider's deck, and for a submitter who never set a
 *   name or whose account is gone.
 * @returns The deck as the review screen reads it.
 */
export function toMetaCandidateDeck(
  deck: CandidateMetaDeckRow,
  options: {
    diff: MetaDeckDiff | null;
    shareToken: string | null;
    cardNames: CardNames;
    eventNames: ReadonlyMap<string, string>;
    submittedByName?: string | null;
  },
): MetaCandidateDeck {
  const { diff, shareToken, cardNames, eventNames } = options;
  return {
    id: deck.id,
    externalId: deck.externalId,
    playerName: deck.playerName,
    finishTier: deck.finishTier,
    record: deck.record,
    name: deck.name,
    cards: deck.cards.map((card) => ({
      name: card.name,
      zone: card.zone,
      quantity: card.quantity,
      cardId: card.cardId,
    })),
    listStatus: deck.listStatus,
    unresolvedNames: unresolvedCardNames(deck),
    deckId: deck.deckId,
    shareToken,
    submittedByUserId: deck.submittedByUserId,
    submittedByName: options.submittedByName ?? null,
    submissionNote: deck.submissionNote,
    state: metaCandidateState(deck.deckId !== null, diff !== null && hasDeckDiff(diff)),
    diff:
      diff === null
        ? null
        : {
            fields: withEventNames(diff.fields, eventNames),
            cards: toCardDiffResponse(diff.cards, cardNames),
          },
    checkedAt: deck.checkedAt?.toISOString() ?? null,
  };
}

/**
 * One row of the review queue. `deckCount` and `unresolvedCardCount` come from
 * the caller because they are aggregates over the event's decks, which the
 * queue reads in one batch rather than per row.
 *
 * @param event The candidate event.
 * @param options.deckCount How many candidate decks it holds.
 * @param options.unacceptedDeckCount How many of those are not yet in the archive.
 * @param options.unresolvedCardCount How many card names across them matched nothing.
 * @param options.hasDiff Whether the linked live event disagrees.
 * @param options.metaEventSlug The linked live event's slug, or null.
 * @returns The queue row.
 */
export function toMetaCandidateQueueRow(
  event: CandidateMetaEventRow,
  options: {
    deckCount: number;
    unacceptedDeckCount: number;
    unresolvedCardCount: number;
    hasDiff: boolean;
    metaEventSlug: string | null;
  },
): MetaCandidateQueueRow {
  return {
    id: event.id,
    provider: event.provider,
    externalId: event.externalId,
    name: event.name,
    eventDate: event.eventDate,
    format: event.format,
    deckCount: options.deckCount,
    unacceptedDeckCount: options.unacceptedDeckCount,
    unresolvedCardCount: options.unresolvedCardCount,
    state: metaCandidateState(event.metaEventId !== null, options.hasDiff),
    checkedAt: event.checkedAt?.toISOString() ?? null,
    metaEventId: event.metaEventId,
    metaEventSlug: options.metaEventSlug,
  };
}

/**
 * The full candidate view: the event's own fields, what accepting it would
 * change, and every deck under it with the same treatment.
 *
 * @param event The candidate event.
 * @param options.diff Its field diff against the linked live event, or null while unlinked.
 * @param options.formatKnown Whether `event.format` exists in `deck_formats`.
 * @param options.metaEventSlug The linked live event's slug, or null.
 * @param options.decks Its decks, already presented.
 * @param options.sources Every candidate on the same live event, this one
 *   included, so the review screen gets one column per source.
 * @param options.submittedDecks Candidate decks attached to the live event
 *   directly — user submissions, which belong to no source column.
 * @returns The detail response.
 */
export function toMetaCandidateDetail(
  event: CandidateMetaEventRow,
  options: {
    diff: MetaFieldDiff[] | null;
    formatKnown: boolean;
    metaEventSlug: string | null;
    decks: MetaCandidateDeck[];
    sources: MetaCandidateSource[];
    submittedDecks: MetaCandidateDeck[];
  },
): MetaCandidateDetail {
  return {
    id: event.id,
    provider: event.provider,
    externalId: event.externalId,
    name: event.name,
    eventDate: event.eventDate,
    format: event.format,
    formatKnown: options.formatKnown,
    playerCount: event.playerCount,
    organizer: event.organizer,
    sourceUrl: event.sourceUrl,
    notes: event.notes,
    extraData: event.extraData ?? null,
    metaEventId: event.metaEventId,
    metaEventSlug: options.metaEventSlug,
    state: metaCandidateState(event.metaEventId !== null, (options.diff?.length ?? 0) > 0),
    diff: options.diff,
    checkedAt: event.checkedAt?.toISOString() ?? null,
    decks: options.decks,
    sources: options.sources,
    submittedDecks: options.submittedDecks,
  };
}

/**
 * One source's column in the review grid: its key, the values it proposes, and
 * the decks it holds. The live values it is compared against are the event's
 * own row, which the caller already has.
 *
 * @param event The candidate event this source pushed.
 * @param decks Its decks, already presented.
 * @returns The source row.
 */
export function toMetaCandidateSource(
  event: CandidateMetaEventRow,
  decks: MetaCandidateDeck[],
): MetaCandidateSource {
  return {
    id: event.id,
    provider: event.provider,
    externalId: event.externalId,
    name: event.name,
    eventDate: event.eventDate,
    format: event.format,
    playerCount: event.playerCount,
    organizer: event.organizer,
    sourceUrl: event.sourceUrl,
    notes: event.notes,
    checkedAt: event.checkedAt?.toISOString() ?? null,
    decks,
  };
}
