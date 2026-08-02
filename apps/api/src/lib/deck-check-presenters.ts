import { deckCheckEntrySource } from "@openrift/shared";
import type {
  DeckCheckEntryDetailResponse,
  DeckCheckEntryResponse,
  DeckCheckEntrySummaryResponse,
  DeckCheckEventSummaryResponse,
  DeckCheckKeyResponse,
} from "@openrift/shared";

import type { Repos } from "../deps.js";
import type { DeckCheckKey } from "../repositories/deck-check-keys.js";
import type {
  DeckCheckEntry,
  DeckCheckEntrySummary,
  DeckCheckEvent,
  DeckCheckEventWithCounts,
} from "../repositories/deck-check.js";
import {
  buildEntryAdvisories,
  toDeckCheckEntryCardResponse,
} from "../services/deck-check-advisories.js";

/*
 * Shared response mappers for the deck-check subsystem (ADR-025/033). The same
 * shapes back both the group-scoped surface and the tournament-scoped judge API,
 * so the mapping lives here rather than being re-derived per router.
 */

/**
 * Trim a date-ish value to the calendar day the deck-check responses expose.
 * Exported because the player router presents the same `eventDate` field.
 * @param value A `Date`, a date string, or null.
 * @returns The value trimmed to a `YYYY-MM-DD` string, or null.
 */
export function isoDate(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
}

/** @returns The event projection mapped to its API summary response. */
export function toEventSummary(
  row: DeckCheckEvent &
    Partial<Pick<DeckCheckEventWithCounts, "entryCount" | "approvedCount" | "checkedCount">>,
): DeckCheckEventSummaryResponse {
  return {
    id: row.id,
    name: row.name,
    eventDate: isoDate(row.eventDate),
    format: row.format,
    allowedSets: row.allowedSets,
    status: row.status,
    entryCount: row.entryCount ?? 0,
    approvedCount: row.approvedCount ?? 0,
    checkedCount: row.checkedCount ?? 0,
    listLockMode: row.listLockMode,
    allowSelfSubmission: row.allowSelfSubmission,
    submissionToken: row.allowSelfSubmission ? row.submissionToken : null,
    submissionsCloseAt: row.submissionsCloseAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** @returns An entry summary row mapped to its API response. */
export function toEntrySummary(row: DeckCheckEntrySummary): DeckCheckEntrySummaryResponse {
  // An editable list is not yet delivered to an official (TR 401.3, ADR-027);
  // even its copy and progress counts stay hidden from the judge view.
  const listVisible = row.state !== "editable";
  return {
    id: row.id,
    externalId: row.externalId,
    participantId: row.participantId,
    participantStatus: row.participantStatus,
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

/** @returns A full entry row mapped to its API response. */
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

/** @returns A push-key row mapped to its API response. */
export function toKey(row: DeckCheckKey & { createdByName?: string | null }): DeckCheckKeyResponse {
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

/**
 * Builds the checker payload: entry, cards, advisory legality findings, and the
 * deck-stat aggregates, reusing the shared deck-rules and the same counting the
 * deck list uses (main+champion zones, legend/rune/battlefield types excluded
 * from type counts).
 * @param repos The repository bundle.
 * @param event The deck-check event the entry belongs to.
 * @param entry The entry to project.
 * @returns The full entry-detail response.
 */
export async function buildEntryDetail(
  repos: Repos,
  event: DeckCheckEvent,
  entry: DeckCheckEntry,
): Promise<DeckCheckEntryDetailResponse> {
  // An editable list has not been delivered to an official yet (TR 401.3,
  // ADR-027): the judge payload carries the entry's identity and state, but no
  // cards, advisories, or stats until the player submits.
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
