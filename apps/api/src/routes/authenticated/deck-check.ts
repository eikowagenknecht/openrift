// oxlint-disable-next-line import/no-nodejs-modules -- server-side key minting, never reaches the browser
import { createHash, randomBytes } from "node:crypto";

import { deckCheckEntrySource, ERROR_CODES, mapSectionToZone } from "@openrift/shared";
import type {
  DeckCheckAccountSearchResponse,
  DeckCheckEntryDetailResponse,
  DeckCheckEntryResponse,
  DeckCheckEntrySummaryResponse,
  DeckCheckEventDetailResponse,
  DeckCheckEventListResponse,
  DeckCheckEventSummaryResponse,
  DeckCheckKeyMintedResponse,
  DeckCheckKeyResponse,
  DeckCheckKeysResponse,
} from "@openrift/shared";
import { deckCheckContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import type { Repos } from "../../deps.js";
import { AppError } from "../../errors.js";
import { loadGroupForMember, requireRole } from "../../lib/group-access.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { cardResolutionKey } from "../../repositories/deck-check.js";
import type {
  DeckCheckEntry,
  DeckCheckEntrySummary,
  DeckCheckEvent,
  DeckCheckEventWithCounts,
  DeckCheckKey,
} from "../../repositories/deck-check.js";
import {
  buildEntryAdvisories,
  computeZoneSuggestions,
  toDeckCheckEntryCardResponse,
} from "../../services/deck-check-advisories.js";
import {
  createManualDeckCheckEntry,
  recomputeEntryHash,
} from "../../services/deck-check-ingest.js";
import {
  applyJudgeTransition,
  settleExpiredEditable,
  submissionWindowOpen,
} from "../../services/deck-check-states.js";
import { generateShareToken } from "../../utils/share-token.js";

// ─── Mappers ────────────────────────────────────────────────────────────────

function isoDate(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
}

function toEventSummary(
  row: DeckCheckEvent & Partial<Pick<DeckCheckEventWithCounts, "entryCount" | "checkedCount">>,
): DeckCheckEventSummaryResponse {
  return {
    id: row.id,
    name: row.name,
    eventDate: isoDate(row.eventDate),
    format: row.format,
    allowedSets: row.allowedSets,
    status: row.status,
    entryCount: row.entryCount ?? 0,
    checkedCount: row.checkedCount ?? 0,
    listLockMode: row.listLockMode,
    allowSelfSubmission: row.allowSelfSubmission,
    submissionToken: row.allowSelfSubmission ? row.submissionToken : null,
    submissionsCloseAt: row.submissionsCloseAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toEntrySummary(row: DeckCheckEntrySummary): DeckCheckEntrySummaryResponse {
  // An editable list is not yet delivered to an official (TR 401.3, ADR-027);
  // even its copy and progress counts stay hidden from the judge view.
  const listVisible = row.state !== "editable";
  return {
    id: row.id,
    externalId: row.externalId,
    source: deckCheckEntrySource(row.externalId),
    playerName: row.playerName,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    state: row.state,
    reviewOutcome: row.reviewOutcome,
    checkedByName: row.checkedByName,
    checkedAt: row.checkedAt?.toISOString() ?? null,
    approvedByName: row.approvedByName,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    changedSinceReview: row.changeSummary !== null,
    unlockRequestedAt: row.unlockRequestedAt?.toISOString() ?? null,
    claimedUserName: row.claimedUserName,
    copyCount: listVisible ? row.copyCount : 0,
    verifiedCopyCount: listVisible ? row.verifiedCopyCount : 0,
    unmatchedLineCount: listVisible ? row.unmatchedLineCount : 0,
  };
}

function toEntry(
  row: DeckCheckEntry,
  checkedByName: string | null,
  approvedByName: string | null,
  claimedUserName: string | null,
): DeckCheckEntryResponse {
  return {
    id: row.id,
    externalId: row.externalId,
    source: deckCheckEntrySource(row.externalId),
    playerName: row.playerName,
    playerEmail: row.playerEmail,
    riotId: row.riotId,
    allowDeckPublishing: row.allowDeckPublishing,
    allowNameSharing: row.allowNameSharing,
    allowRiotIdSharing: row.allowRiotIdSharing,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    state: row.state,
    reviewOutcome: row.reviewOutcome,
    checkedBy: row.checkedBy,
    checkedByName,
    checkedAt: row.checkedAt?.toISOString() ?? null,
    approvedByName,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    unlockRequestedAt: row.unlockRequestedAt?.toISOString() ?? null,
    notes: row.notes,
    changeSummary: row.changeSummary,
    withdrawnAt: row.withdrawnAt?.toISOString() ?? null,
    claimedUserId: row.claimedUserId,
    claimedUserName,
    claimSource: row.claimSource,
    claimBlocked: row.claimBlockedAt !== null,
    // Only expose the claim token while a link would still work: not yet linked
    // and not blocked by a judge unlink.
    claimToken: row.claimedUserId === null && row.claimBlockedAt === null ? row.claimToken : null,
    playerMessage: row.playerMessage,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toKey(row: DeckCheckKey & { createdByName?: string | null }): DeckCheckKeyResponse {
  return {
    id: row.id,
    tokenPrefix: row.tokenPrefix,
    label: row.label,
    createdByName: row.createdByName ?? null,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

// ─── Checker payload assembly ───────────────────────────────────────────────

/**
 * Builds the checker payload: entry, cards, advisory legality findings, and
 * the deck-stat aggregates, reusing the shared deck-rules and the same
 * counting the deck list uses (main+champion zones, legend/rune/battlefield
 * types excluded from type counts).
 * @returns The full entry-detail response.
 */
async function buildEntryDetail(
  repos: Repos,
  event: DeckCheckEvent,
  entry: DeckCheckEntry,
): Promise<DeckCheckEntryDetailResponse> {
  // An editable list has not been delivered to an official yet (TR 401.3,
  // ADR-027): the judge payload carries the entry's identity and state, but
  // no cards, advisories, or stats until the player submits.
  const listVisible = entry.state !== "editable";
  const [cards, checkedByName, approvedByName, claimedUserName] = await Promise.all([
    listVisible ? repos.deckCheck.listCardsForEntry(entry.id) : Promise.resolve([]),
    entry.checkedBy ? repos.deckCheck.getUserName(entry.checkedBy) : Promise.resolve(null),
    entry.approvedBy ? repos.deckCheck.getUserName(entry.approvedBy) : Promise.resolve(null),
    entry.claimedUserId ? repos.deckCheck.getUserName(entry.claimedUserId) : Promise.resolve(null),
  ]);
  const advisories = listVisible
    ? await buildEntryAdvisories(repos, event, cards)
    : { violations: [], typeCounts: [], domainDistribution: [], zoneSuggestions: [] };

  return {
    event: toEventSummary(event),
    entry: toEntry(entry, checkedByName, approvedByName, claimedUserName),
    cards: cards.map((card) => toDeckCheckEntryCardResponse(card)),
    ...advisories,
  };
}

async function loadEvent(repos: Repos, groupId: string, eventId: string): Promise<DeckCheckEvent> {
  const event = await repos.deckCheck.getEvent(groupId, eventId);
  if (!event) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Event not found");
  }
  return event;
}

async function loadEntry(
  repos: Repos,
  event: DeckCheckEvent,
  entryId: string,
): Promise<DeckCheckEntry> {
  const entry = await repos.deckCheck.getEntry(event.id, entryId);
  if (!entry) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Entry not found");
  }
  // Settle the deadline auto-submit (ADR-027) so the judge never sees a stale
  // 'editable' entry once the window closed.
  return await settleExpiredEditable(repos, event, entry);
}

/**
 * Guards every card-level judge action: an editable list has not been
 * delivered to an official (TR 401.3, ADR-027), so judges can neither read
 * nor touch its lines until the player submits.
 * @returns Nothing; throws 409 for an editable entry.
 */
function requireListVisible(entry: DeckCheckEntry): void {
  if (entry.state === "editable") {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      "The player is editing this list; it becomes visible once submitted",
    );
  }
}

const os = implement(deckCheckContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * The judge-facing deck-check contract (ADR-026/027), mounted under
 * `/api/v1/friend-groups/{slug}`. Every endpoint is role-gated; the access
 * checks / not-found / conflict states are thrown as `AppError` and mapped to
 * ORPCErrors by the handler's appErrorInterceptor.
 */
export const deckCheckRouter = {
  // ── EVENTS ──────────────────────────────────────────────────────────────
  listEvents: os.listEvents.handler(
    async ({ input, context }): Promise<DeckCheckEventListResponse> => {
      const repos = context.repos;
      const ctx = await loadGroupForMember(repos, input.slug, context.userId);
      requireRole(ctx.membership, "judge");
      const events = await repos.deckCheck.listEventsForGroup(ctx.group.id);
      return { items: events.map((event) => toEventSummary(event)) };
    },
  ),

  createEvent: os.createEvent.handler(
    async ({ input, context }): Promise<DeckCheckEventSummaryResponse> => {
      const repos = context.repos;
      const ctx = await loadGroupForMember(repos, input.slug, context.userId);
      requireRole(ctx.membership, "admin");
      const event = await repos.deckCheck.createEvent({
        groupId: ctx.group.id,
        name: input.name,
        eventDate: input.eventDate ?? null,
        format: input.format ?? null,
        allowedSets: input.allowedSets ?? null,
      });
      return toEventSummary(event);
    },
  ),

  getEventDetail: os.getEventDetail.handler(
    async ({ input, context }): Promise<DeckCheckEventDetailResponse> => {
      const repos = context.repos;
      const ctx = await loadGroupForMember(repos, input.slug, context.userId);
      requireRole(ctx.membership, "judge");
      const event = await loadEvent(repos, ctx.group.id, input.eventId);
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
        checkedCount: active.filter((entry) => entry.state === "checked").length,
      });
      return { event: summary, entries: entries.map((entry) => toEntrySummary(entry)) };
    },
  ),

  updateEvent: os.updateEvent.handler(
    async ({ input, context }): Promise<DeckCheckEventSummaryResponse> => {
      const repos = context.repos;
      const ctx = await loadGroupForMember(repos, input.slug, context.userId);
      requireRole(ctx.membership, "admin");
      // Only run the base update when a base field is present: a submission-only
      // patch (e.g. flipping the toggle) would otherwise produce an empty SET.
      const hasBaseField =
        input.name !== undefined ||
        input.eventDate !== undefined ||
        input.format !== undefined ||
        input.allowedSets !== undefined ||
        input.status !== undefined ||
        input.listLockMode !== undefined;
      let event = hasBaseField
        ? await repos.deckCheck.updateEvent(ctx.group.id, input.eventId, input)
        : await repos.deckCheck.getEvent(ctx.group.id, input.eventId);
      if (!event) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, "Event not found");
      }
      if (input.allowSelfSubmission !== undefined || input.submissionsCloseAt !== undefined) {
        event =
          (await repos.deckCheck.updateEventSubmission(event.id, {
            ...(input.allowSelfSubmission === undefined
              ? {}
              : {
                  allowSelfSubmission: input.allowSelfSubmission,
                  // Enabling for the first time mints the shared capability; the
                  // token survives a disable so re-enabling restores old links.
                  ...(input.allowSelfSubmission && !event.submissionToken
                    ? { submissionToken: generateShareToken() }
                    : {}),
                }),
            ...(input.submissionsCloseAt === undefined
              ? {}
              : {
                  submissionsCloseAt: input.submissionsCloseAt
                    ? new Date(input.submissionsCloseAt)
                    : null,
                }),
          })) ?? event;
      }
      return toEventSummary(event);
    },
  ),

  deleteEvent: os.deleteEvent.handler(async ({ input, context }): Promise<void> => {
    const repos = context.repos;
    const ctx = await loadGroupForMember(repos, input.slug, context.userId);
    requireRole(ctx.membership, "admin");
    const deleted = await repos.deckCheck.deleteEvent(ctx.group.id, input.eventId);
    if (!deleted) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Event not found");
    }
  }),

  reResolveEvent: os.reResolveEvent.handler(
    async ({ input, context }): Promise<{ updatedLines: number }> => {
      const repos = context.repos;
      const ctx = await loadGroupForMember(repos, input.slug, context.userId);
      requireRole(ctx.membership, "judge");
      const event = await loadEvent(repos, ctx.group.id, input.eventId);

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
    },
  ),

  // ── ENTRIES ─────────────────────────────────────────────────────────────
  createManualEntry: os.createManualEntry.handler(
    async ({ input, context }): Promise<DeckCheckEntryDetailResponse> => {
      const repos = context.repos;
      const ctx = await loadGroupForMember(repos, input.slug, context.userId);
      requireRole(ctx.membership, "judge");
      const event = await loadEvent(repos, ctx.group.id, input.eventId);
      if (event.status === "archived") {
        throw new AppError(
          409,
          ERROR_CODES.CONFLICT,
          "Event is archived; un-archive it before adding entrants",
        );
      }
      const created = await createManualDeckCheckEntry(repos, event.id, {
        playerName: input.playerName,
        playerEmail: input.playerEmail,
        riotId: input.riotId,
        cards: input.cards,
      });
      return buildEntryDetail(repos, event, created);
    },
  ),

  getEntryDetail: os.getEntryDetail.handler(
    async ({ input, context }): Promise<DeckCheckEntryDetailResponse> => {
      const repos = context.repos;
      const ctx = await loadGroupForMember(repos, input.slug, context.userId);
      requireRole(ctx.membership, "judge");
      const event = await loadEvent(repos, ctx.group.id, input.eventId);
      const entry = await loadEntry(repos, event, input.entryId);
      return buildEntryDetail(repos, event, entry);
    },
  ),

  setEntryState: os.setEntryState.handler(
    async ({ input, context }): Promise<DeckCheckEntryDetailResponse> => {
      const repos = context.repos;
      const ctx = await loadGroupForMember(repos, input.slug, context.userId);
      requireRole(ctx.membership, "judge");
      const event = await loadEvent(repos, ctx.group.id, input.eventId);
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
      const ctx = await loadGroupForMember(repos, input.slug, context.userId);
      requireRole(ctx.membership, "judge");
      const event = await loadEvent(repos, ctx.group.id, input.eventId);
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
      const ctx = await loadGroupForMember(repos, input.slug, context.userId);
      requireRole(ctx.membership, "judge");
      const event = await loadEvent(repos, ctx.group.id, input.eventId);
      await loadEntry(repos, event, input.entryId);

      const updated = await repos.deckCheck.updateEntry(input.entryId, {
        ...(input.playerName === undefined ? {} : { playerName: input.playerName }),
        ...(input.playerEmail === undefined ? {} : { playerEmail: input.playerEmail }),
        ...(input.riotId === undefined ? {} : { riotId: input.riotId }),
        ...(input.playerMessage === undefined ? {} : { playerMessage: input.playerMessage }),
        ...(input.allowDeckPublishing === undefined
          ? {}
          : { allowDeckPublishing: input.allowDeckPublishing }),
        ...(input.allowNameSharing === undefined
          ? {}
          : { allowNameSharing: input.allowNameSharing }),
        ...(input.allowRiotIdSharing === undefined
          ? {}
          : { allowRiotIdSharing: input.allowRiotIdSharing }),
      });
      if (!updated) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, "Entry not found");
      }
      return buildEntryDetail(repos, event, updated);
    },
  ),

  deleteEntry: os.deleteEntry.handler(async ({ input, context }): Promise<void> => {
    const repos = context.repos;
    const ctx = await loadGroupForMember(repos, input.slug, context.userId);
    requireRole(ctx.membership, "admin");
    const event = await loadEvent(repos, ctx.group.id, input.eventId);

    const deleted = await repos.deckCheck.deleteEntry(event.id, input.entryId);
    if (!deleted) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Entry not found");
    }
  }),

  addCard: os.addCard.handler(async ({ input, context }): Promise<DeckCheckEntryDetailResponse> => {
    const repos = context.repos;
    const ctx = await loadGroupForMember(repos, input.slug, context.userId);
    requireRole(ctx.membership, "judge");
    const event = await loadEvent(repos, ctx.group.id, input.eventId);
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
      const ctx = await loadGroupForMember(repos, input.slug, context.userId);
      requireRole(ctx.membership, "judge");
      const event = await loadEvent(repos, ctx.group.id, input.eventId);
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
        // No zone change: a plain name (typo) fix on the whole line.
        updated = await repos.deckCheck.updateCardName(entry.id, input.cardId, name, resolution);
      } else {
        const zone = mapSectionToZone(section);
        if (!zone) {
          throw new AppError(422, ERROR_CODES.VALIDATION_ERROR, `Unknown deck section: ${section}`);
        }
        // Zone change: move all or some copies, splitting the line when fewer.
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
      const ctx = await loadGroupForMember(repos, input.slug, context.userId);
      requireRole(ctx.membership, "judge");
      const event = await loadEvent(repos, ctx.group.id, input.eventId);
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
    const ctx = await loadGroupForMember(repos, input.slug, context.userId);
    requireRole(ctx.membership, "judge");
    const event = await loadEvent(repos, ctx.group.id, input.eventId);
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
    const ctx = await loadGroupForMember(repos, input.slug, context.userId);
    requireRole(ctx.membership, "judge");
    const event = await loadEvent(repos, ctx.group.id, input.eventId);
    requireListVisible(await loadEntry(repos, event, input.entryId));

    const stored = await repos.deckCheck.setCardCopyFound(
      input.entryId,
      input.cardId,
      input.copyIndex,
      input.found,
    );
    if (!stored) {
      // The card row was replaced by a re-import while the judge had the
      // entry open; the client refetches instead of erroring opaquely.
      throw new AppError(409, ERROR_CODES.CONFLICT, "Card list changed; reload the entry");
    }
  }),

  // ── ACCOUNT LINKS AND SELF-SUBMISSION (ADR-026) ─────────────────────────
  linkEntry: os.linkEntry.handler(
    async ({ input, context }): Promise<DeckCheckEntryDetailResponse> => {
      const repos = context.repos;
      const ctx = await loadGroupForMember(repos, input.slug, context.userId);
      requireRole(ctx.membership, "judge");
      const event = await loadEvent(repos, ctx.group.id, input.eventId);
      await loadEntry(repos, event, input.entryId);

      const account = await repos.deckCheck.getUserAccount(input.userId);
      if (!account) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, "Account not found");
      }
      const updated = await repos.deckCheck.linkEntry(input.entryId, input.userId);
      if (!updated) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, "Entry not found");
      }
      return buildEntryDetail(repos, event, updated);
    },
  ),

  unlinkEntry: os.unlinkEntry.handler(
    async ({ input, context }): Promise<DeckCheckEntryDetailResponse> => {
      const repos = context.repos;
      const ctx = await loadGroupForMember(repos, input.slug, context.userId);
      requireRole(ctx.membership, "judge");
      const event = await loadEvent(repos, ctx.group.id, input.eventId);
      await loadEntry(repos, event, input.entryId);

      const updated = await repos.deckCheck.unlinkEntry(input.entryId);
      if (!updated) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, "Entry not found");
      }
      return buildEntryDetail(repos, event, updated);
    },
  ),

  searchAccounts: os.searchAccounts.handler(
    async ({ input, context }): Promise<DeckCheckAccountSearchResponse> => {
      const repos = context.repos;
      const ctx = await loadGroupForMember(repos, input.slug, context.userId);
      requireRole(ctx.membership, "judge");
      const items = await repos.deckCheck.listAccountsForLinkSearch(input.q);
      return { items };
    },
  ),

  regenerateSubmissionToken: os.regenerateSubmissionToken.handler(
    async ({ input, context }): Promise<DeckCheckEventSummaryResponse> => {
      const repos = context.repos;
      const ctx = await loadGroupForMember(repos, input.slug, context.userId);
      requireRole(ctx.membership, "admin");
      const event = await loadEvent(repos, ctx.group.id, input.eventId);
      if (!event.allowSelfSubmission) {
        throw new AppError(409, ERROR_CODES.CONFLICT, "Self-submission is not enabled");
      }
      const updated = await repos.deckCheck.updateEventSubmission(event.id, {
        submissionToken: generateShareToken(),
      });
      if (!updated) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, "Event not found");
      }
      return toEventSummary(updated);
    },
  ),

  // ── PUSH KEYS ───────────────────────────────────────────────────────────
  listKeys: os.listKeys.handler(async ({ input, context }): Promise<DeckCheckKeysResponse> => {
    const repos = context.repos;
    const ctx = await loadGroupForMember(repos, input.slug, context.userId);
    requireRole(ctx.membership, "admin");
    const keys = await repos.deckCheck.listKeysForGroup(ctx.group.id);
    return { items: keys.map((key) => toKey(key)) };
  }),

  mintKey: os.mintKey.handler(async ({ input, context }): Promise<DeckCheckKeyMintedResponse> => {
    const repos = context.repos;
    const ctx = await loadGroupForMember(repos, input.slug, context.userId);
    requireRole(ctx.membership, "admin");

    const token = `orpk_${randomBytes(24).toString("base64url")}`;
    const key = await repos.deckCheck.createKey({
      groupId: ctx.group.id,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      tokenPrefix: token.slice(0, 10),
      label: input.label,
      createdBy: context.userId,
    });
    return { key: toKey(key), token };
  }),

  renameKey: os.renameKey.handler(async ({ input, context }): Promise<DeckCheckKeyResponse> => {
    const repos = context.repos;
    const ctx = await loadGroupForMember(repos, input.slug, context.userId);
    requireRole(ctx.membership, "admin");
    const key = await repos.deckCheck.updateKeyLabel(ctx.group.id, input.keyId, input.label);
    if (!key) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Key not found");
    }
    return toKey(key);
  }),

  revokeKey: os.revokeKey.handler(async ({ input, context }): Promise<void> => {
    const repos = context.repos;
    const ctx = await loadGroupForMember(repos, input.slug, context.userId);
    requireRole(ctx.membership, "admin");
    const revoked = await repos.deckCheck.revokeKey(ctx.group.id, input.keyId);
    if (!revoked) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Key not found");
    }
  }),
};
