import type { AdminMetaDeck, AdminMetaEvent, MetaListStatus } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";

import type { ImportedDeckCard } from "@/lib/deck-import-cards";

// Draft shapes and validation for the /admin/meta curation forms (ADR-014).
// Every field is held as a string while it is being edited, so the bounds below
// mirror the ones `packages/shared/src/contracts/admin/meta.ts` enforces — the
// point is to name the problem in the form instead of surfacing a 400.

/** Slugs the public `/meta` route space spends on its own pages. */
const RESERVED_META_EVENT_SLUGS = ["decks", "events", "stats", "new", "admin"];

const EVENT_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{2,49}$/u;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const WHOLE_NUMBER_PATTERN = /^\d+$/u;

/** The event form's fields, as edited. */
export interface MetaEventDraft {
  slug: string;
  name: string;
  eventDate: string;
  format: string;
  playerCount: string;
  organizer: string;
  sourceUrl: string;
  notes: string;
}

/** A blank event form. */
export const EMPTY_META_EVENT_DRAFT: MetaEventDraft = {
  slug: "",
  name: "",
  eventDate: "",
  format: "",
  playerCount: "",
  organizer: "",
  sourceUrl: "",
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
  if (draft.sourceUrl.trim().length > 2000) {
    return "Source URL must be 2000 characters or fewer";
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
  playerCount: number | null;
  organizer: string | null;
  sourceUrl: string | null;
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
    playerCount: players.length > 0 ? Number(players) : null,
    organizer: draft.organizer.trim() || null,
    sourceUrl: draft.sourceUrl.trim() || null,
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
    playerCount: event.playerCount === null ? "" : String(event.playerCount),
    organizer: event.organizer ?? "",
    sourceUrl: event.sourceUrl ?? "",
    notes: event.notes ?? "",
  };
}

/**
 * The deck form's metadata fields, as edited. A pasted card list is held
 * separately, but an archetype-only entry has no list to paste: its two cards
 * are picked from the catalog, so those picks live on the draft.
 */
export interface MetaDeckDraft {
  name: string;
  format: string;
  playerName: string;
  finishTier: string;
  record: string;
  listStatus: MetaListStatus;
  /** Archetype only: the legend the source named. Required for that status. */
  legendCardId: string | null;
  /** Archetype only: the champion, where the source named one. */
  championCardId: string | null;
}

/** Finish tiers offered as one-click choices; any positive value can be typed. */
export const FINISH_TIER_PRESETS = [1, 2, 3, 4, 8, 16, 32, 64];

/**
 * Reads the finish-tier field.
 *
 * @param value - The raw field text.
 * @returns The tier, or null when it is not a positive whole number.
 */
export function metaDeckFinishTier(value: string): number | null {
  const trimmed = value.trim();
  if (!WHOLE_NUMBER_PATTERN.test(trimmed)) {
    return null;
  }
  const tier = Number(trimmed);
  if (tier < 1) {
    return null;
  }
  return tier;
}

/**
 * Checks a deck draft against the contract's bounds.
 *
 * @param draft - The deck form's current values.
 * @param requireCards - Whether the save must carry a card list. True when
 *   archiving a new deck; false when editing a stored one, whose cards stay put
 *   unless the form supplies replacements.
 * @returns The first problem found, or null when the draft is valid.
 */
export function validateMetaDeckDraft(draft: MetaDeckDraft, requireCards = true): string | null {
  const name = draft.name.trim();
  if (name.length === 0 || name.length > 200) {
    return "Deck name is required and must be 200 characters or fewer";
  }
  if (draft.format.trim().length === 0) {
    return "Format is required";
  }
  const player = draft.playerName.trim();
  if (player.length === 0 || player.length > 80) {
    return "Player name is required and must be 80 characters or fewer";
  }
  if (metaDeckFinishTier(draft.finishTier) === null) {
    return "Finish must be a positive whole number";
  }
  if (draft.record.trim().length > 20) {
    return "Record must be 20 characters or fewer";
  }
  if (requireCards && draft.listStatus === "archetype" && draft.legendCardId === null) {
    return "Pick the legend. An archetype-only entry is filed under it, so there is nothing to archive without one";
  }
  return null;
}

/**
 * The card rows an archetype-only entry saves: the legend the archive files it
 * under, plus the champion when the source named one. There is no list to
 * paste, so this is the whole card payload.
 *
 * @param draft - A draft whose `listStatus` is `"archetype"`.
 * @returns The rows to send, or an empty list when no legend is picked yet.
 */
export function metaDeckArchetypeCards(draft: MetaDeckDraft): ImportedDeckCard[] {
  if (draft.legendCardId === null) {
    return [];
  }
  const cards: ImportedDeckCard[] = [
    {
      cardId: draft.legendCardId,
      zone: WellKnown.deckZone.LEGEND,
      quantity: 1,
      preferredPrintingId: null,
    },
  ];
  if (draft.championCardId !== null) {
    cards.push({
      cardId: draft.championCardId,
      zone: WellKnown.deckZone.CHAMPION,
      quantity: 1,
      preferredPrintingId: null,
    });
  }
  return cards;
}

/**
 * Loads a stored deck back into the form. The card picks start empty even for
 * an archetype: the stored rows are only replaced when something new is picked,
 * exactly as the paste flow only replaces the list when something is pasted.
 *
 * @param deck - The archived deck to edit.
 * @returns The draft the edit dialog starts from.
 */
export function metaDeckToDraft(deck: AdminMetaDeck): MetaDeckDraft {
  return {
    name: deck.name,
    format: deck.format,
    playerName: deck.playerName,
    finishTier: String(deck.finishTier),
    record: deck.record ?? "",
    listStatus: deck.listStatus,
    legendCardId: null,
    championCardId: null,
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
