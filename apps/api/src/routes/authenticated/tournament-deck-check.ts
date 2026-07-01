import { ERROR_CODES, mapSectionToZone } from "@openrift/shared";
import type { DeckCheckEntryDetailResponse, DeckCheckEventDetailResponse } from "@openrift/shared";
import { tournamentDeckCheckContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import type { Repos } from "../../deps.js";
import { AppError } from "../../errors.js";
import {
  buildEntryDetail,
  toEntrySummary,
  toEventSummary,
} from "../../lib/deck-check-presenters.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { cardResolutionKey } from "../../repositories/deck-check.js";
import type { DeckCheckEntry, DeckCheckEvent } from "../../repositories/deck-check.js";
import { computeZoneSuggestions } from "../../services/deck-check-advisories.js";
import {
  createManualDeckCheckEntry,
  recomputeEntryHash,
} from "../../services/deck-check-ingest.js";
import {
  applyJudgeTransition,
  settleExpiredEditable,
  submissionWindowOpen,
} from "../../services/deck-check-states.js";

// ─── Authorization ──────────────────────────────────────────────────────────

/**
 * Loads a deck-check tournament and authorizes a judge action (ADR-033): the
 * tournament host, or a `tournament_staff` organizer/judge, may act. 404s when
 * the tournament is missing or does not have deck check enabled.
 * @param repos The repository bundle.
 * @param tournamentId The tournament whose deck check is acted on.
 * @param userId The acting user.
 * @returns The deck-check event view of the tournament.
 */
async function authorizeJudge(
  repos: Repos,
  tournamentId: string,
  userId: string,
): Promise<DeckCheckEvent> {
  const event = await repos.deckCheck.getEventById(tournamentId);
  if (!event) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Tournament not found");
  }
  const allowed = await repos.tournaments.isHostOrStaff(tournamentId, userId, [
    "organizer",
    "judge",
  ]);
  if (!allowed) {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "Judges only");
  }
  return event;
}

/**
 * Loads one of the event's entries, settling the deadline auto-submit so the
 * judge never sees a stale `editable` entry once the window closed.
 * @param repos The repository bundle.
 * @param event The deck-check event the entry belongs to.
 * @param entryId The entry to load.
 * @returns The (possibly settled) entry.
 */
async function loadEntry(
  repos: Repos,
  event: DeckCheckEvent,
  entryId: string,
): Promise<DeckCheckEntry> {
  const entry = await repos.deckCheck.getEntry(event.id, entryId);
  if (!entry) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Entry not found");
  }
  return await settleExpiredEditable(repos, event, entry);
}

/**
 * Guards every card-level judge action: an editable list has not been delivered
 * to an official (TR 401.3, ADR-027), so judges can neither read nor touch its
 * lines until the player submits.
 * @param entry The entry being acted on.
 * @returns Nothing; throws 409 for an editable entry.
 */
function requireListVisible(entry: DeckCheckEntry): void {
  if (entry.state === "editable") {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      "The player is editing this list. It becomes visible once submitted.",
    );
  }
}

const os = implement(tournamentDeckCheckContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * The tournament-scoped judge-facing deck-check router (ADR-033), mounted under
 * `/api/v1/tournaments/{tournamentId}/deck-check`. It reuses the same services,
 * repo methods, and response mappers as the group-scoped surface; only the
 * resolve-and-authorize step differs (by tournament host/staff rather than
 * friend-group membership). Thrown `AppError`s map to ORPCErrors at the handler
 * boundary.
 */
export const tournamentDeckCheckRouter = {
  listEntries: os.listEntries.handler(
    async ({ input, context }): Promise<DeckCheckEventDetailResponse> => {
      const repos = context.repos;
      const event = await authorizeJudge(repos, input.tournamentId, context.userId);
      let entries = await repos.deckCheck.listEntriesForEvent(event.id);
      // Settle the deadline auto-submit (ADR-027): entries still editable once
      // the window closed become submissions as-is, stamped with the close time.
      if (!submissionWindowOpen(event) && entries.some((entry) => entry.state === "editable")) {
        for (const entry of entries) {
          await settleExpiredEditable(repos, event, entry);
        }
        entries = await repos.deckCheck.listEntriesForEvent(event.id);
      }
      const active = entries.filter((entry) => entry.state !== "withdrawn");
      const summary = toEventSummary({
        ...event,
        entryCount: active.length,
        approvedCount: active.filter((entry) => entry.state === "approved").length,
        checkedCount: active.filter((entry) => entry.state === "checked").length,
      });
      return { event: summary, entries: entries.map((entry) => toEntrySummary(entry)) };
    },
  ),

  createEntry: os.createEntry.handler(
    async ({ input, context }): Promise<DeckCheckEntryDetailResponse> => {
      const repos = context.repos;
      const event = await authorizeJudge(repos, input.tournamentId, context.userId);
      if (event.status === "archived") {
        throw new AppError(
          409,
          ERROR_CODES.CONFLICT,
          "Event is archived. Un-archive it before adding decks.",
        );
      }
      const participant = await repos.tournaments.findParticipantById(input.participantId);
      if (!participant || participant.tournamentId !== event.id) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, "Participant not found");
      }
      if (await repos.deckCheck.participantHasDeck(participant.id)) {
        throw new AppError(409, ERROR_CODES.CONFLICT, "This participant already has a deck");
      }
      const created = await createManualDeckCheckEntry(repos, event.id, {
        participantId: participant.id,
        cards: input.cards,
      });
      return buildEntryDetail(repos, event, created);
    },
  ),

  getEntry: os.getEntry.handler(
    async ({ input, context }): Promise<DeckCheckEntryDetailResponse> => {
      const repos = context.repos;
      const event = await authorizeJudge(repos, input.tournamentId, context.userId);
      const entry = await loadEntry(repos, event, input.entryId);
      return buildEntryDetail(repos, event, entry);
    },
  ),

  setEntryState: os.setEntryState.handler(
    async ({ input, context }): Promise<DeckCheckEntryDetailResponse> => {
      const repos = context.repos;
      const event = await authorizeJudge(repos, input.tournamentId, context.userId);
      const entry = await loadEntry(repos, event, input.entryId);

      const updated = await context.transact((txRepos) =>
        applyJudgeTransition(txRepos, context.userId, entry, {
          state: input.state,
          reviewOutcome: input.reviewOutcome,
          notes: input.notes,
          playerMessage: input.playerMessage,
        }),
      );
      return buildEntryDetail(repos, event, updated);
    },
  ),

  denyUnlockRequest: os.denyUnlockRequest.handler(
    async ({ input, context }): Promise<DeckCheckEntryDetailResponse> => {
      const repos = context.repos;
      const event = await authorizeJudge(repos, input.tournamentId, context.userId);
      const entry = await loadEntry(repos, event, input.entryId);

      const updated = entry.unlockRequestedAt
        ? await repos.deckCheck.updateEntry(entry.id, { unlockRequestedAt: null })
        : entry;
      return buildEntryDetail(repos, event, updated ?? entry);
    },
  ),

  updateEntry: os.updateEntry.handler(
    async ({ input, context }): Promise<DeckCheckEntryDetailResponse> => {
      const repos = context.repos;
      const event = await authorizeJudge(repos, input.tournamentId, context.userId);
      await loadEntry(repos, event, input.entryId);

      // Identity (playerName/riotId) lives on the participant while the rest stays
      // on the entry, so updateEntry issues two writes — wrap them in one
      // transaction so a partial failure can't patch one without the other.
      const updated = await context.transact((txRepos) =>
        txRepos.deckCheck.updateEntry(input.entryId, {
          ...(input.playerName === undefined ? {} : { playerName: input.playerName }),
          ...(input.riotId === undefined ? {} : { riotId: input.riotId }),
          ...(input.playerMessage === undefined ? {} : { playerMessage: input.playerMessage }),
          ...(input.allowDeckPublishing === undefined
            ? {}
            : { allowDeckPublishing: input.allowDeckPublishing }),
        }),
      );
      if (!updated) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, "Entry not found");
      }
      return buildEntryDetail(repos, event, updated);
    },
  ),

  deleteEntry: os.deleteEntry.handler(async ({ input, context }): Promise<void> => {
    const repos = context.repos;
    const event = await authorizeJudge(repos, input.tournamentId, context.userId);
    const deleted = await repos.deckCheck.deleteEntry(event.id, input.entryId);
    if (!deleted) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Entry not found");
    }
  }),

  addCard: os.addCard.handler(async ({ input, context }): Promise<DeckCheckEntryDetailResponse> => {
    const repos = context.repos;
    const event = await authorizeJudge(repos, input.tournamentId, context.userId);
    const entry = await loadEntry(repos, event, input.entryId);
    requireListVisible(entry);

    const zone = mapSectionToZone(input.section);
    if (!zone) {
      throw new AppError(
        422,
        ERROR_CODES.VALIDATION_ERROR,
        `Unknown deck section: ${input.section}`,
      );
    }
    const existing = await repos.deckCheck.listCardsForEntry(entry.id);
    const resolutions = await repos.deckCheck.resolveCards([{ name: input.name }]);
    const resolution = resolutions.get(cardResolutionKey(input.name)) ?? {
      resolvedCardId: null,
      resolvedPrintingId: null,
      matchStatus: "unmatched" as const,
    };
    await repos.deckCheck.addEntryCard(entry.id, {
      sortOrder: (existing.at(-1)?.sortOrder ?? -1) + 1,
      rawName: input.name,
      section: input.section,
      zone,
      quantity: input.quantity,
      ...resolution,
    });
    await recomputeEntryHash(repos, entry.id);
    const reloaded = await loadEntry(repos, event, input.entryId);
    return buildEntryDetail(repos, event, reloaded);
  }),

  renameCard: os.renameCard.handler(
    async ({ input, context }): Promise<DeckCheckEntryDetailResponse> => {
      const repos = context.repos;
      const event = await authorizeJudge(repos, input.tournamentId, context.userId);
      const entry = await loadEntry(repos, event, input.entryId);
      requireListVisible(entry);

      const { name, section, copies } = input;
      const resolutions = await repos.deckCheck.resolveCards([{ name }]);
      const resolution = resolutions.get(cardResolutionKey(name)) ?? {
        resolvedCardId: null,
        resolvedPrintingId: null,
        matchStatus: "unmatched" as const,
      };

      let updated: boolean;
      if (section === undefined) {
        updated = await repos.deckCheck.updateCardName(entry.id, input.cardId, name, resolution);
      } else {
        const zone = mapSectionToZone(section);
        if (!zone) {
          throw new AppError(422, ERROR_CODES.VALIDATION_ERROR, `Unknown deck section: ${section}`);
        }
        updated = await repos.deckCheck.moveCardCopies(entry.id, input.cardId, {
          name,
          resolution,
          section,
          zone,
          copies,
        });
      }
      if (!updated) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, "Card not found");
      }
      await recomputeEntryHash(repos, entry.id);
      const reloaded = await loadEntry(repos, event, input.entryId);
      return buildEntryDetail(repos, event, reloaded);
    },
  ),

  applyZoneFixes: os.applyZoneFixes.handler(
    async ({ input, context }): Promise<DeckCheckEntryDetailResponse> => {
      const repos = context.repos;
      const event = await authorizeJudge(repos, input.tournamentId, context.userId);
      const entry = await loadEntry(repos, event, input.entryId);
      requireListVisible(entry);

      // Re-derive the suggestions server-side: the client only names which cards
      // to move, never the destination, so a stale or forged id can't push a card
      // into an arbitrary zone — only a currently-suggested move is applied.
      const cards = await repos.deckCheck.listCardsForEntry(entry.id);
      const matchedIds = [
        ...new Set(
          cards.flatMap((card) =>
            card.matchStatus === "matched" && card.resolvedCardId ? [card.resolvedCardId] : [],
          ),
        ),
      ];
      const details = await repos.deckCheck.getCardDetails(matchedIds);
      const suggestionById = new Map(
        computeZoneSuggestions(cards, details).map((suggestion) => [suggestion.cardId, suggestion]),
      );

      let applied = 0;
      for (const cardId of new Set(input.cardIds)) {
        const suggestion = suggestionById.get(cardId);
        if (!suggestion) {
          continue;
        }
        await repos.deckCheck.updateCardZone(
          entry.id,
          cardId,
          suggestion.suggestedZone,
          suggestion.suggestedZone,
        );
        applied += 1;
      }
      if (applied > 0) {
        await recomputeEntryHash(repos, entry.id);
      }
      const reloaded = await loadEntry(repos, event, input.entryId);
      return buildEntryDetail(repos, event, reloaded);
    },
  ),

  removeCardCopy: os.removeCardCopy.handler(async ({ input, context }): Promise<void> => {
    const repos = context.repos;
    const event = await authorizeJudge(repos, input.tournamentId, context.userId);
    requireListVisible(await loadEntry(repos, event, input.entryId));

    const removed = await repos.deckCheck.deleteEntryCardCopy(
      input.entryId,
      input.cardId,
      input.copyIndex,
    );
    if (!removed) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Card not found");
    }
    await recomputeEntryHash(repos, input.entryId);
  }),

  tickCard: os.tickCard.handler(async ({ input, context }): Promise<void> => {
    const repos = context.repos;
    const event = await authorizeJudge(repos, input.tournamentId, context.userId);
    requireListVisible(await loadEntry(repos, event, input.entryId));

    const stored = await repos.deckCheck.setCardCopyFound(
      input.entryId,
      input.cardId,
      input.copyIndex,
      input.found,
    );
    if (!stored) {
      // The card row was replaced by a re-import while the judge had the entry
      // open; the client refetches instead of erroring opaquely.
      throw new AppError(409, ERROR_CODES.CONFLICT, "Card list changed. Reload the entry.");
    }
  }),

  unlinkEntry: os.unlinkEntry.handler(
    async ({ input, context }): Promise<DeckCheckEntryDetailResponse> => {
      const repos = context.repos;
      const event = await authorizeJudge(repos, input.tournamentId, context.userId);
      await loadEntry(repos, event, input.entryId);

      const updated = await repos.deckCheck.unlinkEntry(input.entryId);
      if (!updated) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, "Entry not found");
      }
      return buildEntryDetail(repos, event, updated);
    },
  ),

  reResolve: os.reResolve.handler(async ({ input, context }): Promise<{ updatedLines: number }> => {
    const repos = context.repos;
    const event = await authorizeJudge(repos, input.tournamentId, context.userId);

    const unresolved = await repos.deckCheck.listUnresolvedCardsForEvent(event.id);
    const resolutions = await repos.deckCheck.resolveCards(
      unresolved.map((card) => ({ name: card.rawName })),
    );
    let updatedLines = 0;
    for (const card of unresolved) {
      const resolution = resolutions.get(cardResolutionKey(card.rawName));
      if (!resolution || resolution.matchStatus === card.matchStatus) {
        continue;
      }
      await repos.deckCheck.updateCardResolution(card.id, resolution);
      updatedLines += 1;
    }
    return { updatedLines };
  }),
};
