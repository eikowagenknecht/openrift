import type { MetaDeckSubmissionInput, MetaListStatus, Printing } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";

import type { DeckMatchedEntry } from "@/lib/deck-import-matcher";
import { matchDeckEntries } from "@/lib/deck-import-matcher";
import { parseDeckImportAuto } from "@/lib/deck-import-parsers";

/**
 * Draft shapes and validation for the meta archive's decklist submission form
 * (ADR-014's User submissions).
 *
 * Every field is held as a string while it is being edited, so the bounds below
 * mirror `metaDeckSubmissionInputSchema` and the service's own `validateMetaSubmission`.
 * The point is to name the problem next to the field instead of surfacing a 400
 * with a server sentence in it.
 */

/** The submission form's fields, as edited. */
export interface MetaSubmissionDraft {
  playerName: string;
  /** A positive whole number, as typed by the finish picker. */
  finishTier: string;
  record: string;
  listStatus: MetaListStatus;
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
  finishTier: "1",
  record: "",
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
  const finish = draft.finishTier.trim();
  if (!WHOLE_NUMBER_PATTERN.test(finish) || Number(finish) < 1) {
    return "Pick where the player finished.";
  }
  if (draft.record.trim().length > 20) {
    return "The record must be 20 characters or fewer.";
  }
  if (draft.note.trim().length > 2000) {
    return "The note must be 2000 characters or fewer.";
  }
  if (options.cardCount === 0) {
    return draft.listStatus === "archetype"
      ? "Paste the legend, then check it, before sending."
      : "Paste the decklist, then check it, before sending.";
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
 * Exactly one of `metaEventId` and `proposedEvent` is set — the contract, the
 * service, and `candidate_meta_decks`' CHECK all say the same thing, so the
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
): MetaDeckSubmissionInput {
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
    finishTier: Number(draft.finishTier.trim()),
    record: draft.record.trim() || null,
    listStatus: draft.listStatus,
    cards,
    note: draft.note.trim() || null,
  };
}

/**
 * The finishes the picker offers. The wire accepts any positive integer, but a
 * free-text box invites "top8" and "2nd", and every real source publishes one of
 * these buckets.
 */
export const META_SUBMISSION_FINISH_TIERS = [1, 2, 3, 4, 8, 16, 32, 64] as const;

/**
 * A deck's legend zone, which an archetype-only entry has to carry — the legend
 * is the archive's grouping axis, so an entry filed under none is not worth
 * having (ADR-014).
 */
const LEGEND_ZONE: string = WellKnown.deckZone.LEGEND;

/**
 * Whether an archetype-only submission names its legend. The server refuses one
 * that does not, so the form says so before sending rather than after.
 *
 * @param cards The card lines from the last successful check.
 * @returns True when at least one line sits in the legend zone.
 */
export function hasLegendLine(cards: readonly MetaSubmissionCardLine[]): boolean {
  return cards.some((card) => card.zone === LEGEND_ZONE);
}
