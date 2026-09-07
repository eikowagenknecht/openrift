import { encodeText } from "@openrift/shared/deck-codecs";
import type { MetaSubmissionInput } from "@openrift/shared/types/api/meta";
import type { Printing } from "@openrift/shared/types/catalog";
import type { DeckZone } from "@openrift/shared/types/enums";

import type { DeckMatchedEntry } from "@/lib/deck-import-matcher";
import { matchDeckEntries } from "@/lib/deck-import-matcher";
import { parseDeckImportAuto } from "@/lib/deck-import-parsers";
import type {
  MetaDeckSubmissionKind,
  MetaSubmissionCompleteness,
} from "@/lib/meta-submission-copy";

/**
 * Every field is held as a string while it is being edited. Its bounds
 * mirror `metaSubmissionInputSchema` and `validateMetaSubmission`.
 */
export interface MetaSubmissionDraft {
  kind: MetaDeckSubmissionKind;
  playerName: string;
  rank: string;
  rankIsTier: boolean;
  wins: string;
  losses: string;
  draws: string;
  note: string;
  deckText: string;
  eventName: string;
  eventDate: string;
  eventFormat: string;
  eventPlayerCount: string;
  eventOrganizer: string;
  eventSourceUrl: string;
}

export const EMPTY_META_SUBMISSION_DRAFT: MetaSubmissionDraft = {
  kind: "new_list",
  playerName: "",
  rank: "1",
  rankIsTier: false,
  wins: "",
  losses: "",
  draws: "",
  note: "",
  deckText: "",
  eventName: "",
  eventDate: "",
  eventFormat: "",
  eventPlayerCount: "",
  eventOrganizer: "",
  eventSourceUrl: "",
};

/** Everything is optional: a source with no published records has no counts. */
export interface MetaSubmissionPrefill {
  kind?: MetaDeckSubmissionKind;
  playerName?: string;
  rank?: number;
  rankIsTier?: boolean;
  wins?: number;
  losses?: number;
  draws?: number;
  deckText?: string;
  legendName?: string;
  legendCardId?: string;
}

/** Blank means no count was published, distinct from zero. */
function countField(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

/** A rank of zero or less is dropped: a prefill that arrives invalid would block sending with an error nobody typed. */
export function metaSubmissionDraftFromPrefill(
  prefill: MetaSubmissionPrefill,
): MetaSubmissionDraft {
  const rank = prefill.rank !== undefined && prefill.rank >= 1 ? String(prefill.rank) : undefined;
  const kind = prefill.kind ?? EMPTY_META_SUBMISSION_DRAFT.kind;
  return {
    ...EMPTY_META_SUBMISSION_DRAFT,
    kind,
    playerName: prefill.playerName ?? EMPTY_META_SUBMISSION_DRAFT.playerName,
    rank: rank ?? EMPTY_META_SUBMISSION_DRAFT.rank,
    rankIsTier: prefill.rankIsTier ?? EMPTY_META_SUBMISSION_DRAFT.rankIsTier,
    wins: countField(prefill.wins),
    losses: countField(prefill.losses),
    draws: countField(prefill.draws),
    deckText: prefill.deckText ?? EMPTY_META_SUBMISSION_DRAFT.deckText,
  };
}

/** Uses catalog card names, not display ones: the server's alias index knows a legend by its bare epithet. */
export function metaSubmissionTextFromCards(
  cards: readonly { cardName: string; quantity: number; zone: DeckZone }[],
): string {
  if (cards.length === 0) {
    return "";
  }
  return encodeText(
    cards.map((card) => ({
      cardName: card.cardName,
      quantity: card.quantity,
      zone: card.zone,
    })),
  ).code;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const WHOLE_NUMBER_PATTERN = /^\d+$/u;

function isRecordPart(value: string): boolean {
  const trimmed = value.trim();
  return trimmed === "" || WHOLE_NUMBER_PATTERN.test(trimmed);
}

function recordPart(value: string): number | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : Number(trimmed);
}

interface MetaSubmissionCardLine {
  name: string;
  zone: string;
  quantity: number;
}

export interface MetaSubmissionZoneCounts {
  main: number;
  battlefield: number;
  runes: number;
}

export interface MetaSubmissionParsedList {
  cards: MetaSubmissionCardLine[];
  unmatched: string[];
  reinterpreted: { source: string; matched: string }[];
  warnings: string[];
  zones: MetaSubmissionZoneCounts;
  legend: { cardId: string; cardName: string } | null;
  listStatus: MetaSubmissionCompleteness;
}

export function metaSubmissionListStatus(
  zones: MetaSubmissionZoneCounts,
  legend: MetaSubmissionParsedList["legend"],
): MetaSubmissionCompleteness {
  return legend !== null && zones.battlefield > 0 && zones.runes > 0 ? "full" : "partial";
}

export function metaSubmissionLegendMismatch(
  parsed: Pick<MetaSubmissionParsedList, "legend">,
  rowLegendCardId: string | undefined,
): boolean {
  if (parsed.legend === null || rowLegendCardId === undefined) {
    return false;
  }
  return parsed.legend.cardId !== rowLegendCardId;
}

function sourceLabel(entry: DeckMatchedEntry): string {
  return entry.entry.cardName ?? entry.entry.shortCode ?? "(unnamed line)";
}

/** Sends names, not ids: an unmatched entry still travels under the submitter's own words. */
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

export function parseMetaSubmissionList(
  text: string,
  allPrintings: Printing[],
): MetaSubmissionParsedList {
  const { entries, warnings } = parseDeckImportAuto(text.trim());
  const matched = matchDeckEntries(entries, allPrintings);
  const unmatched: string[] = [];
  const reinterpreted: { source: string; matched: string }[] = [];
  const zones: MetaSubmissionZoneCounts = { main: 0, battlefield: 0, runes: 0 };
  let legend: MetaSubmissionParsedList["legend"] = null;
  for (const entry of matched) {
    const resolved = entry.resolvedCard;
    if (entry.zone === "main" || entry.zone === "battlefield" || entry.zone === "runes") {
      zones[entry.zone] += entry.entry.quantity;
    }
    if (!resolved) {
      unmatched.push(sourceLabel(entry));
      continue;
    }
    if (entry.zone === "legend" && legend === null) {
      legend = { cardId: resolved.cardId, cardName: resolved.cardName };
    }
    if (entry.status === "needs-review") {
      reinterpreted.push({ source: sourceLabel(entry), matched: resolved.cardName });
    }
  }
  return {
    cards: metaSubmissionCardsFromMatches(matched),
    unmatched,
    reinterpreted,
    warnings,
    zones,
    legend,
    listStatus: metaSubmissionListStatus(zones, legend),
  };
}

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
  // A correction disputes what the archive already holds, so the reviewer needs to be told what's wrong with it.
  if (draft.kind === "correction" && draft.note.trim().length === 0) {
    return "Say what's wrong with the list we have, and where the right one came from.";
  }
  if (options.cardCount === 0) {
    return "Paste the decklist before sending.";
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

/** Exactly one of `metaEventId` and `proposedEvent` is set, matching the contract, service, and DB CHECK. */
export function buildMetaSubmissionInput(
  draft: MetaSubmissionDraft,
  list: Pick<MetaSubmissionParsedList, "cards" | "listStatus">,
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
    // A proposal is a tournament the archive has never seen, so there is
    // nothing there to complete or correct whatever link got the sender here.
    kind: proposedEvent === null ? draft.kind : "new_list",
    playerName: draft.playerName.trim(),
    rank: Number(draft.rank.trim()),
    rankIsTier: draft.rankIsTier,
    wins: recordPart(draft.wins),
    losses: recordPart(draft.losses),
    draws: recordPart(draft.draws),
    listStatus: list.listStatus,
    cards: list.cards,
    note: draft.note.trim() || null,
  };
}
