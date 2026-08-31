import type {
  AdminMetaEvent,
  AdminMetaPlayer,
  MetaEventTier,
  MetaListStatus,
} from "@openrift/shared";
import { RESERVED_META_EVENT_SLUGS } from "@openrift/shared/contracts/admin/meta";

import type { ImportedDeckCard } from "@/lib/deck-import-cards";

// Draft shapes and validation for the /admin/meta curation forms (ADR-014).
// Every field is held as a string while it is being edited, so the bounds below
// mirror the ones `packages/shared/src/contracts/admin/meta.ts` enforces — the
// point is to name the problem in the form instead of surfacing a 400.

const EVENT_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{2,49}$/u;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const WHOLE_NUMBER_PATTERN = /^\d+$/u;
const COUNTRY_PATTERN = /^[A-Za-z]{2}$/u;

/** The event form's fields, as edited. */
export interface MetaEventDraft {
  slug: string;
  name: string;
  eventDate: string;
  format: string;
  tier: MetaEventTier;
  playerCount: string;
  organizer: string;
  /** Two ISO letters, or blank for unknown. */
  country: string;
  location: string;
  notes: string;
}

/** A blank event form. */
export const EMPTY_META_EVENT_DRAFT: MetaEventDraft = {
  slug: "",
  name: "",
  eventDate: "",
  format: "",
  tier: "store",
  playerCount: "",
  organizer: "",
  country: "",
  location: "",
  notes: "",
};

/**
 * Checks an event draft against the contract's bounds.
 *
 * @param draft - The event form's current values.
 * @returns The first problem found, or null when the draft is valid.
 */
export function validateMetaEventDraft(draft: MetaEventDraft): string | null {
  const slug = draft.slug.trim();
  if (!EVENT_SLUG_PATTERN.test(slug)) {
    return "Slug must be 3-50 characters: lowercase letters, digits, or hyphens, starting with a letter or digit";
  }
  if (RESERVED_META_EVENT_SLUGS.includes(slug)) {
    return `Reserved slug. Already taken: ${RESERVED_META_EVENT_SLUGS.join(", ")}`;
  }
  const name = draft.name.trim();
  if (name.length === 0 || name.length > 120) {
    return "Name is required and must be 120 characters or fewer";
  }
  if (!ISO_DATE_PATTERN.test(draft.eventDate.trim())) {
    return "Date must be a calendar date (YYYY-MM-DD)";
  }
  if (draft.format.trim().length === 0) {
    return "Format is required";
  }
  const players = draft.playerCount.trim();
  if (players.length > 0 && (!WHOLE_NUMBER_PATTERN.test(players) || Number(players) < 1)) {
    return "Player count must be a whole number of at least 1";
  }
  if (draft.organizer.trim().length > 120) {
    return "Organizer must be 120 characters or fewer";
  }
  const country = draft.country.trim();
  if (country.length > 0 && !COUNTRY_PATTERN.test(country)) {
    return "Country must be a two-letter code (e.g. DE), or blank";
  }
  if (draft.location.trim().length > 500) {
    return "Address must be 500 characters or fewer";
  }
  if (draft.notes.trim().length > 4000) {
    return "Notes must be 4000 characters or fewer";
  }
  return null;
}

/** The event body both `createEvent` and `updateEvent` accept. */
export interface MetaEventBody {
  slug: string;
  name: string;
  eventDate: string;
  format: string;
  tier: MetaEventTier;
  playerCount: number | null;
  organizer: string | null;
  country: string | null;
  location: string | null;
  notes: string | null;
}

/**
 * Converts a validated draft into a request body. Blank optional fields go out
 * as null rather than being omitted, so clearing one in the edit form actually
 * clears the stored value.
 *
 * @param draft - The event form's current values.
 * @returns The request body for the create or update endpoint.
 */
export function metaEventDraftToBody(draft: MetaEventDraft): MetaEventBody {
  const players = draft.playerCount.trim();
  return {
    slug: draft.slug.trim(),
    name: draft.name.trim(),
    eventDate: draft.eventDate.trim(),
    format: draft.format.trim(),
    tier: draft.tier,
    playerCount: players.length > 0 ? Number(players) : null,
    organizer: draft.organizer.trim() || null,
    country: draft.country.trim().toUpperCase() || null,
    location: draft.location.trim() || null,
    notes: draft.notes.trim() || null,
  };
}

/**
 * Loads a stored event back into the form.
 *
 * @param event - The event row to edit.
 * @returns The draft the edit dialog starts from.
 */
export function metaEventToDraft(event: AdminMetaEvent): MetaEventDraft {
  return {
    slug: event.slug,
    name: event.name,
    eventDate: event.eventDate,
    format: event.format,
    tier: event.tier,
    playerCount: event.playerCount === null ? "" : String(event.playerCount),
    organizer: event.organizer ?? "",
    country: event.country ?? "",
    location: event.location ?? "",
    notes: event.notes ?? "",
  };
}

/**
 * The standings-row form's fields, as edited. The unit of curation is the player,
 * so the decklist fields only come into play once `listStatus` says there is
 * one — most of a real event's field is standings and a legend.
 */
export interface MetaPlayerDraft {
  playerName: string;
  /** Where the player finished, as a positive whole number. */
  rank: string;
  /** True when the source published a cut bucket, so `rank` prints as "T8". */
  rankIsTier: boolean;
  wins: string;
  losses: string;
  draws: string;
  /**
   * The legend the player played. Set for nearly every entry whether or not a
   * list was published, and what the archive names a deckless row by. A pasted
   * list overrides it from its own legend zone.
   */
  legendCardId: string | null;
  championCardId: string | null;
  /** `"none"` files a standings-only row; the other two carry a decklist. */
  listStatus: MetaListStatus;
  /** Only in play while `listStatus` is not `"none"`. */
  deckName: string;
  deckFormat: string;
}

/** Ranks offered as one-click choices; any positive value can be typed. */
export const RANK_PRESETS = [1, 2, 3, 4, 8, 16, 32, 64];

/**
 * Reads the rank field.
 *
 * @param value - The raw field text.
 * @returns The rank, or null when it is not a positive whole number.
 */
export function metaPlayerRank(value: string): number | null {
  const trimmed = value.trim();
  if (!WHOLE_NUMBER_PATTERN.test(trimmed)) {
    return null;
  }
  const rank = Number(trimmed);
  if (rank < 1) {
    return null;
  }
  return rank;
}

/** @returns The box's number, or null when it was left blank. */
export function metaPlayerRecordPart(value: string): number | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : Number(trimmed);
}

/** @returns True when a record box is blank or holds a whole number. */
function isRecordPart(value: string): boolean {
  const trimmed = value.trim();
  return trimmed === "" || WHOLE_NUMBER_PATTERN.test(trimmed);
}

/**
 * Checks a standings-row draft against the contract's bounds.
 *
 * @param draft - The form's current values.
 * @returns The first problem found, or null when the draft is valid.
 */
export function validateMetaPlayerDraft(draft: MetaPlayerDraft): string | null {
  const player = draft.playerName.trim();
  if (player.length === 0 || player.length > 80) {
    return "Player name is required and must be 80 characters or fewer";
  }
  if (metaPlayerRank(draft.rank) === null) {
    return "Finish must be a positive whole number";
  }
  if (!isRecordPart(draft.wins) || !isRecordPart(draft.losses) || !isRecordPart(draft.draws)) {
    return "Wins, losses, and draws must be whole numbers";
  }
  // The archive derives "5-1" from the two, so one without the other would
  // display as nothing and quietly lose what was typed.
  if ((draft.wins.trim() === "") !== (draft.losses.trim() === "")) {
    return "Enter both wins and losses, or neither";
  }
  if (draft.listStatus === "none") {
    return null;
  }
  const deckName = draft.deckName.trim();
  if (deckName.length === 0 || deckName.length > 200) {
    return "Deck name is required and must be 200 characters or fewer";
  }
  if (draft.deckFormat.trim().length === 0) {
    return "Format is required";
  }
  return null;
}

/**
 * Loads a stored standings row back into the form. The card list starts empty
 * even for a row that has one: the stored cards are only replaced when something
 * new is pasted.
 *
 * @param player - The standings row to edit.
 * @param eventFormat - The event's format, for a row whose deck has none yet.
 * @returns The draft the edit dialog starts from.
 */
export function metaPlayerToDraft(player: AdminMetaPlayer, eventFormat: string): MetaPlayerDraft {
  return {
    playerName: player.playerName,
    rank: String(player.rank),
    rankIsTier: player.rankIsTier,
    wins: player.wins === null ? "" : String(player.wins),
    losses: player.losses === null ? "" : String(player.losses),
    draws: player.draws === null ? "" : String(player.draws),
    legendCardId: player.legendCardId,
    championCardId: player.championCardId,
    listStatus: player.listStatus,
    deckName: player.deckName ?? "",
    deckFormat: player.deckFormat ?? eventFormat,
  };
}

/**
 * Counts a parsed card list for the form's "42 copies across 18 rows" note.
 *
 * @param cards - The deduped rows the save would send.
 * @returns The number of rows and the total number of copies.
 */
export function summarizeDeckCards(cards: ImportedDeckCard[]): { rows: number; copies: number } {
  return {
    rows: cards.length,
    copies: cards.reduce((sum, card) => sum + card.quantity, 0),
  };
}
