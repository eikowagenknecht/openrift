import { ERROR_CODES } from "@openrift/shared";
import type { MetaCandidateDeck } from "@openrift/shared";
import { adminMetaCandidatesContract } from "@openrift/shared/contracts/admin/meta";
import { normalizeNameForMatching } from "@openrift/shared/utils";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import type { MetaDeckDiff } from "../../lib/meta-candidate-diff.js";
import { collapseCardEntries, diffMetaDeck, diffMetaEvent } from "../../lib/meta-candidate-diff.js";
import {
  toMetaCandidateDeck,
  toMetaCandidateDetail,
  toMetaCandidateQueueRow,
  unresolvedCardNames,
} from "../../lib/meta-candidate-presenters.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import type { CandidateMetaDeckRow } from "../../repositories/meta-candidates.js";
import { recordAdminEvent } from "../../services/record-admin-event.js";

const os = implement(adminMetaCandidatesContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * The candidate's resolved cards as diff entries. Unresolved rows are dropped,
 * and rows that landed on the same card and zone are summed — the accept path
 * folds them the same way before writing `deck_cards`, so without the collapse
 * an accepted deck would keep reading as changed against the row it just wrote.
 * @returns One entry per resolved card and zone.
 */
function resolvedEntries(deck: CandidateMetaDeckRow) {
  return collapseCardEntries(
    deck.cards
      .filter((card) => card.cardId !== null)
      .map((card) => ({ cardId: card.cardId as string, zone: card.zone, quantity: card.quantity })),
  );
}

/**
 * Turns a repository's "did the row exist" boolean into the contract's 404.
 * @returns void — throws AppError(404) when the row was absent.
 */
function assertExisted(existed: boolean, message: string): void {
  if (!existed) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, message);
  }
}

/**
 * The meta archive's candidate ingest and review queue (ADR-014), on the same
 * `/api/admin/v1/meta` prefix the Hono `requireAdmin` middleware gates. The
 * upload endpoint needs no extra auth work: an `x-api-key` from the maintainer's
 * tooling resolves to an admin session through better-auth, so the prefix check
 * already covers script callers.
 *
 * The queue and the detail view both compute their diffs here rather than
 * storing them: `checked_at` records that a human looked at a row, not that the
 * row matched live, and conflating the two would hide a live edit made after
 * the review.
 *
 * Admin events follow the neighbouring `meta.ts` router, which records none for
 * its CRUD — except the upload, which mirrors the card pipeline's
 * `candidates.upload` because it is the one action a non-interactive caller
 * performs.
 */
export const adminMetaCandidatesRouter = {
  upload: os.upload.handler(async ({ input, context }) => {
    const provider = input.provider.trim();
    const result = await context.services.ingestMetaCandidates(
      context.transact,
      provider,
      input.events,
    );

    // Counts only — the detail arrays are unbounded.
    await recordAdminEvent(context.repos, context.userId, {
      action: "meta-candidates.upload",
      entityType: "upload",
      entityId: provider,
      entityLabel: provider,
      newValues: {
        newEvents: result.newEvents,
        updatedEvents: result.updatedEvents,
        unchangedEvents: result.unchangedEvents,
        newDecks: result.newDecks,
        updatedDecks: result.updatedDecks,
        removedDecks: result.removedDecks,
        unchangedDecks: result.unchangedDecks,
        ignoredSkipped: result.ignoredSkipped,
        errors: result.errors.length,
      },
    });

    return result;
  }),

  list: os.list.handler(async ({ context }) => {
    const { metaCandidates } = context.repos;

    const [events, decks] = await Promise.all([
      metaCandidates.listEvents(),
      metaCandidates.allDecks(),
    ]);

    const linkedIds = events
      .map((event) => event.metaEventId)
      .filter((id): id is string => id !== null);
    const liveEvents = await metaCandidates.liveEventsByIds(linkedIds);
    const liveById = new Map(liveEvents.map((row) => [row.id, row]));
    const decksByEvent = Map.groupBy(decks, (deck) => deck.candidateEventId);

    return {
      candidates: events.map((event) => {
        const own = decksByEvent.get(event.id) ?? [];
        const live = event.metaEventId === null ? undefined : liveById.get(event.metaEventId);
        return toMetaCandidateQueueRow(event, {
          deckCount: own.length,
          unacceptedDeckCount: own.filter((deck) => deck.deckId === null).length,
          unresolvedCardCount: own.reduce(
            (total, deck) => total + unresolvedCardNames(deck).length,
            0,
          ),
          hasDiff: live !== undefined && diffMetaEvent(live, event).length > 0,
          metaEventSlug: live?.slug ?? null,
        });
      }),
    };
  }),

  detail: os.detail.handler(async ({ input, context }) => {
    const { metaCandidates, deckFormats } = context.repos;

    const event = await metaCandidates.eventById(input.id);
    if (event === undefined) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Candidate event not found");
    }

    const decks = await metaCandidates.decksByCandidateEventIds([event.id]);
    const liveDeckIds = decks.map((deck) => deck.deckId).filter((id): id is string => id !== null);

    const [liveDecks, liveDeckCards, format] = await Promise.all([
      metaCandidates.liveDecksByIds(liveDeckIds),
      metaCandidates.liveDeckCards(liveDeckIds),
      deckFormats.getBySlug(event.format),
    ]);

    // The candidate's own live event plus whichever events its linked decks
    // currently sit under. Those usually coincide; when they don't, the deck
    // was re-parented and accepting it would move it, which the diff has to say.
    const eventIds = new Set(liveDecks.map((row) => row.metaEventId));
    if (event.metaEventId !== null) {
      eventIds.add(event.metaEventId);
    }
    const liveEvents = await metaCandidates.liveEventsByIds([...eventIds]);
    const liveEventNames = new Map(liveEvents.map((row) => [row.id, row.name]));

    const live = liveEvents.find((row) => row.id === event.metaEventId);
    const liveDeckById = new Map(liveDecks.map((row) => [row.deckId, row]));
    const liveCardsByDeck = Map.groupBy(liveDeckCards, (row) => row.deckId);

    // One lookup for every card the response names: the candidates' own rows and
    // whatever only the live side still holds (a removed card).
    const cardIds = new Set<string>();
    for (const deck of decks) {
      for (const card of deck.cards) {
        if (card.cardId !== null) {
          cardIds.add(card.cardId);
        }
      }
    }
    for (const row of liveDeckCards) {
      cardIds.add(row.cardId);
    }
    const cardNames = await metaCandidates.cardNamesByIds([...cardIds]);

    const deckResponses: MetaCandidateDeck[] = decks.map((deck) => {
      const liveDeck = deck.deckId === null ? undefined : liveDeckById.get(deck.deckId);
      let diff: MetaDeckDiff | null = null;
      if (liveDeck !== undefined) {
        diff = diffMetaDeck(
          {
            event: liveDeck.metaEventId,
            name: liveDeck.name,
            playerName: liveDeck.playerName,
            finishTier: liveDeck.finishTier,
            record: liveDeck.record,
            listStatus: liveDeck.listStatus,
            cards: liveCardsByDeck.get(liveDeck.deckId) ?? [],
          },
          {
            // Accepting re-parents the live deck onto the candidate's own
            // event, so a mismatch here is a move the reviewer has to see.
            event: event.metaEventId,
            // A source that ships no deck name is not proposing to blank the
            // archived deck's name, so the live one stands in for the compare.
            name: deck.name ?? liveDeck.name,
            playerName: deck.playerName,
            finishTier: deck.finishTier,
            record: deck.record,
            // Accepting an archetype the source has since published with a
            // main deck is what gives it a page, so the status belongs in the
            // diff — as does the quieter partial-to-full move.
            listStatus: deck.listStatus,
            cards: resolvedEntries(deck),
          },
        );
      }
      return toMetaCandidateDeck(deck, {
        diff,
        shareToken: liveDeck?.shareToken ?? null,
        cardNames,
        eventNames: liveEventNames,
      });
    });

    return toMetaCandidateDetail(event, {
      diff: live === undefined ? null : diffMetaEvent(live, event),
      formatKnown: format !== undefined,
      metaEventSlug: live?.slug ?? null,
      decks: deckResponses,
    });
  }),

  rematch: os.rematch.handler(({ context }) =>
    context.services.rematchMetaCandidates(context.repos),
  ),

  // The alias-fix flow in one call: record "this source name means that card"
  // in card_name_aliases (shared with the card pipeline, so the fix applies to
  // every future upload from any source), then rematch so the unblocked decks
  // update immediately.
  resolveName: os.resolveName.handler(async ({ input, context }) => {
    const { catalog, catalogMutations } = context.repos;

    // The matcher keys on the normalized form, so a name made only of
    // punctuation or spacing would store an alias no upload can ever hit.
    const normName = normalizeNameForMatching(input.name);
    if (normName === "") {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        "That name normalizes to nothing matchable. Use the name as the source spells it.",
      );
    }

    const [card] = await catalog.cardsByIds([input.cardId]);
    if (card === undefined) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Card not found");
    }

    await catalogMutations.createNameAliases(normName, input.cardId);
    return context.services.rematchMetaCandidates(context.repos);
  }),

  acceptEvent: os.acceptEvent.handler(({ input, context }) =>
    context.services.acceptCandidateEvent(context.repos, input.id),
  ),

  acceptEventWithDecks: os.acceptEventWithDecks.handler(({ input, context }) =>
    context.services.acceptCandidateEventWithDecks(context.repos, input.id),
  ),

  acceptDeck: os.acceptDeck.handler(({ input, context }) =>
    context.services.acceptCandidateDeck(context.repos, input.id),
  ),

  checkEvent: os.checkEvent.handler(async ({ input, context }): Promise<void> => {
    const existed = await context.repos.metaCandidates.setEventCheckedAt(
      input.id,
      input.checked ? new Date() : null,
    );
    assertExisted(existed, "Candidate event not found");
  }),

  checkDeck: os.checkDeck.handler(async ({ input, context }): Promise<void> => {
    const existed = await context.repos.metaCandidates.setDeckCheckedAt(
      input.id,
      input.checked ? new Date() : null,
    );
    assertExisted(existed, "Candidate deck not found");
  }),

  ignoreEvent: os.ignoreEvent.handler(async ({ input, context }): Promise<void> => {
    const { metaCandidates } = context.repos;
    const event = await metaCandidates.eventById(input.id);
    if (event === undefined) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Candidate event not found");
    }
    // Writes the ignore key and drops the staged row, so the queue loses it now
    // and every later upload skips it. Its decks go with it via the cascade —
    // but each keeps only the parent link, so a deck ignored on its own needs
    // its own key.
    await metaCandidates.ignoreEvent(event.provider, event.externalId);
  }),

  ignoreDeck: os.ignoreDeck.handler(async ({ input, context }): Promise<void> => {
    const { metaCandidates } = context.repos;
    const deck = await metaCandidates.deckById(input.id);
    if (deck === undefined) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Candidate deck not found");
    }
    const parent = await metaCandidates.eventById(deck.candidateEventId);
    if (parent === undefined) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Candidate event not found");
    }
    // The key names the source's event, not the candidate row it hangs off:
    // deck ids restart per event, so ignoring "1" here must not also silence
    // and delete deck "1" of every other event this provider pushes.
    await metaCandidates.ignoreDeck(
      parent.provider,
      { eventExternalId: parent.externalId, externalId: deck.externalId },
      deck.id,
    );
  }),

  listIgnored: os.listIgnored.handler(async ({ context }) => {
    const { events, decks } = await context.repos.metaCandidates.listIgnored();
    const toRow = (row: { provider: string; externalId: string; createdAt: Date }) => ({
      provider: row.provider,
      externalId: row.externalId,
      createdAt: row.createdAt.toISOString(),
    });
    return {
      events: events.map((row) => toRow(row)),
      decks: decks.map((row) => ({ ...toRow(row), eventExternalId: row.eventExternalId })),
    };
  }),

  unignoreEvent: os.unignoreEvent.handler(async ({ input, context }): Promise<void> => {
    const removed = await context.repos.metaCandidates.unignoreEvent(
      input.provider,
      input.externalId,
    );
    assertExisted(removed, "Ignore entry not found");
  }),

  unignoreDeck: os.unignoreDeck.handler(async ({ input, context }): Promise<void> => {
    const removed = await context.repos.metaCandidates.unignoreDeck(input.provider, {
      eventExternalId: input.eventExternalId,
      externalId: input.externalId,
    });
    assertExisted(removed, "Ignore entry not found");
  }),
};
