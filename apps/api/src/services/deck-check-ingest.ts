// oxlint-disable-next-line import/no-nodejs-modules -- server-side hashing, never reaches the browser
import { createHash, randomUUID } from "node:crypto";

import {
  buildContentHashInput,
  diffCardLines,
  ERROR_CODES,
  MANUAL_ENTRY_EXTERNAL_ID_PREFIX,
  mapSectionToZone,
  SELF_SUBMIT_EXTERNAL_ID_PREFIX,
  WellKnown,
} from "@openrift/shared";
import type { DeckCheckCardLine, DeckCheckIngestResultResponse } from "@openrift/shared";
import type { createDeckCheckEntrySchema } from "@openrift/shared/contracts/deck-check";
import type { deckCheckIngestSchema } from "@openrift/shared/contracts/deck-check-ingest";
import type { z } from "zod";

import type { Repos } from "../deps.js";
import { AppError } from "../errors.js";
import { generateShareToken } from "../lib/share-token.js";
import type {
  DeckCheckEntry,
  DeckCheckHost,
  NewDeckCheckEntryCard,
} from "../repositories/deck-check.js";
import { cardResolutionKey } from "../repositories/deck-check.js";
import { storedCardLines } from "./deck-check-states.js";

export type DeckCheckIngestPayload = z.infer<typeof deckCheckIngestSchema>;

type IngestEntry = DeckCheckIngestPayload["entries"][number];

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Maps every entry's sections up front so an unknown section rejects the whole
 * push before anything is written.
 * @returns Zone-mapped card lines per entry, aligned with `payload.entries`.
 */
function mapAllSections(entries: IngestEntry[]): DeckCheckCardLine[][] {
  const unknownSections = new Set<string>();
  const mapped = entries.map((entry) =>
    entry.cards.map((card) => {
      const zone = mapSectionToZone(card.section);
      if (!zone) {
        unknownSections.add(card.section);
      }
      return {
        name: card.name,
        zone: zone ?? WellKnown.deckZone.MAIN,
        quantity: card.quantity,
      };
    }),
  );
  if (unknownSections.size > 0) {
    throw new AppError(
      422,
      ERROR_CODES.VALIDATION_ERROR,
      `Unknown deck sections: ${[...unknownSections].join(", ")}`,
      { unknownSections: [...unknownSections] },
    );
  }
  return mapped;
}

/**
 * Recomputes an entry's content hash from its stored card lines, after a
 * manual card edit, so a later provider re-push diffs against what the judge
 * actually sees.
 * @param repos The request repositories.
 * @param entryId The edited entry.
 */
export async function recomputeEntryHash(repos: Repos, entryId: string): Promise<void> {
  const cards = await repos.deckCheck.listCardsForEntry(entryId);
  await repos.deckCheck.updateEntry(entryId, {
    contentHash: sha256(buildContentHashInput(storedCardLines(cards))),
  });
}

/**
 * Applies one provider push (ADR-025): upserts the entries it lists into an
 * existing event (partial semantics — absent entries are untouched), honors
 * explicit withdrawal, and invalidates checks whose card list changed. Pushes
 * never create events; the event is created in OpenRift and addressed by its
 * uuid. Run inside a transaction so a failed push imports nothing.
 *
 * @param repos Transaction-bound repositories.
 * @param host The host the push key resolved to.
 * @param payload The validated push payload.
 * @param appBaseUrl The web origin used to build each entry's claim link.
 * @returns Per-entry outcome counts plus a claim link per entry for the provider.
 */
export async function ingestDeckCheckPush(
  repos: Repos,
  host: DeckCheckHost,
  payload: DeckCheckIngestPayload,
  appBaseUrl: string,
): Promise<DeckCheckIngestResultResponse> {
  const event = await repos.deckCheck.getEventForHost(host, payload.tournamentId);
  if (!event) {
    throw new AppError(
      404,
      ERROR_CODES.NOT_FOUND,
      "Unknown tournament id. Create the deck-check tournament in OpenRift first.",
    );
  }
  if (event.status === "archived") {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      "Event is archived. Un-archive it before pushing.",
    );
  }

  // The self-submission namespace is reserved (ADR-026): a provider must never
  // upsert onto (or withdraw) an entry the player created.
  const reservedIds = payload.entries
    .map((entry) => entry.externalId)
    .filter((externalId) => externalId.startsWith(SELF_SUBMIT_EXTERNAL_ID_PREFIX));
  if (reservedIds.length > 0) {
    throw new AppError(
      422,
      ERROR_CODES.VALIDATION_ERROR,
      `External ids with the reserved "${SELF_SUBMIT_EXTERNAL_ID_PREFIX}" prefix: ${reservedIds.join(", ")}`,
      { reservedIds },
    );
  }

  const mappedLines = mapAllSections(payload.entries);

  const resolutions = await repos.deckCheck.resolveCards(
    mappedLines.flat().map((line) => ({ name: line.name })),
  );

  const result: DeckCheckIngestResultResponse = {
    tournamentId: event.id,
    entriesCreated: 0,
    entriesUpdated: 0,
    entriesUnchanged: 0,
    entriesWithdrawn: 0,
    checksInvalidated: 0,
    entriesIgnored: 0,
    entries: [],
  };

  // Records one pushed entry's claim link in the response, minting a token for
  // the rare entry that lacks one (created before the amendment's backfill).
  const recordEntry = async (
    externalId: string,
    entry: { id: string; claimToken: string | null },
  ): Promise<void> => {
    let token = entry.claimToken;
    if (!token) {
      // The guarded write reports back which token actually landed, so a
      // concurrent mint can't leave this response carrying a dead claim URL.
      token = await repos.deckCheck.setClaimTokenIfMissing(entry.id, generateShareToken());
    }
    result.entries.push({
      externalId,
      entryId: entry.id,
      claimUrl: token ? `${appBaseUrl}/tournaments/claim/${token}` : null,
    });
  };

  for (const [index, entry] of payload.entries.entries()) {
    const lines = mappedLines[index] ?? [];
    const contentHash = sha256(buildContentHashInput(lines));
    const cardRows: NewDeckCheckEntryCard[] = entry.cards.map((card, sortOrder) => {
      const resolution = resolutions.get(cardResolutionKey(card.name)) ?? {
        resolvedCardId: null,
        resolvedPrintingId: null,
        matchStatus: "unmatched" as const,
      };
      return {
        sortOrder,
        rawName: card.name,
        section: card.section,
        zone: lines[sortOrder]?.zone ?? WellKnown.deckZone.MAIN,
        quantity: card.quantity,
        ...resolution,
      };
    });

    const identity = {
      playerName: entry.playerName,
      riotId: entry.riotId ?? null,
      submittedAt: entry.submittedAt ? new Date(entry.submittedAt) : null,
    };
    // An omitted consent flag is no statement: the stored value survives a
    // re-push, and a fresh insert falls back to the column default (true).
    const consent = {
      ...(entry.allowDeckPublishing === undefined
        ? {}
        : { allowDeckPublishing: entry.allowDeckPublishing }),
      ...(entry.allowNameSharing === undefined ? {} : { allowNameSharing: entry.allowNameSharing }),
      ...(entry.allowRiotIdSharing === undefined
        ? {}
        : { allowRiotIdSharing: entry.allowRiotIdSharing }),
    };

    const existing = await repos.deckCheck.getEntryByExternalId(event.id, entry.externalId);
    if (!existing) {
      // Each pushed entry creates its own walk-in participant. Players link
      // themselves later through the claim link (ADR-033); the push carries no
      // identity that could auto-match an account.
      const participant = await repos.tournaments.resolveOrCreateParticipant({
        tournamentId: event.id,
        riotId: identity.riotId,
        displayName: identity.playerName,
      });
      const created = await repos.deckCheck.createEntry({
        tournamentId: event.id,
        participantId: participant.id,
        externalId: entry.externalId,
        submittedAt: identity.submittedAt,
        ...consent,
        contentHash,
        state: entry.withdrawn ? "withdrawn" : "submitted",
        withdrawnAt: entry.withdrawn ? new Date() : null,
      });
      await repos.deckCheck.replaceEntryCards(created.id, cardRows);
      await recordEntry(entry.externalId, created);
      result.entriesCreated += 1;
      continue;
    }

    // Withdrawal is a state transition (ADR-027): the flag moves the entry to
    // 'withdrawn'; a push without it returns a withdrawn entry to 'submitted'
    // (the pre-withdrawal state is not preserved — the push is a fresh
    // submission), and leaves any other state alone.
    const wasWithdrawn = existing.state === "withdrawn";
    const withdrawalChange = entry.withdrawn
      ? wasWithdrawn
        ? {}
        : {
            state: "withdrawn" as const,
            withdrawnAt: new Date(),
            unlockRequestedAt: null,
          }
      : wasWithdrawn
        ? { state: "submitted" as const, withdrawnAt: null }
        : {};
    if (entry.withdrawn && !wasWithdrawn) {
      result.entriesWithdrawn += 1;
    }

    if (existing.contentHash === contentHash) {
      // Identical list: refresh identity, consent, and withdrawal state, keep
      // the lifecycle state and every tick untouched (idempotent re-push).
      await repos.deckCheck.updateEntry(existing.id, {
        ...identity,
        ...consent,
        ...withdrawalChange,
      });
      await recordEntry(entry.externalId, existing);
      result.entriesUnchanged += 1;
      continue;
    }

    // Changed list: the provider always wins (ADR-027). The push lands the
    // entry in 'submitted' from any state — discarding a player's in-progress
    // edit and pending unlock request, and invalidating a review with a
    // stored diff for the judge.
    const previousCards = await repos.deckCheck.listCardsForEntry(existing.id);
    const wasReviewed = existing.state === "approved" || existing.state === "checked";
    await repos.deckCheck.updateEntry(existing.id, {
      ...identity,
      ...consent,
      contentHash,
      state: entry.withdrawn ? "withdrawn" : "submitted",
      withdrawnAt: entry.withdrawn ? (existing.withdrawnAt ?? new Date()) : null,
      reviewOutcome: null,
      checkedBy: null,
      checkedAt: null,
      approvedBy: null,
      approvedAt: null,
      unlockRequestedAt: null,
      preEditLines: null,
      changeSummary: wasReviewed ? diffCardLines(storedCardLines(previousCards), lines) : null,
    });
    await repos.deckCheck.replaceEntryCards(existing.id, cardRows);
    await recordEntry(entry.externalId, existing);
    if (wasReviewed) {
      result.checksInvalidated += 1;
    }
    result.entriesUpdated += 1;
  }

  return result;
}

export type CreateDeckCheckEntryPayload = z.infer<typeof createDeckCheckEntrySchema>;

/**
 * Creates a deck for an existing roster participant by hand (judge+) for when
 * the organizer push isn't available. Resolves card names and computes the
 * content hash exactly like a push so a later provider push diffs correctly. The
 * entry is stamped with a `manual:`-prefixed external id, which never collides
 * with a provider id — note a later push for the same player (under the
 * provider's own id) lands as a separate entry rather than merging into this
 * one. The caller owns the one-deck-per-participant check.
 *
 * @param repos The request repositories.
 * @param tournamentId The deck-check tournament to add the deck to.
 * @param payload The validated participant id + card-line input.
 * @returns The created entry row.
 */
export async function createManualDeckCheckEntry(
  repos: Repos,
  tournamentId: string,
  payload: CreateDeckCheckEntryPayload,
): Promise<DeckCheckEntry> {
  const lines: DeckCheckCardLine[] = payload.cards.map((card) => {
    const zone = mapSectionToZone(card.section);
    if (!zone) {
      throw new AppError(
        422,
        ERROR_CODES.VALIDATION_ERROR,
        `Unknown deck section: ${card.section}`,
      );
    }
    return { name: card.name, zone, quantity: card.quantity };
  });

  const resolutions = await repos.deckCheck.resolveCards(
    lines.map((line) => ({ name: line.name })),
  );
  const cardRows: NewDeckCheckEntryCard[] = payload.cards.map((card, sortOrder) => {
    const resolution = resolutions.get(cardResolutionKey(card.name)) ?? {
      resolvedCardId: null,
      resolvedPrintingId: null,
      matchStatus: "unmatched" as const,
    };
    return {
      sortOrder,
      rawName: card.name,
      section: card.section,
      zone: lines[sortOrder]?.zone ?? "main",
      quantity: card.quantity,
      ...resolution,
    };
  });

  const created = await repos.deckCheck.createEntry({
    tournamentId,
    participantId: payload.participantId,
    externalId: `${MANUAL_ENTRY_EXTERNAL_ID_PREFIX}${randomUUID()}`,
    submittedAt: null,
    contentHash: sha256(buildContentHashInput(lines)),
    withdrawnAt: null,
  });
  await repos.deckCheck.replaceEntryCards(created.id, cardRows);
  return created;
}
