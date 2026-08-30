import type { MetaSubmissionInput, Printing } from "@openrift/shared";

import type { DeckMatchedEntry } from "@/lib/deck-import-matcher";
import { matchDeckEntries } from "@/lib/deck-import-matcher";
import { parseDeckImportAuto } from "@/lib/deck-import-parsers";
import type { MetaSubmissionCompleteness } from "@/lib/meta-submission-copy";

/**
 * Draft shapes and validation for the meta archive's decklist submission form
 * (ADR-014's User submissions).
 *
 * Every field is held as a string while it is being edited, so the bounds below
 * mirror `metaSubmissionInputSchema` and the service's own `validateMetaSubmission`.
 * The point is to name the problem next to the field instead of surfacing a 400
 * with a server sentence in it.
 */

/** The submission form's fields, as edited. */
export interface MetaSubmissionDraft {
  playerName: string;
  /** Where the player finished, as a positive whole number. */
  rank: string;
  /** True when the source only published a cut bucket, so `rank` prints as "T8". */
  rankIsTier: boolean;
  /** The match record, one box each. Blank means the submitter does not know it. */
  wins: string;
  losses: string;
  draws: string;
  listStatus: MetaSubmissionCompleteness;
  note: string;
  /** The pasted decklist, in any format the import box accepts. */
  deckText: string;
  /** Set only while proposing an event the archive does not have. */
  eventName: string;
  eventDate: string;
  eventFormat: string;
  eventPlayerCount: string;
  eventOrganizer: string;
  eventSourceUrl: string;
}

/** A blank submission form. */
export const EMPTY_META_SUBMISSION_DRAFT: MetaSubmissionDraft = {
  playerName: "",
  rank: "1",
  rankIsTier: false,
  wins: "",
  losses: "",
  draws: "",
  listStatus: "full",
  note: "",
  deckText: "",
  eventName: "",
  eventDate: "",
  eventFormat: "",
  eventPlayerCount: "",
  eventOrganizer: "",
  eventSourceUrl: "",
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const WHOLE_NUMBER_PATTERN = /^\d+$/u;

/** @returns True when a record box is blank or holds a whole number. */
function isRecordPart(value: string): boolean {
  const trimmed = value.trim();
  return trimmed === "" || WHOLE_NUMBER_PATTERN.test(trimmed);
}

/** @returns The box's number, or null when it was left blank. */
function recordPart(value: string): number | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : Number(trimmed);
}

/** One card line, in the shape the submission endpoint takes. */
export interface MetaSubmissionCardLine {
  name: string;
  zone: string;
  quantity: number;
}

/** What one paste turned into, and everything about it worth showing back. */
export interface MetaSubmissionParsedList {
  /** The lines to send, summed per card and zone. */
  cards: MetaSubmissionCardLine[];
  /** Lines the catalog could not place, in the words the submitter wrote. */
  unmatched: string[];
  /** Lines the catalog read as a different card than the one written. */
  reinterpreted: { source: string; matched: string }[];
  /** Complaints from the format parser itself (bad quantities, stray lines). */
  warnings: string[];
}

/**
 * What one parsed entry was written as, for a message pointing back at the
 * submitter's own text.
 *
 * @param entry The matched entry.
 * @returns The card name, short code, or a placeholder when the line had neither.
 */
function sourceLabel(entry: DeckMatchedEntry): string {
  return entry.entry.cardName ?? entry.entry.shortCode ?? "(unnamed line)";
}

/**
 * Turns matched import entries into the endpoint's card lines.
 *
 * Names, not ids: the server resolves them through the same alias index the
 * provider uploads use, so a spelling the catalog already knows links exactly as
 * a scrape of the same list would. An entry the local catalog could not place
 * still travels, under the words the submitter wrote — the server's index may
 * know an alias this one does not, and if it does not either, the name comes
 * back in `unresolvedNames` where the submitter can fix it.
 *
 * @param matched The entries as matched against the catalog.
 * @returns The card lines, summed per card name and zone.
 */
function metaSubmissionCardsFromMatches(
  matched: readonly DeckMatchedEntry[],
): MetaSubmissionCardLine[] {
  const lines = new Map<string, MetaSubmissionCardLine>();
  for (const entry of matched) {
    const name = entry.resolvedCard?.cardName ?? sourceLabel(entry);
    const key = `${name}::${entry.zone}`;
    const existing = lines.get(key);
    if (existing) {
      existing.quantity += entry.entry.quantity;
    } else {
      lines.set(key, { name, zone: entry.zone, quantity: entry.entry.quantity });
    }
  }
  return [...lines.values()];
}

/**
 * Parses a pasted decklist and matches it against the catalog, in one step.
 * Accepts everything the import box does: a deck code, a TTS string, or a plain
 * text list with zone headers.
 *
 * @param text The pasted decklist.
 * @param allPrintings The catalog, for name and short-code resolution.
 * @returns The card lines to send, plus what the reader could not place.
 */
export function parseMetaSubmissionList(
  text: string,
  allPrintings: Printing[],
): MetaSubmissionParsedList {
  const { entries, warnings } = parseDeckImportAuto(text.trim());
  const matched = matchDeckEntries(entries, allPrintings);
  const unmatched: string[] = [];
  const reinterpreted: { source: string; matched: string }[] = [];
  for (const entry of matched) {
    const resolved = entry.resolvedCard;
    if (!resolved) {
      unmatched.push(sourceLabel(entry));
      continue;
    }
    if (entry.status === "needs-review") {
      reinterpreted.push({ source: sourceLabel(entry), matched: resolved.cardName });
    }
  }
  return { cards: metaSubmissionCardsFromMatches(matched), unmatched, reinterpreted, warnings };
}

/**
 * Checks a submission draft against the bounds the contract and the service
 * both enforce.
 *
 * @param draft The form's current values.
 * @param options.proposing Whether the event fields are in play.
 * @param options.cardCount How many card lines the paste produced.
 * @returns The first problem found, or null when the draft is ready to send.
 */
export function validateMetaSubmissionDraft(
  draft: MetaSubmissionDraft,
  options: { proposing: boolean; cardCount: number },
): string | null {
  const playerName = draft.playerName.trim();
  if (playerName.length === 0 || playerName.length > 80) {
    return "Enter the player's name (80 characters or fewer).";
  }
  const rank = draft.rank.trim();
  if (!WHOLE_NUMBER_PATTERN.test(rank) || Number(rank) < 1) {
    return "Enter where the player finished, as a number.";
  }
  if (!isRecordPart(draft.wins) || !isRecordPart(draft.losses) || !isRecordPart(draft.draws)) {
    return "A match record is whole numbers of wins, losses, and draws.";
  }
  // The archive derives "5-1" from the two, so one without the other would
  // display as nothing and quietly lose what was typed.
  if ((draft.wins.trim() === "") !== (draft.losses.trim() === "")) {
    return "A match record needs both wins and losses, or neither.";
  }
  if (draft.note.trim().length > 2000) {
    return "The note must be 2000 characters or fewer.";
  }
  if (options.cardCount === 0) {
    return "Paste the decklist, then check it, before sending.";
  }
  if (options.cardCount > 200) {
    return "That is more than 200 different lines. Send the deck without its sideboard.";
  }
  if (!options.proposing) {
    return null;
  }

  const eventName = draft.eventName.trim();
  if (eventName.length === 0 || eventName.length > 120) {
    return "Enter the tournament's name (120 characters or fewer).";
  }
  if (!ISO_DATE_PATTERN.test(draft.eventDate.trim())) {
    return "Pick the day the tournament was played.";
  }
  if (draft.eventFormat.trim().length === 0) {
    return "Pick the format that was played.";
  }
  const players = draft.eventPlayerCount.trim();
  if (players.length > 0 && (!WHOLE_NUMBER_PATTERN.test(players) || Number(players) < 1)) {
    return "The number of players must be a whole number of at least 1.";
  }
  if (draft.eventOrganizer.trim().length > 120) {
    return "The organizer must be 120 characters or fewer.";
  }
  const sourceUrl = draft.eventSourceUrl.trim();
  if (sourceUrl.length > 2000) {
    return "The results link must be 2000 characters or fewer.";
  }
  return null;
}

/**
 * Builds the request body from a validated draft.
 *
 * Exactly one of `metaEventId` and `proposedEvent` is set: the contract, the
 * service, and `candidate_meta_players`' CHECK all say the same thing, so the
 * branch is made here once rather than at the call site.
 *
 * @param draft The validated form values.
 * @param cards The card lines from the last successful check.
 * @param target The archived event this targets, or null while proposing one.
 * @returns The submission body.
 */
export function buildMetaSubmissionInput(
  draft: MetaSubmissionDraft,
  cards: MetaSubmissionCardLine[],
  target: { metaEventId: string } | null,
): MetaSubmissionInput {
  const players = draft.eventPlayerCount.trim();
  const organizer = draft.eventOrganizer.trim();
  const sourceUrl = draft.eventSourceUrl.trim();
  const proposedEvent = target
    ? null
    : {
        name: draft.eventName.trim(),
        eventDate: draft.eventDate.trim(),
        format: draft.eventFormat.trim(),
        playerCount: players.length > 0 ? Number(players) : null,
        organizer: organizer.length > 0 ? organizer : null,
        sourceUrl: sourceUrl.length > 0 ? sourceUrl : null,
      };

  return {
    metaEventId: target?.metaEventId ?? null,
    proposedEvent,
    playerName: draft.playerName.trim(),
    rank: Number(draft.rank.trim()),
    rankIsTier: draft.rankIsTier,
    wins: recordPart(draft.wins),
    losses: recordPart(draft.losses),
    draws: recordPart(draft.draws),
    listStatus: draft.listStatus,
    cards,
    note: draft.note.trim() || null,
  };
}
