// oxlint-disable-next-line import/no-nodejs-modules -- server-side hashing, never reaches the browser
import { createHash, randomUUID } from "node:crypto";

import {
  buildContentHashInput,
  diffCardLines,
  ERROR_CODES,
  MANUAL_ENTRY_EXTERNAL_ID_PREFIX,
  mapSectionToZone,
  SELF_SUBMIT_EXTERNAL_ID_PREFIX,
} from "@openrift/shared";
import type { DeckCheckCardLine, DeckCheckIngestResultResponse } from "@openrift/shared";
import type { createDeckCheckEntrySchema, deckCheckIngestSchema } from "@openrift/shared/schemas";
import type { z } from "zod";

import type { Repos } from "../deps.js";
import { AppError } from "../errors.js";
import type {
  DeckCheckEntry,
  DeckCheckEntryCard,
  NewDeckCheckEntryCard,
} from "../repositories/deck-check.js";
import { cardResolutionKey } from "../repositories/deck-check.js";

export type DeckCheckIngestPayload = z.infer<typeof deckCheckIngestSchema>;

type IngestEntry = DeckCheckIngestPayload["entries"][number];

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Re-derives the normalized card lines from stored card rows, for diffing.
 * @returns The stored rows as plain card lines.
 */
function storedCardLines(cards: DeckCheckEntryCard[]): DeckCheckCardLine[] {
  return cards.map((card) => ({
    name: card.rawName,
    zone: card.zone as DeckCheckCardLine["zone"],
    quantity: card.quantity,
  }));
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
        zone: zone ?? ("main" as const),
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
 * @param groupId The group the push key resolved to.
 * @param payload The validated push payload.
 * @returns Per-entry outcome counts for the provider's logs.
 */
export async function ingestDeckCheckPush(
  repos: Repos,
  groupId: string,
  payload: DeckCheckIngestPayload,
): Promise<DeckCheckIngestResultResponse> {
  const event = await repos.deckCheck.getEvent(groupId, payload.eventId);
  if (!event) {
    throw new AppError(
      404,
      ERROR_CODES.NOT_FOUND,
      "Unknown event id; create the event in OpenRift first",
    );
  }
  if (event.status === "archived") {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      "Event is archived; un-archive it before pushing",
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
    eventId: event.id,
    entriesCreated: 0,
    entriesUpdated: 0,
    entriesUnchanged: 0,
    entriesWithdrawn: 0,
    checksInvalidated: 0,
    entriesIgnored: 0,
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
        zone: lines[sortOrder]?.zone ?? "main",
        quantity: card.quantity,
        ...resolution,
      };
    });

    const identity = {
      playerName: entry.playerName,
      playerEmail: entry.playerEmail ?? null,
      riotId: entry.riotId ?? null,
      submittedAt: entry.submittedAt ? new Date(entry.submittedAt) : null,
      publishOptOut: entry.publishOptOut ?? false,
    };

    const existing = await repos.deckCheck.getEntryByExternalId(event.id, entry.externalId);
    if (!existing) {
      const created = await repos.deckCheck.createEntry({
        eventId: event.id,
        externalId: entry.externalId,
        ...identity,
        contentHash,
        withdrawnAt: entry.withdrawn ? new Date() : null,
      });
      await repos.deckCheck.replaceEntryCards(created.id, cardRows);
      await autoMatchEntry(repos, created.id, identity.playerEmail);
      result.entriesCreated += 1;
      continue;
    }

    const withdrawnAt = entry.withdrawn ? (existing.withdrawnAt ?? new Date()) : null;
    const withdrawalChanged =
      Boolean(existing.withdrawnAt) === Boolean(withdrawnAt) ? {} : { withdrawnAt };
    if (entry.withdrawn && !existing.withdrawnAt) {
      result.entriesWithdrawn += 1;
    }

    if (existing.listOwner === "player") {
      // Edit-takeover (ADR-026): the player owns the list, so the push applies
      // nothing except an explicit withdrawal. Updating the player fields is
      // skipped too, because a pushed email change could re-steer auto-match.
      await repos.deckCheck.updateEntry(existing.id, {
        ...withdrawalChanged,
        providerPushIgnoredAt: new Date(),
      });
      result.entriesIgnored += 1;
      continue;
    }

    if (existing.contentHash === contentHash) {
      // Identical list: refresh identity and withdrawal state, keep the check
      // state and every tick untouched (idempotent re-push).
      await repos.deckCheck.updateEntry(existing.id, { ...identity, ...withdrawalChanged });
      await autoMatchEntry(repos, existing.id, identity.playerEmail);
      result.entriesUnchanged += 1;
      continue;
    }

    const previousCards = await repos.deckCheck.listCardsForEntry(existing.id);
    const wasChecked = existing.checkStatus !== "unchecked";
    await repos.deckCheck.updateEntry(existing.id, {
      ...identity,
      ...withdrawalChanged,
      contentHash,
      ...(wasChecked
        ? {
            checkStatus: "unchecked" as const,
            checkedBy: null,
            checkedAt: null,
            changeSummary: JSON.stringify(diffCardLines(storedCardLines(previousCards), lines)),
          }
        : {}),
    });
    await repos.deckCheck.replaceEntryCards(existing.id, cardRows);
    await autoMatchEntry(repos, existing.id, identity.playerEmail);
    if (wasChecked) {
      result.checksInvalidated += 1;
    }
    result.entriesUpdated += 1;
  }

  return result;
}

/**
 * The ingest-time auto-match (ADR-026): links an entry to a verified account
 * sharing its email. No-op for absent emails; `linkEntryIfUnclaimed` skips
 * already-linked and judge-blocked entries.
 * @param repos Transaction-bound repositories.
 * @param entryId The just-upserted entry.
 * @param playerEmail The provider's email for the entry.
 */
async function autoMatchEntry(
  repos: Repos,
  entryId: string,
  playerEmail: string | null,
): Promise<void> {
  if (!playerEmail) {
    return;
  }
  const userId = await repos.deckCheck.findVerifiedUserByEmail(playerEmail);
  if (userId) {
    await repos.deckCheck.linkEntryIfUnclaimed(entryId, userId, "email_auto");
  }
}

export type CreateDeckCheckEntryPayload = z.infer<typeof createDeckCheckEntrySchema>;

/**
 * Creates a single entrant by hand (judge+) for when the organizer push isn't
 * available. Resolves card names and computes the content hash exactly like a
 * push so a later provider push diffs correctly. The entry is stamped with a
 * `manual:`-prefixed external id, which never collides with a provider id —
 * note a later push for the same player (under the provider's own id) lands as
 * a separate entry rather than merging into this one.
 *
 * @param repos The request repositories.
 * @param eventId The event to add the entrant to.
 * @param payload The validated player + card-line input.
 * @returns The created entry row.
 */
export async function createManualDeckCheckEntry(
  repos: Repos,
  eventId: string,
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
    eventId,
    externalId: `${MANUAL_ENTRY_EXTERNAL_ID_PREFIX}${randomUUID()}`,
    playerName: payload.playerName,
    playerEmail: payload.playerEmail ?? null,
    riotId: payload.riotId ?? null,
    submittedAt: null,
    publishOptOut: false,
    contentHash: sha256(buildContentHashInput(lines)),
    withdrawnAt: null,
  });
  await repos.deckCheck.replaceEntryCards(created.id, cardRows);
  return created;
}
