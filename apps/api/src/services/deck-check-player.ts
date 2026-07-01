// oxlint-disable-next-line import/no-nodejs-modules -- server-side hashing, never reaches the browser
import { createHash } from "node:crypto";

import {
  buildContentHashInput,
  ERROR_CODES,
  inferZone,
  mapSectionToZone,
  SELF_SUBMIT_EXTERNAL_ID_PREFIX,
  WellKnown,
} from "@openrift/shared";
import type {
  CardType,
  DeckCheckCardLine,
  DeckCheckClaimResultResponse,
  SourceSlot,
  SuperType,
} from "@openrift/shared";
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
 * Claims a participant (a tournament "spot") via its claim token (ADR-026
 * amendment, ADR-033). Rooted on the participant, so it works with or without
 * deck check. Resolves against the participant's current state:
 *
 * - unclaimed and not blocked: link it (`claim_link`);
 * - already the caller's: idempotent no-op, the caller still lands on it
 *   (a `judge_manual` link before the click stays `judge_manual`);
 * - linked to a different account: refuse, do not steal;
 * - `claim_blocked_at` set (a judge detached it): refuse;
 * - the caller already holds a different spot in this tournament: refuse as
 *   `duplicate` (one account per tournament), pointing at their existing spot.
 *
 * The token is the capability, so claiming never waits on email verification.
 * `entryId` routes the caller to their deck when the tournament runs deck check,
 * and is null otherwise.
 * @returns The outcome, or null when the token matches no participant (a 404).
 */
export async function claimParticipantByToken(
  repos: Repos,
  token: string,
  userId: string,
): Promise<DeckCheckClaimResultResponse | null> {
  const participant = await repos.tournaments.findParticipantByClaimToken(token);
  if (!participant) {
    return null;
  }
  if (participant.userId === userId) {
    const entryId = await repos.deckCheck.findEntryIdByParticipant(participant.id);
    return { status: "already", tournamentId: participant.tournamentId, entryId: entryId ?? null };
  }
  if (participant.userId !== null) {
    return { status: "conflict", tournamentId: null, entryId: null };
  }
  if (participant.claimBlockedAt !== null) {
    return { status: "blocked", tournamentId: null, entryId: null };
  }
  // One account per tournament (uq_tournament_participants_user): if the caller
  // already holds a different spot here, linking this one too would violate that
  // key. Catch it as a friendly outcome (pointing at the spot they already have)
  // instead of letting the unique violation surface as a 500.
  const existing = await repos.tournaments.findParticipantByUser(participant.tournamentId, userId);
  if (existing) {
    const entryId = await repos.deckCheck.findEntryIdByParticipant(existing.id);
    return {
      status: "duplicate",
      tournamentId: participant.tournamentId,
      entryId: entryId ?? null,
    };
  }
  // The update re-checks unclaimed + unblocked atomically, so a race between the
  // read above and this write resolves to a refusal, not a steal.
  let linked: Awaited<ReturnType<typeof repos.tournaments.linkParticipantByClaimTokenIfUnclaimed>>;
  try {
    linked = await repos.tournaments.linkParticipantByClaimTokenIfUnclaimed(
      token,
      userId,
      "claim_link",
    );
  } catch (error) {
    // A concurrent claim of a *different* spot in this tournament can land
    // between the duplicate pre-check above and this write, tripping
    // uq_tournament_participants_user (23505). Convert that race to the same
    // friendly duplicate outcome instead of letting it surface as a 500.
    if (error instanceof Error && "code" in error && error.code === "23505") {
      const existingSpot = await repos.tournaments.findParticipantByUser(
        participant.tournamentId,
        userId,
      );
      if (existingSpot) {
        const entryId = await repos.deckCheck.findEntryIdByParticipant(existingSpot.id);
        return {
          status: "duplicate",
          tournamentId: participant.tournamentId,
          entryId: entryId ?? null,
        };
      }
    }
    throw error;
  }
  if (linked) {
    const entryId = await repos.deckCheck.findEntryIdByParticipant(linked.id);
    return { status: "claimed", tournamentId: linked.tournamentId, entryId: entryId ?? null };
  }
  const fresh = await repos.tournaments.findParticipantByClaimToken(token);
  if (fresh?.userId === userId) {
    const entryId = await repos.deckCheck.findEntryIdByParticipant(fresh.id);
    return { status: "already", tournamentId: fresh.tournamentId, entryId: entryId ?? null };
  }
  if (fresh && fresh.userId === null && fresh.claimBlockedAt !== null) {
    return { status: "blocked", tournamentId: null, entryId: null };
  }
  return { status: "conflict", tournamentId: null, entryId: null };
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

  const mainLines = lines.filter((line) => line.zone === WellKnown.deckZone.MAIN);
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
      lines.push({ name: cardCode, zone: WellKnown.deckZone.MAIN, quantity: count });
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
  allowDeckPublishing?: boolean;
  allowNameSharing?: boolean;
  allowRiotIdSharing?: boolean;
}

/**
 * The consent columns a submission actually states, for spreading into an
 * entry update.
 * @returns A patch containing only the flags the player answered.
 */
function consentPatch(consent: PlayerSharingConsent): Partial<{
  allowDeckPublishing: boolean;
  allowNameSharing: boolean;
  allowRiotIdSharing: boolean;
}> {
  return {
    ...(consent.allowDeckPublishing === undefined
      ? {}
      : { allowDeckPublishing: consent.allowDeckPublishing }),
    ...(consent.allowNameSharing === undefined
      ? {}
      : { allowNameSharing: consent.allowNameSharing }),
    ...(consent.allowRiotIdSharing === undefined
      ? {}
      : { allowRiotIdSharing: consent.allowRiotIdSharing }),
  };
}

/**
 * Replaces an entry's card lines with the player's list and recomputes the
 * content hash. The caller guards that the entry is `editable` (ADR-027) —
 * this never touches the state; the diff against the judge's baseline is
 * computed when the player submits. An unchanged list is idempotent (but
 * still records a changed sharing consent).
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
  if (entry.contentHash === contentHash) {
    const patch = consentPatch(consent);
    if (Object.keys(patch).length > 0) {
      const updated = await repos.deckCheck.updateEntry(entry.id, patch);
      return updated ?? entry;
    }
    return entry;
  }
  const updated = await repos.deckCheck.updateEntry(entry.id, {
    contentHash,
    ...consentPatch(consent),
  });
  await repos.deckCheck.replaceEntryCards(entry.id, cardRows);
  return updated ?? entry;
}

/**
 * Creates a fresh self-submitted entry (ADR-026): born linked and `submitted`
 * (the token link is an explicit send-for-review, ADR-027), keyed
 * `openrift:<userId>` so a re-submission upserts the same entry, with the
 * player fields populated from the account.
 * @returns The created entry.
 */
export async function createSelfSubmittedEntry(
  repos: Repos,
  event: DeckCheckEvent,
  account: { id: string; name: string | null; email: string; riotId: string | null },
  lines: DeckCheckCardLine[],
  cardRows: NewDeckCheckEntryCard[],
  consent: PlayerSharingConsent = {},
): Promise<DeckCheckEntry> {
  // Attach to the account's existing entrant, or create one, born linked to the
  // account either way (ADR-033).
  const participant = await repos.tournaments.resolveOrCreateParticipant({
    tournamentId: event.id,
    userId: account.id,
    // The profile's free-text Riot ID (ADR-028), snapshotted at submission.
    riotId: account.riotId,
    displayName: account.name?.trim() || account.email,
    claimSource: "self_submit",
    claimedAt: new Date(),
    // A stranger submitting through the open link lands in the approval queue,
    // not straight on the roster (ADR-033 decisions 18/19). An already-rostered
    // caller is matched by account above and keeps their existing status.
    status: "requested",
  });
  const entry = await repos.deckCheck.createEntry({
    tournamentId: event.id,
    participantId: participant.id,
    externalId: `${SELF_SUBMIT_EXTERNAL_ID_PREFIX}${account.id}`,
    submittedAt: new Date(),
    ...consentPatch(consent),
    contentHash: sha256(buildContentHashInput(lines)),
    withdrawnAt: null,
    state: "submitted",
  });
  await repos.deckCheck.replaceEntryCards(entry.id, cardRows);
  return entry;
}
