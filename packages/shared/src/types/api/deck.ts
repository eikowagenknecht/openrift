import type { CardType, DeckFormat, DeckZone, Domain, SuperType } from "../enums.js";

/**
 * Per-deck format config payload (`decks.format_config` jsonb). Each format
 * reads only the keys it cares about. The interface is concrete (not a
 * generic `Record`) so TanStack server-fn typing can preserve inference
 * through the response types — add a new optional key here when a new
 * format needs its own per-deck setting.
 */
export interface DeckFormatConfig {
  /**
   * Custom-Region: chosen `custom_tags.slug` values (category=`region`).
   * A card is legal if it carries any one of these (OR-match), so a deck
   * locked to ["bandle-city", "neutral"] accepts cards tagged with either.
   */
  tagSlugs?: string[];
}

export interface DeckListResponse {
  items: DeckListItemResponse[];
}

/** Slimmed-down deck fields for the list view (no isWanted/isPublic/shareToken/description). */
export interface DeckSummaryResponse {
  id: string;
  name: string;
  format: DeckFormat;
  /**
   * Per-deck format config; shape owned by each format. `null` means no
   * config (constructed/freeform) or "config required but not yet picked"
   * (e.g. Custom-Region deck before a region is set).
   */
  formatConfig: DeckFormatConfig | null;
  isPinned: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeckListItemResponse {
  deck: DeckSummaryResponse;
  legendCardId: string | null;
  championCardId: string | null;
  totalCards: number;
  typeCounts: { cardType: CardType; count: number }[];
  domainDistribution: { domain: Domain; count: number }[];
  isValid: boolean;
  totalValueCents: number | null;
}

export interface DeckAvailabilityResponse {
  items: DeckAvailabilityItemResponse[];
}

export interface DeckResponse {
  id: string;
  name: string;
  description: string | null;
  format: DeckFormat;
  /** See {@link DeckSummaryResponse.formatConfig}. */
  formatConfig: DeckFormatConfig | null;
  isWanted: boolean;
  isPublic: boolean;
  shareToken: string | null;
  isPinned: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeckCardResponse {
  cardId: string;
  zone: DeckZone;
  quantity: number;
  /** Optional pin to a specific printing for display. Null means "default art". */
  preferredPrintingId: string | null;
}

export interface DeckDetailResponse {
  deck: DeckResponse;
  cards: DeckCardResponse[];
}

/**
 * Deck-cards full-replace response (ADR-027 step 2): the saved cards plus the
 * Postgres transaction id of the write, so the client can await the change on
 * the Electric stream.
 */
export interface DeckCardsWriteResponse {
  cards: DeckCardResponse[];
  txid: number;
}

/**
 * Response for the row-level deck-card apply endpoint: the Postgres
 * transaction id of the change (ADR-027 step 2).
 */
export interface DeckMutationResponse {
  txid: number;
}

/** Deck fields exposed on the public share page — excludes owner-only fields (shareToken, isPublic). */
export interface PublicDeckResponse {
  id: string;
  name: string;
  description: string | null;
  format: DeckFormat;
  /** See {@link DeckSummaryResponse.formatConfig}. */
  formatConfig: DeckFormatConfig | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Denormalized deck card row for the public share page. The public endpoint
 * ships the card's display fields and the preferred/canonical printing's
 * thumbnail + full image URL so the share page can SSR without pulling the
 * global catalog.
 */
export interface PublicDeckCardResponse extends DeckCardResponse {
  cardName: string;
  cardSlug: string;
  cardType: CardType;
  superTypes: SuperType[];
  domains: Domain[];
  tags: string[];
  keywords: string[];
  energy: number | null;
  might: number | null;
  power: number | null;
  /** Resolved printing: the preferred one when set, otherwise the canonical default. Null when the card has no printing. */
  resolvedPrintingId: string | null;
  shortCode: string | null;
  imageId: string | null;
}

/** A single sideboard swap within a matchup plan: a card moving in or out for that opponent. */
export interface DeckMatchupSwapResponse {
  cardId: string;
  /** "out" leaves the maindeck; "in" comes from the sideboard. */
  direction: "in" | "out";
  quantity: number;
}

/** One opponent matchup within a deck plan: who they are plus the swaps and notes for that game. */
export interface DeckMatchupPlanResponse {
  id: string;
  /**
   * Catalog card id of the opponent's identity card (any type — a Legend,
   * Aurora, a domain signpost), used for the icon and a catalog link. Null
   * for a matchup identified only by its label (e.g. "Aggro", "Control").
   */
  opponentCardId: string | null;
  /**
   * Free-text opponent label: an archetype ("Aggro"), a domain, or a build
   * name ("Diana – Scorn of the Moon"). Empty when the card carries the
   * identity on its own. At least one of `opponentCardId` / `opponentLabel` is
   * always set.
   */
  opponentLabel: string;
  /** Free-text matchup note. Empty when not set. */
  notes: string;
  swaps: DeckMatchupSwapResponse[];
}

/**
 * The deck-level plan (ADR-029): how to pilot the deck plus its per-matchup
 * sideboard adjustments. All text fields default to empty and `matchups` to
 * `[]`, so an untouched plan round-trips as an "empty" object.
 */
export interface DeckPlanResponse {
  generalStrategy: string;
  /** When true, the going-first / going-second mulligan notes apply; when false, `mulliganGeneral` does. */
  mulliganSplit: boolean;
  mulliganGeneral: string;
  mulliganFirst: string;
  mulliganSecond: string;
  /** One battlefield per scenario (a game uses one). Null when not chosen. */
  battlefieldGame1CardId: string | null;
  battlefieldFirstCardId: string | null;
  battlefieldSecondCardId: string | null;
  /** When true, `battlefieldNote` free text is used instead of the per-scenario picks. */
  battlefieldCustom: boolean;
  battlefieldNote: string;
  matchups: DeckMatchupPlanResponse[];
}

/** GET /decks/{id}/plan — owner read of a deck's plan (always present, empty when untouched). */
export interface DeckPlanDetailResponse {
  plan: DeckPlanResponse;
}

/**
 * Display metadata for a card referenced by a plan (opponent Legend, chosen
 * battlefields, swapped cards). Denormalized on the public share page so
 * anonymous viewers can render names and thumbnails without the catalog.
 */
export interface DeckPlanCardMetaResponse {
  cardId: string;
  cardName: string;
  cardSlug: string;
  cardType: CardType;
  imageId: string | null;
}

export interface PublicDeckDetailResponse {
  deck: PublicDeckResponse;
  cards: PublicDeckCardResponse[];
  owner: { displayName: string; gravatarHash: string | null };
  /**
   * The deck's plan, or `null` when the deck has no plan content at all (no
   * deck-level fields set and no matchups). The share page renders nothing
   * for a null plan.
   */
  plan: DeckPlanResponse | null;
  /**
   * Display metadata for every card the plan references (opponent Legends,
   * battlefields, swapped cards). Empty when `plan` is null. Lets the share
   * page render the plan without catalog access.
   */
  planCardMeta: DeckPlanCardMetaResponse[];
  /**
   * Card id → custom-tag slugs (sorted), denormalized for the cards in this
   * deck only. The full catalog map isn't available to anonymous viewers, so
   * tag-locked formats (e.g. Custom-Region) need this slice to validate the
   * deck honestly instead of reporting every card as out-of-format. Cards
   * with no tags are absent from the record.
   */
  customTagAssignments: Record<string, string[]>;
}

export interface DeckShareResponse {
  /**
   * Null for an owned-but-unshared deck (GET /decks/:id/share). Share / rotate
   * always return a string token.
   */
  shareToken: string | null;
  isPublic: boolean;
}

export interface DeckCloneResponse {
  deckId: string;
}

export interface DeckAvailabilityItemResponse {
  cardId: string;
  zone: DeckZone;
  needed: number;
  owned: number;
  shortfall: number;
}

export interface DeckExportResponse {
  code: string;
  warnings: string[];
}
