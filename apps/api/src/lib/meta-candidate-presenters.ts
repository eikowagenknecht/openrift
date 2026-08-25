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

type CardNames = ReadonlyMap<string, string>;

type CardDiffResponse = NonNullable<MetaCandidateDeck["diff"]>["cards"];

/**
 * The distinct card names in a candidate deck that matched no live card. This
 * is the accept gate: a deck with any entry here cannot become an archived
 * deck, because a `deck_cards` row needs a real card id. The fix is a
 * `card_name_aliases` row plus a rematch, not an edit here.
 */
export function unresolvedCardNames(deck: CandidateMetaDeckRow): string[] {
  return [...new Set(deck.cards.filter((card) => card.cardId === null).map((card) => card.name))];
}

/**
 * Swaps the `event` field diff's live-event ids for their names. The diff
 * compares events by id, because two events can share a name and a move
 * between them is still a move. A reviewer needs the name, so it goes on
 * here — an id with no name left stands for itself rather than disappearing.
 */
function withEventNames(
  fields: readonly MetaFieldDiff[],
  eventNames: ReadonlyMap<string, string>,
): MetaFieldDiff[] {
  function label(value: MetaFieldDiff["from"]): MetaFieldDiff["from"] {
    return typeof value === "string" ? (eventNames.get(value) ?? value) : value;
  }
  return fields.map((field) =>
    field.field === "event" ? { ...field, from: label(field.from), to: label(field.to) } : field,
  );
}

function toCardDiffResponse(diff: MetaDeckCardDiff, cardNames: CardNames): CardDiffResponse {
  return {
    added: diff.added.map((entry) => ({ ...entry, name: cardNames.get(entry.cardId) ?? null })),
    removed: diff.removed.map((entry) => ({ ...entry, name: cardNames.get(entry.cardId) ?? null })),
    changed: diff.changed.map((entry) => ({ ...entry, name: cardNames.get(entry.cardId) ?? null })),
  };
}

/**
 * The deck as the review screen reads it. `submittedByName` is null for a
 * provider's deck, and for a submitter who never set a name or whose account
 * is gone.
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
 * One row of the review queue. The count options come from the caller because
 * they are aggregates over the event's decks, which the queue reads in one
 * batch rather than per row.
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
 * The full candidate view. `sources` holds every candidate on the same live
 * event, this one included, so the review screen gets one column per source;
 * `submittedDecks` are candidate decks attached to the live event directly —
 * user submissions, which belong to no source column.
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
