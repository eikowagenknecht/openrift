import { RESERVED_META_EVENT_SLUGS } from "@openrift/shared/contracts/admin/meta";
import type { AdminMetaEvent, AdminMetaPlayer } from "@openrift/shared/types/api/meta";
import type {
  MetaEventOverlayField,
  MetaEventTier,
  MetaListStatus,
} from "@openrift/shared/types/enums";
import { META_EVENT_OVERLAY_FIELDS } from "@openrift/shared/types/enums";

import type { ImportedDeckCard } from "@/features/decks/lib/deck-import-cards";

const EVENT_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{2,49}$/u;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const WHOLE_NUMBER_PATTERN = /^\d+$/u;
const COUNTRY_PATTERN = /^[A-Za-z]{2}$/u;

export interface MetaEventDraft {
  slug: string;
  name: string;
  eventDate: string;
  format: string;
  tier: MetaEventTier;
  playerCount: string;
  organizer: string;
  country: string;
  location: string;
  notes: string;
}

export const EMPTY_META_EVENT_DRAFT: MetaEventDraft = {
  slug: "",
  name: "",
  eventDate: "",
  format: "",
  tier: "local",
  playerCount: "",
  organizer: "",
  country: "",
  location: "",
  notes: "",
};

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

/** Blank optional fields go out as null, not omitted, so clearing one actually clears it. */
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

export interface MetaEventOverlayEdit {
  field: MetaEventOverlayField;
  value: string | null;
}

const OVERLAY_EDIT_VALUES: Record<
  MetaEventOverlayField,
  (event: Pick<MetaEventBody, MetaEventOverlayField>) => string | null
> = {
  name: (event) => event.name,
  eventDate: (event) => event.eventDate,
  format: (event) => event.format,
  playerCount: (event) => (event.playerCount === null ? null : String(event.playerCount)),
  organizer: (event) => event.organizer,
  notes: (event) => event.notes,
  tier: (event) => event.tier,
  country: (event) => event.country,
  location: (event) => event.location,
};

/** Only fields that changed are sent. The slug isn't here: it's renamed via `updateEvent`. */
export function metaEventOverlayEdits(
  event: AdminMetaEvent,
  body: MetaEventBody,
): MetaEventOverlayEdit[] {
  const edits: MetaEventOverlayEdit[] = [];
  for (const field of META_EVENT_OVERLAY_FIELDS) {
    const next = OVERLAY_EDIT_VALUES[field](body);
    if (next !== OVERLAY_EDIT_VALUES[field](event)) {
      edits.push({ field, value: next });
    }
  }
  return edits;
}

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

export interface MetaPlayerDraft {
  playerName: string;
  rank: string;
  rankIsTier: boolean;
  wins: string;
  losses: string;
  draws: string;
  legendCardId: string | null;
  championCardId: string | null;
  listStatus: MetaListStatus;
  deckName: string;
  deckFormat: string;
}

export const RANK_PRESETS = [1, 2, 3, 4, 8, 16, 32, 64];

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

export function metaPlayerRecordPart(value: string): number | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : Number(trimmed);
}

function isRecordPart(value: string): boolean {
  const trimmed = value.trim();
  return trimmed === "" || WHOLE_NUMBER_PATTERN.test(trimmed);
}

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

/** The card list starts empty even for a row that has one: it's only replaced by a new paste. */
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
 * Every key is optional: present means claimed, absent means unchanged.
 * Tiebreakers and `entryStatus` are omitted on purpose; the dialog never edits them.
 */
export interface MetaPlayerOverlayFields {
  playerName?: string;
  rank?: number;
  rankIsTier?: boolean;
  wins?: number | null;
  losses?: number | null;
  draws?: number | null;
  legendCardId?: string | null;
  championCardId?: string | null;
}

/** `rank` is skipped when unparseable: the form refuses that draft before this runs. */
export function metaPlayerOverlayFields(
  player: AdminMetaPlayer,
  draft: MetaPlayerDraft,
): MetaPlayerOverlayFields {
  const fields: MetaPlayerOverlayFields = {};
  const playerName = draft.playerName.trim();
  if (playerName !== player.playerName) {
    fields.playerName = playerName;
  }
  const rank = metaPlayerRank(draft.rank);
  if (rank !== null && rank !== player.rank) {
    fields.rank = rank;
  }
  if (draft.rankIsTier !== player.rankIsTier) {
    fields.rankIsTier = draft.rankIsTier;
  }
  const wins = metaPlayerRecordPart(draft.wins);
  if (wins !== player.wins) {
    fields.wins = wins;
  }
  const losses = metaPlayerRecordPart(draft.losses);
  if (losses !== player.losses) {
    fields.losses = losses;
  }
  const draws = metaPlayerRecordPart(draft.draws);
  if (draws !== player.draws) {
    fields.draws = draws;
  }
  if (draft.legendCardId !== player.legendCardId) {
    fields.legendCardId = draft.legendCardId;
  }
  if (draft.championCardId !== player.championCardId) {
    fields.championCardId = draft.championCardId;
  }
  return fields;
}

/** Absent leaves the deck alone, an object claims those cards, null claims there is no list. */
export function metaPlayerOverlayList(
  player: AdminMetaPlayer,
  draft: MetaPlayerDraft,
  cards: readonly ImportedDeckCard[],
): MetaPlayerOverlayListInput | null | undefined {
  if (draft.listStatus === "none") {
    return player.listStatus === "none" ? undefined : null;
  }
  if (cards.length === 0) {
    return undefined;
  }
  return {
    name: draft.deckName.trim(),
    cards: [...cards],
    listStatus: draft.listStatus === "partial" ? "partial" : "full",
  };
}

/** A direct durable write: an overlay claim on the field would drop the name on promotion. */
export function metaPlayerDeckRename(
  player: AdminMetaPlayer,
  draft: MetaPlayerDraft,
  cards: readonly ImportedDeckCard[],
): string | null {
  if (player.listStatus === "none" || draft.listStatus === "none" || cards.length > 0) {
    return null;
  }
  const name = draft.deckName.trim();
  if (name === "" || name === player.deckName) {
    return null;
  }
  return name;
}

export interface MetaPlayerOverlayListInput {
  name: string;
  cards: ImportedDeckCard[];
  listStatus: Exclude<MetaListStatus, "none">;
}

export function summarizeDeckCards(cards: ImportedDeckCard[]): { rows: number; copies: number } {
  return {
    rows: cards.length,
    copies: cards.reduce((sum, card) => sum + card.quantity, 0),
  };
}
