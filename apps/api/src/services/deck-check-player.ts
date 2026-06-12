// oxlint-disable-next-line import/no-nodejs-modules -- server-side hashing, never reaches the browser
import { createHash } from "node:crypto";

import {
  buildContentHashInput,
  diffCardLines,
  ERROR_CODES,
  inferZone,
  mapSectionToZone,
  SELF_SUBMIT_EXTERNAL_ID_PREFIX,
  WellKnown,
} from "@openrift/shared";
import type { CardType, DeckCheckCardLine, SourceSlot, SuperType } from "@openrift/shared";
import { getDeckFromCode } from "@piltoverarchive/riftbound-deck-codes";

import type { Repos } from "../deps.js";
import { AppError } from "../errors.js";
import type {
  DeckCheckEntry,
  DeckCheckEvent,
  NewDeckCheckEntryCard,
} from "../repositories/deck-check.js";
import { cardResolutionKey } from "../repositories/deck-check.js";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Whether the event currently accepts player writes: it is not archived and
 * the close date (when set) has not passed. `allow_self_submission` is checked
 * separately, because it gates only new submissions, never edits (ADR-026).
 * @returns True while the window is open.
 */
export function submissionWindowOpen(event: {
  status: string;
  submissionsCloseAt: Date | null;
}): boolean {
  return (
    event.status === "active" &&
    (event.submissionsCloseAt === null || event.submissionsCloseAt.getTime() > Date.now())
  );
}

/**
 * The lazy auto-match (ADR-026): links every unclaimed, unblocked entry whose
 * `player_email` matches the caller's verified email. Runs when a player loads
 * "My tournament decks" or opens a submission link, covering accounts created
 * after the provider pushed.
 * @param repos The request repositories.
 * @param userId The authenticated caller.
 */
export async function lazyMatchEntriesForUser(repos: Repos, userId: string): Promise<void> {
  const account = await repos.deckCheck.getUserAccount(userId);
  if (!account) {
    return;
  }
  const verifiedId = await repos.deckCheck.findVerifiedUserByEmail(account.email);
  if (verifiedId !== userId) {
    return;
  }
  await repos.deckCheck.autoMatchEntriesByEmail(userId, account.email);
}

/**
 * Builds the normalized card lines a player submission resolves to, from one
 * of the three allowed inputs: an own deck's id, a pasted deck code, or the
 * card lines of a pasted text list.
 * @returns Card lines in the same shape a provider push produces.
 */
export function buildPlayerLines(
  repos: Repos,
  userId: string,
  input: {
    deckId?: string;
    deckCode?: string;
    cards?: { name: string; quantity: number; section: string }[];
  },
): Promise<DeckCheckCardLine[]> {
  if (input.deckId !== undefined) {
    return linesFromOwnDeck(repos, userId, input.deckId);
  }
  if (input.deckCode !== undefined) {
    return linesFromDeckCode(repos, input.deckCode);
  }
  if (input.cards !== undefined) {
    return linesFromCardList(repos, input.cards);
  }
  throw new AppError(422, ERROR_CODES.VALIDATION_ERROR, "Provide a deck, code, or card list");
}

/**
 * Maps a pasted text list's lines onto zones. An unknown section rejects the
 * submission (like the manual judge entry), and main-zone lines whose card
 * type allows exactly one zone (legend, rune, battlefield) are moved there:
 * a paste without zone headers lands everything in main, and those types can
 * never legally live in it. The chosen champion cannot be inferred; it needs
 * a "Champion:" header, and the legality preview flags it when missing.
 * @returns The zone-mapped card lines.
 */
async function linesFromCardList(
  repos: Repos,
  cards: { name: string; quantity: number; section: string }[],
): Promise<DeckCheckCardLine[]> {
  const lines = cards.map((card) => {
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

  const mainLines = lines.filter((line) => line.zone === "main");
  if (mainLines.length === 0) {
    return lines;
  }
  const resolutions = await repos.deckCheck.resolveCards(
    mainLines.map((line) => ({ name: line.name })),
  );
  const matchedIds = [
    ...new Set(
      [...resolutions.values()].flatMap((resolution) =>
        resolution.resolvedCardId ? [resolution.resolvedCardId] : [],
      ),
    ),
  ];
  const details = await repos.deckCheck.getCardDetails(matchedIds);
  for (const line of mainLines) {
    const resolution = resolutions.get(cardResolutionKey(line.name));
    const detail = resolution?.resolvedCardId ? details.get(resolution.resolvedCardId) : undefined;
    if (detail) {
      line.zone = inferZone(detail.type as CardType, detail.superTypes as SuperType[], "mainDeck");
    }
  }
  return lines;
}

async function linesFromOwnDeck(
  repos: Repos,
  userId: string,
  deckId: string,
): Promise<DeckCheckCardLine[]> {
  const deck = await repos.decks.getByIdForUser(deckId, userId);
  if (!deck) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Deck not found");
  }
  const rows = await repos.decks.cardsWithDetails(deckId, userId);
  return rows
    .filter((row) => row.zone !== WellKnown.deckZone.OVERFLOW)
    .map((row) => ({ name: row.cardName, zone: row.zone, quantity: row.quantity }));
}

/**
 * Decodes a pasted deck code and maps its short codes onto catalog cards,
 * inferring zones the lossy format does not carry. An unknown short code
 * becomes an unmatched line carrying the code as its raw name, so a judge
 * sees a flagged placeholder instead of a silently dropped card.
 * @returns The decoded card lines.
 */
async function linesFromDeckCode(repos: Repos, deckCode: string): Promise<DeckCheckCardLine[]> {
  let decoded: ReturnType<typeof getDeckFromCode>;
  try {
    decoded = getDeckFromCode(deckCode.trim());
  } catch {
    throw new AppError(422, ERROR_CODES.VALIDATION_ERROR, "The deck code could not be read");
  }

  const shortCodes = [
    ...decoded.mainDeck.map((card) => card.cardCode),
    ...decoded.sideboard.map((card) => card.cardCode),
    ...(decoded.chosenChampion ? [decoded.chosenChampion] : []),
  ];
  const cardsByShortCode = await repos.deckCheck.getCardsByShortCodes(shortCodes);

  const lines: DeckCheckCardLine[] = [];
  const pushLine = (cardCode: string, count: number, slot: SourceSlot): void => {
    if (count <= 0) {
      return;
    }
    const card = cardsByShortCode.get(cardCode);
    if (!card) {
      lines.push({ name: cardCode, zone: "main", quantity: count });
      return;
    }
    lines.push({
      name: card.name,
      zone: inferZone(card.type as CardType, [], slot),
      quantity: count,
    });
  };

  // The encoder counts the chosen champion inside mainDeck (it is a marker,
  // not an extra slot), so the decode splits one copy back out.
  let championToSplit = decoded.chosenChampion ?? null;
  for (const card of decoded.mainDeck) {
    if (championToSplit !== null && card.cardCode === championToSplit) {
      pushLine(card.cardCode, 1, "chosenChampion");
      pushLine(card.cardCode, card.count - 1, "mainDeck");
      championToSplit = null;
      continue;
    }
    pushLine(card.cardCode, card.count, "mainDeck");
  }
  if (championToSplit !== null) {
    pushLine(championToSplit, 1, "chosenChampion");
  }
  for (const card of decoded.sideboard) {
    pushLine(card.cardCode, card.count, "sideboard");
  }

  if (lines.length === 0) {
    throw new AppError(422, ERROR_CODES.VALIDATION_ERROR, "The deck code contains no cards");
  }
  return lines;
}

/**
 * Resolves player lines against the catalog into entry-card rows, the same
 * way a provider push does. The section stores the zone slug, since a player
 * submission has no provider vocabulary to preserve.
 * @returns Rows ready for `replaceEntryCards`.
 */
export async function resolvePlayerCardRows(
  repos: Repos,
  lines: DeckCheckCardLine[],
): Promise<NewDeckCheckEntryCard[]> {
  const resolutions = await repos.deckCheck.resolveCards(
    lines.map((line) => ({ name: line.name })),
  );
  return lines.map((line, sortOrder) => {
    const resolution = resolutions.get(cardResolutionKey(line.name)) ?? {
      resolvedCardId: null,
      resolvedPrintingId: null,
      matchStatus: "unmatched" as const,
    };
    return {
      sortOrder,
      rawName: line.name,
      section: line.zone,
      zone: line.zone,
      quantity: line.quantity,
      ...resolution,
    };
  });
}

/** Sharing consent as submitted by the player; an absent flag is no statement. */
export interface PlayerSharingConsent {
  allowNameSharing?: boolean;
  allowRiotIdSharing?: boolean;
}

/**
 * The consent columns a submission actually states, for spreading into an
 * entry update.
 * @returns A patch containing only the flags the player answered.
 */
function consentPatch(consent: PlayerSharingConsent): Partial<{
  allowNameSharing: boolean;
  allowRiotIdSharing: boolean;
}> {
  return {
    ...(consent.allowNameSharing === undefined
      ? {}
      : { allowNameSharing: consent.allowNameSharing }),
    ...(consent.allowRiotIdSharing === undefined
      ? {}
      : { allowRiotIdSharing: consent.allowRiotIdSharing }),
  };
}

/**
 * Applies a player's list to an existing entry: ADR-025's re-import
 * invalidation verbatim, plus the ADR-026 edit-takeover flip for an entry the
 * provider fed. An unchanged list is idempotent (but still records a changed
 * sharing consent).
 * @returns The updated entry.
 */
export async function applyPlayerList(
  repos: Repos,
  entry: DeckCheckEntry,
  lines: DeckCheckCardLine[],
  cardRows: NewDeckCheckEntryCard[],
  consent: PlayerSharingConsent = {},
): Promise<DeckCheckEntry> {
  const contentHash = sha256(buildContentHashInput(lines));
  const takeover = entry.listOwner === "provider" ? { listOwner: "player" as const } : {};

  if (entry.contentHash === contentHash) {
    const patch = { ...takeover, ...consentPatch(consent) };
    if (Object.keys(patch).length > 0) {
      const updated = await repos.deckCheck.updateEntry(entry.id, patch);
      return updated ?? entry;
    }
    return entry;
  }

  const previousCards = await repos.deckCheck.listCardsForEntry(entry.id);
  const wasChecked = entry.checkStatus !== "unchecked";
  const previousLines = previousCards.map((card) => ({
    name: card.rawName,
    zone: card.zone as DeckCheckCardLine["zone"],
    quantity: card.quantity,
  }));
  const updated = await repos.deckCheck.updateEntry(entry.id, {
    ...takeover,
    ...consentPatch(consent),
    contentHash,
    submittedAt: new Date(),
    ...(wasChecked
      ? {
          checkStatus: "unchecked" as const,
          checkedBy: null,
          checkedAt: null,
          changeSummary: JSON.stringify(diffCardLines(previousLines, lines)),
        }
      : {}),
  });
  await repos.deckCheck.replaceEntryCards(entry.id, cardRows);
  return updated ?? entry;
}

/**
 * Creates a fresh self-submitted entry (ADR-026): born linked, player-owned,
 * keyed `openrift:<userId>` so a re-submission upserts the same entry, with
 * the player fields populated from the account.
 * @returns The created entry.
 */
export async function createSelfSubmittedEntry(
  repos: Repos,
  event: DeckCheckEvent,
  account: { id: string; name: string | null; email: string },
  lines: DeckCheckCardLine[],
  cardRows: NewDeckCheckEntryCard[],
  consent: PlayerSharingConsent = {},
): Promise<DeckCheckEntry> {
  const entry = await repos.deckCheck.createEntry({
    eventId: event.id,
    externalId: `${SELF_SUBMIT_EXTERNAL_ID_PREFIX}${account.id}`,
    playerName: account.name?.trim() || account.email,
    playerEmail: account.email,
    riotId: null,
    submittedAt: new Date(),
    ...consentPatch(consent),
    contentHash: sha256(buildContentHashInput(lines)),
    withdrawnAt: null,
    claimedUserId: account.id,
    claimSource: "self_submit",
    claimedAt: new Date(),
    listOwner: "player",
  });
  await repos.deckCheck.replaceEntryCards(entry.id, cardRows);
  return entry;
}
