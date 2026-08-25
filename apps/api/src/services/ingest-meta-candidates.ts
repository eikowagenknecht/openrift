/**
 * External tooling pushes `{ provider, events: [...] }`; each uploaded event
 * wholly replaces its own candidate — fields and decks alike — and events the
 * payload does not name are left alone. There is deliberately no provider-wide
 * replace: a full dump could be huge, and a partial push must stay safe.
 *
 * The shape follows the card pipeline (`ingest-candidates.ts`): dedup the
 * payload first, validate per item and skip the bad ones rather than failing the
 * batch, bulk-read everything before the write loop, and reset `checked_at`
 * whenever an upload disagrees with what a human already reviewed.
 *
 * Two things this pipeline adds. Card names resolve through the *shared*
 * matcher in `candidate-links.ts`, so an alias fix made for the card pipeline
 * applies here too. And a candidate that is already linked to a live row and
 * has nothing to change against it settles itself (`checked_at = now`) at
 * ingest, so a re-upload of an event the admin already accepted never re-enters
 * the review queue.
 */
import { WellKnown } from "@openrift/shared";
import type { MetaIngestEvent, MetaIngestEventDeck } from "@openrift/shared";

import type { CandidateMetaDeckCard } from "../db/index.js";
import type { Transact } from "../deps.js";
import { isValidIsoDate } from "../lib/iso-date.js";
import type { MetaDeckCardEntry } from "../lib/meta-candidate-diff.js";
import {
  collapseCardEntries,
  diffMetaDeck,
  diffMetaEvent,
  hasDeckDiff,
  normalize,
} from "../lib/meta-candidate-diff.js";
import type {
  CandidateMetaDeckRow,
  CandidateMetaEventRow,
  LiveMetaDeckRow,
} from "../repositories/meta-candidates.js";
import type { CardNameIndex } from "./candidate-links.js";
import { loadCardNameIndex, resolveCardIdByName } from "./candidate-links.js";

interface MetaIngestEventDetail {
  externalId: string;
  name: string;
}

/** A candidate deck the upload dropped because its event no longer lists it. */
interface MetaIngestDeckDetail {
  eventExternalId: string;
  externalId: string;
  playerName: string;
}

/** Card names in one deck that matched no live card, so it cannot be accepted yet. */
interface MetaIngestUnresolvedCards {
  eventExternalId: string;
  deckExternalId: string;
  names: string[];
}

/** What one upload did. Counts for the summary line, arrays for the detail panel. */
export interface MetaIngestResult {
  provider: string;
  newEvents: number;
  updatedEvents: number;
  unchangedEvents: number;
  newDecks: number;
  updatedDecks: number;
  removedDecks: number;
  unchangedDecks: number;
  /** Events and decks skipped because their key is on an ignore list. */
  ignoredSkipped: number;
  /** One line per dropped duplicate and per item that failed validation. */
  errors: string[];
  newEventDetails: MetaIngestEventDetail[];
  updatedEventDetails: MetaIngestEventDetail[];
  removedDeckDetails: MetaIngestDeckDetail[];
  unresolvedCards: MetaIngestUnresolvedCards[];
}

const DECK_ZONES = new Set<string>(Object.values(WellKnown.deckZone));

/**
 * External deck ids are only unique within an event, so anything that spans
 * events — the ignore list, the index of live decks this provider already
 * contributed — has to pair the two. The separator is a newline, which no
 * source id contains.
 */
function deckKey(eventExternalId: string, externalId: string): string {
  return `${eventExternalId}\n${externalId}`;
}

function isPositiveInt(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function inBounds(value: string | null, min: number, max: number): boolean {
  return value === null || (value.length >= min && value.length <= max);
}

/**
 * Checked against the same bounds the table's CHECK constraints enforce.
 *
 * `format` is deliberately not checked against `deck_formats`: a candidate
 * carries whatever the source called it, and an unknown format is something the
 * review screen reports, not a reason to drop the event.
 */
function validateEvent(event: MetaIngestEvent): string[] {
  const problems: string[] = [];
  if (event.externalId.trim() === "") {
    problems.push("externalId must not be empty");
  }
  if (!inBounds(event.name, 1, 120)) {
    problems.push("name must be 1-120 characters");
  }
  if (!isValidIsoDate(event.eventDate)) {
    problems.push(`eventDate "${event.eventDate}" is not a YYYY-MM-DD date`);
  }
  if (event.format.trim() === "") {
    problems.push("format must not be empty");
  }
  if (event.playerCount !== null && !isPositiveInt(event.playerCount)) {
    problems.push("playerCount must be a positive integer");
  }
  if (!inBounds(event.organizer, 1, 120)) {
    problems.push("organizer must be 1-120 characters");
  }
  if (!inBounds(event.sourceUrl, 1, 2000)) {
    problems.push("sourceUrl must be 1-2000 characters");
  }
  if (!inBounds(event.notes, 0, 4000)) {
    problems.push("notes must be at most 4000 characters");
  }
  return problems;
}

/**
 * A deck with no cards is rejected even though the column would accept `[]`:
 * an empty list trivially satisfies "every card resolved" and would accept
 * into an empty archived deck.
 */
function validateDeck(deck: MetaIngestEventDeck): string[] {
  const problems: string[] = [];
  if (deck.externalId.trim() === "") {
    problems.push("externalId must not be empty");
  }
  if (!inBounds(deck.playerName, 1, 80)) {
    problems.push("playerName must be 1-80 characters");
  }
  if (!Number.isInteger(deck.finishTier) || deck.finishTier < 1) {
    problems.push("finishTier must be a positive integer");
  }
  if (!inBounds(deck.record, 1, 20)) {
    problems.push("record must be 1-20 characters");
  }
  if (!inBounds(deck.name, 1, 120)) {
    problems.push("name must be 1-120 characters");
  }
  if (deck.cards.length === 0) {
    problems.push("cards must not be empty");
  }
  for (const card of deck.cards) {
    if (card.name.trim() === "") {
      problems.push("a card name is empty");
    }
    if (!DECK_ZONES.has(card.zone)) {
      problems.push(`card "${card.name}" has unknown zone "${card.zone}"`);
    }
    if (!isPositiveInt(card.quantity)) {
      problems.push(`card "${card.name}" has a non-positive quantity`);
    }
  }
  return problems;
}

/** The candidate event columns an upload owns, for change detection and writes. */
function eventFields(event: MetaIngestEvent) {
  return {
    name: event.name,
    eventDate: event.eventDate,
    format: event.format,
    playerCount: event.playerCount,
    organizer: event.organizer,
    sourceUrl: event.sourceUrl,
    notes: event.notes,
    extraData: event.extraData,
  };
}

/** The candidate deck columns an upload owns, excluding the card list. */
function deckFields(deck: MetaIngestEventDeck) {
  return {
    playerName: deck.playerName,
    finishTier: deck.finishTier,
    record: deck.record,
    name: deck.name,
    // A source that fills in what it published before — an archetype becoming a
    // list, a partial one gaining its battlefields — changes this and the cards
    // and nothing else, so it has to be part of change detection or the upgrade
    // never reaches the queue.
    listStatus: deck.listStatus,
  };
}

/**
 * The field values change detection compares, with `""` and whitespace-only
 * strings read as absent — the same rule the diff module applies, so a stored
 * `""` never reads as a change against an incoming null. Non-scalars (only
 * `extra_data`, arbitrary JSON) pass through for `Bun.deepEquals` to handle.
 */
function comparable(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    const scalar = typeof value === "string" || typeof value === "number";
    out[key] = scalar || value === null || value === undefined ? normalize(value) : value;
  }
  return out;
}

/**
 * `extra_data` is arbitrary JSON, so a shallow compare would report a change on
 * every upload. Everything else here is a scalar.
 */
function sameFields(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return Bun.deepEquals(comparable(a), comparable(b));
}

/**
 * A deck's cards in a stable order, so a source that reshuffles its list
 * between pushes does not read as a change and reset a completed review. The
 * stored column keeps the source's own order; only the comparison is sorted.
 */
function sortedCards(cards: readonly CandidateMetaDeckCard[]): CandidateMetaDeckCard[] {
  return cards.toSorted((a, b) => {
    const byCard = (a.cardId ?? a.name).localeCompare(b.cardId ?? b.name);
    if (byCard !== 0) {
      return byCard;
    }
    const byZone = a.zone.localeCompare(b.zone);
    return byZone === 0 ? a.quantity - b.quantity : byZone;
  });
}

/**
 * What a deck's card list says *before* name resolution. Change detection runs
 * on this rather than on the resolved rows, so that a rematch turning a null
 * `cardId` into a real one does not kick an already-reviewed deck back into the
 * queue — the source said the same thing, we just understand it better now.
 */
function sourceCards(cards: readonly CandidateMetaDeckCard[]) {
  return sortedCards(cards).map((card) => ({
    name: card.name,
    zone: card.zone,
    quantity: card.quantity,
  }));
}

/**
 * The resolved rows a diff against a live deck compares, dropping unresolved
 * ones and summing rows that landed on the same card and zone — the same
 * collapse the accept path applies before writing `deck_cards`, so an accepted
 * deck reads as in sync afterwards.
 */
function resolvedCardEntries(cards: readonly CandidateMetaDeckCard[]): MetaDeckCardEntry[] {
  const entries: MetaDeckCardEntry[] = [];
  for (const card of cards) {
    if (card.cardId !== null) {
      entries.push({ cardId: card.cardId, zone: card.zone, quantity: card.quantity });
    }
  }
  return collapseCardEntries(entries);
}

function resolveCards(index: CardNameIndex, deck: MetaIngestEventDeck): CandidateMetaDeckCard[] {
  return deck.cards.map((card) => ({
    name: card.name,
    zone: card.zone,
    quantity: card.quantity,
    cardId: resolveCardIdByName(index, card.name),
  }));
}

/**
 * Decides the `checked_at` an upload should leave on a candidate row.
 *
 * Three cases, in order: a row that now matches its live counterpart settles
 * itself so it never reaches the queue; a row the upload changed (in its fields
 * or in what it links to) goes back into the queue; anything else keeps the
 * review state it had. Returns `undefined` to leave the column alone.
 */
function nextCheckedAt(options: {
  previous: Date | null | undefined;
  changed: boolean;
  inSync: boolean;
  now: Date;
}): Date | null | undefined {
  if (options.inSync) {
    // Re-stamping an already-settled row would only churn `updated_at`.
    return options.previous === null || options.previous === undefined || options.changed
      ? options.now
      : undefined;
  }
  if (options.changed) {
    return null;
  }
  return undefined;
}

/**
 * Stage one provider's uploaded events, replacing each named event's candidate
 * wholesale and leaving every other candidate untouched.
 *
 * The whole batch runs in one transaction: a payload either lands or it does
 * not, so a mid-batch failure can never leave an event's decks half-replaced.
 * Per-item validation failures are not batch failures — they are reported and
 * skipped.
 */
export async function ingestMetaCandidates(
  transact: Transact,
  provider: string,
  events: MetaIngestEvent[],
): Promise<MetaIngestResult> {
  if (!provider.trim()) {
    throw new Error("provider name must not be empty");
  }

  const result: MetaIngestResult = {
    provider,
    newEvents: 0,
    updatedEvents: 0,
    unchangedEvents: 0,
    newDecks: 0,
    updatedDecks: 0,
    removedDecks: 0,
    unchangedDecks: 0,
    ignoredSkipped: 0,
    errors: [],
    newEventDetails: [],
    updatedEventDetails: [],
    removedDeckDetails: [],
    unresolvedCards: [],
  };

  // Two events sharing an external id would resolve to the same candidate row
  // twice, and which values survived would depend on payload order — a silent
  // flip on every re-upload. Keep the first occurrence and report the rest.
  //
  // Deck ids dedup within their event, matching the table's UNIQUE
  // (candidate_event_id, external_id). They are only event-scoped — sources
  // number their lists per event — so every key that reaches past this loop
  // (the ignore list, the live-deck index, the live source columns) pairs the
  // deck id with its event's.
  const seenEventIds = new Set<string>();
  const deduped: MetaIngestEvent[] = [];
  for (const event of events) {
    if (seenEventIds.has(event.externalId)) {
      result.errors.push(
        `Duplicate event externalId "${event.externalId}" ("${event.name}") — dropped duplicate, keeping first occurrence`,
      );
      continue;
    }
    seenEventIds.add(event.externalId);

    const seenDeckIds = new Set<string>();
    const decks: MetaIngestEventDeck[] = [];
    for (const deck of event.decks) {
      if (seenDeckIds.has(deck.externalId)) {
        result.errors.push(
          `Duplicate deck externalId "${deck.externalId}" in event "${event.externalId}" — dropped duplicate, keeping first occurrence`,
        );
        continue;
      }
      seenDeckIds.add(deck.externalId);
      decks.push(deck);
    }
    deduped.push({ ...event, decks });
  }

  await transact(async (repos) => {
    const repo = repos.metaCandidates;
    const now = new Date();

    const eventKeys = deduped.map((event) => event.externalId);
    const deckKeys = deduped.flatMap((event) => event.decks.map((deck) => deck.externalId));

    const [existingEvents, ignoredEventIds, ignoredDeckKeys, liveEvents, liveDecks, nameIndex] =
      await Promise.all([
        repo.eventsBySourceKeys(provider, eventKeys),
        repo.ignoredEventIds(provider),
        repo.ignoredDeckKeys(provider),
        repo.liveEventsByCandidateKeys(provider, eventKeys),
        repo.liveDecksByCandidateKeys(provider, eventKeys, deckKeys),
        loadCardNameIndex(repos.ingest),
      ]);

    const existingEventByKey = new Map(existingEvents.map((row) => [row.externalId, row]));
    const ignoredEvents = new Set(ignoredEventIds);
    const ignoredDecks = new Set(
      ignoredDeckKeys.map((key) => deckKey(key.eventExternalId, key.externalId)),
    );
    // Both indexes are keyed on the *source's* vocabulary, which the live
    // tables do not hold. The repo reads it from the `meta_event_sources` /
    // `meta_deck_sources` rows — deliberately not from the candidate, which an
    // ignore deletes — and hands the key back alongside the live row.
    const liveEventByKey = new Map(liveEvents.map((row) => [row.candidateExternalId, row]));
    const liveDeckByKey = new Map<string, LiveMetaDeckRow>(
      liveDecks.map((row) => [deckKey(row.candidateEventExternalId, row.candidateExternalId), row]),
    );

    const liveDeckCardRows = await repo.liveDeckCards(liveDecks.map((row) => row.deckId));
    const liveCardsByDeck = new Map<string, MetaDeckCardEntry[]>();
    for (const row of liveDeckCardRows) {
      const entries = liveCardsByDeck.get(row.deckId);
      const entry = { cardId: row.cardId, zone: row.zone, quantity: row.quantity };
      if (entries) {
        entries.push(entry);
      } else {
        liveCardsByDeck.set(row.deckId, [entry]);
      }
    }

    const existingDecks = await repo.decksByCandidateEventIds(existingEvents.map((row) => row.id));
    const existingDecksByEvent = Map.groupBy(existingDecks, (row) => row.candidateEventId);

    for (const event of deduped) {
      if (ignoredEvents.has(event.externalId)) {
        result.ignoredSkipped++;
        continue;
      }

      const problems = validateEvent(event);
      if (problems.length > 0) {
        result.errors.push(`Event "${event.externalId}": ${problems.join(", ")}`);
        continue;
      }

      const existing = existingEventByKey.get(event.externalId);
      const live = liveEventByKey.get(event.externalId);
      const metaEventId = live?.id ?? null;
      const fields = eventFields(event);
      const inSync = live !== undefined && diffMetaEvent(live, event).length === 0;

      let candidateEventId: string;
      if (existing === undefined) {
        candidateEventId = await repo.insertEvent({
          provider,
          externalId: event.externalId,
          ...fields,
          extraData: fields.extraData,
          metaEventId,
          checkedAt: inSync ? now : null,
        });
        result.newEvents++;
        result.newEventDetails.push({ externalId: event.externalId, name: event.name });
      } else {
        candidateEventId = existing.id;
        const fieldsChanged = !sameFields(fields, eventFields(toEventLike(existing)));
        const linkChanged = existing.metaEventId !== metaEventId;
        const changed = fieldsChanged || linkChanged;
        const checkedAt = nextCheckedAt({
          previous: existing.checkedAt,
          changed,
          inSync,
          now,
        });

        if (changed || checkedAt !== undefined) {
          await repo.updateEvent(candidateEventId, {
            ...fields,
            extraData: fields.extraData,
            metaEventId,
            ...(checkedAt === undefined ? {} : { checkedAt }),
          });
        }

        if (changed) {
          result.updatedEvents++;
          result.updatedEventDetails.push({ externalId: event.externalId, name: event.name });
        } else {
          result.unchangedEvents++;
        }
      }

      const existingDeckRows = existingDecksByEvent.get(candidateEventId) ?? [];
      const existingDeckByKey = new Map(existingDeckRows.map((row) => [row.externalId, row]));
      const keptDeckIds = new Set<string>();

      for (const deck of event.decks) {
        if (ignoredDecks.has(deckKey(event.externalId, deck.externalId))) {
          result.ignoredSkipped++;
          continue;
        }

        const deckProblems = validateDeck(deck);
        if (deckProblems.length > 0) {
          result.errors.push(
            `Deck "${deck.externalId}" in event "${event.externalId}": ${deckProblems.join(", ")}`,
          );
          continue;
        }

        const cards = resolveCards(nameIndex, deck);
        const unresolved = cards.filter((card) => card.cardId === null).map((card) => card.name);
        if (unresolved.length > 0) {
          result.unresolvedCards.push({
            eventExternalId: event.externalId,
            deckExternalId: deck.externalId,
            names: [...new Set(unresolved)],
          });
        }

        const liveDeck = liveDeckByKey.get(deckKey(event.externalId, deck.externalId));
        const liveDeckId = liveDeck?.deckId ?? null;
        const deckValues = deckFields(deck);
        const deckInSync =
          liveDeck !== undefined &&
          unresolved.length === 0 &&
          !hasAnyDeckChange(
            liveDeck,
            liveCardsByDeck.get(liveDeck.deckId) ?? [],
            deck,
            cards,
            metaEventId,
          );

        const existingDeck = existingDeckByKey.get(deck.externalId);
        if (existingDeck === undefined) {
          await repo.insertDeck({
            candidateEventId,
            externalId: deck.externalId,
            ...deckValues,
            cards,
            deckId: liveDeckId,
            checkedAt: deckInSync ? now : null,
          });
          result.newDecks++;
          continue;
        }

        keptDeckIds.add(existingDeck.id);
        const fieldsChanged = !sameFields(deckValues, deckFields(toDeckLike(existingDeck)));
        const sourceChanged =
          fieldsChanged || !Bun.deepEquals(sourceCards(cards), sourceCards(existingDeck.cards));
        const linkChanged = existingDeck.deckId !== liveDeckId;
        const cardsChanged = !Bun.deepEquals(sortedCards(cards), sortedCards(existingDeck.cards));
        const checkedAt = nextCheckedAt({
          previous: existingDeck.checkedAt,
          changed: sourceChanged || linkChanged,
          inSync: deckInSync,
          now,
        });

        if (sourceChanged || linkChanged || cardsChanged || checkedAt !== undefined) {
          await repo.updateDeck(existingDeck.id, {
            ...deckValues,
            ...(cardsChanged ? { cards } : {}),
            deckId: liveDeckId,
            ...(checkedAt === undefined ? {} : { checkedAt }),
          });
        }

        if (sourceChanged || linkChanged) {
          result.updatedDecks++;
        } else {
          result.unchangedDecks++;
        }
      }

      // Per-event replace: a deck the upload no longer lists is gone from that
      // event. This also removes a deck that failed validation this time round,
      // which is the point — the payload is the event's current truth.
      const removed = existingDeckRows.filter((row) => !keptDeckIds.has(row.id));
      if (removed.length > 0) {
        await repo.deleteDecks(removed.map((row) => row.id));
        result.removedDecks += removed.length;
        for (const row of removed) {
          result.removedDeckDetails.push({
            eventExternalId: event.externalId,
            externalId: row.externalId,
            playerName: row.playerName,
          });
        }
      }
    }
  });

  return result;
}

/** The stored candidate event in the shape {@link eventFields} reads. */
function toEventLike(row: CandidateMetaEventRow): MetaIngestEvent {
  return {
    externalId: row.externalId,
    name: row.name,
    eventDate: row.eventDate,
    format: row.format,
    playerCount: row.playerCount,
    organizer: row.organizer,
    sourceUrl: row.sourceUrl,
    notes: row.notes,
    extraData: row.extraData ?? null,
    decks: [],
  };
}

/** The stored candidate deck in the shape {@link deckFields} reads. */
function toDeckLike(row: CandidateMetaDeckRow): MetaIngestEventDeck {
  return {
    externalId: row.externalId,
    playerName: row.playerName,
    finishTier: row.finishTier,
    record: row.record,
    name: row.name,
    listStatus: row.listStatus,
    cards: [],
  };
}

/**
 * Whether accepting this candidate deck would change the live deck it links to,
 * in its placement, its metadata, or its card list.
 *
 * The live deck's own name is compared against the candidate's only when the
 * candidate carries one: a source that ships no deck name did not propose
 * renaming the archived deck to null.
 *
 * The event comparison is what stops a re-parented deck settling itself: the
 * candidate's parent points at one live event, the deck it links to still sits
 * under another, and accepting would move it.
 */
function hasAnyDeckChange(
  liveDeck: LiveMetaDeckRow,
  liveCards: readonly MetaDeckCardEntry[],
  deck: MetaIngestEventDeck,
  cards: readonly CandidateMetaDeckCard[],
  candidateEventId: string | null,
): boolean {
  return hasDeckDiff(
    diffMetaDeck(
      {
        event: liveDeck.metaEventId,
        name: liveDeck.name,
        playerName: liveDeck.playerName,
        finishTier: liveDeck.finishTier,
        record: liveDeck.record,
        listStatus: liveDeck.listStatus,
        cards: liveCards,
      },
      {
        event: candidateEventId,
        name: deck.name ?? liveDeck.name,
        playerName: deck.playerName,
        finishTier: deck.finishTier,
        record: deck.record,
        listStatus: deck.listStatus,
        cards: resolvedCardEntries(cards),
      },
    ),
  );
}
