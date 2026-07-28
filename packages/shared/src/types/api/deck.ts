import type {
  deckCardResponseSchema,
  deckCloneResponseSchema,
  deckDetailResponseSchema,
  deckExportResponseSchema,
  deckListItemResponseSchema,
  deckListResponseSchema,
  deckPlanDetailResponseSchema,
  deckResponseSchema,
  deckShareResponseSchema,
  deckSummaryResponseSchema,
} from "@openrift/shared/contracts/decks";
import type {
  deckPlanCardMetaResponseSchema,
  publicDeckCardResponseSchema,
  publicDeckDetailResponseSchema,
  publicDeckResponseSchema,
} from "@openrift/shared/contracts/public-decks";
import type {
  deckPlanResponseSchema,
  formatConfigResponseSchema,
} from "@openrift/shared/response-schemas";
import type { z } from "zod";

/**
 * Per-deck format config payload (`decks.format_config` jsonb). Each format
 * reads only the keys it cares about. The interface is concrete (not a
 * generic `Record`) so TanStack server-fn typing can preserve inference
 * through the response types — add a new optional key here when a new
 * format needs its own per-deck setting.
 */
export type DeckFormatConfig = NonNullable<z.infer<typeof formatConfigResponseSchema>>;

export type DeckListResponse = z.infer<typeof deckListResponseSchema>;

/** Slimmed-down deck fields for the list view (no isWanted/isPublic/shareToken/description). */
export type DeckSummaryResponse = z.infer<typeof deckSummaryResponseSchema>;

export type DeckListItemResponse = z.infer<typeof deckListItemResponseSchema>;

export type DeckResponse = z.infer<typeof deckResponseSchema>;

export type DeckCardResponse = z.infer<typeof deckCardResponseSchema>;

export type DeckDetailResponse = z.infer<typeof deckDetailResponseSchema>;

/** Deck fields exposed on the public share page — excludes owner-only fields (shareToken, isPublic). */
export type PublicDeckResponse = z.infer<typeof publicDeckResponseSchema>;

/**
 * Denormalized deck card row for the public share page. The public endpoint
 * ships the card's display fields and the preferred/canonical printing's
 * thumbnail + full image URL so the share page can SSR without pulling the
 * global catalog.
 */
export type PublicDeckCardResponse = z.infer<typeof publicDeckCardResponseSchema>;

/** A single sideboard swap within a matchup plan: a card moving in or out for that opponent. */
export type DeckMatchupSwapResponse = z.infer<
  typeof deckPlanResponseSchema
>["matchups"][number]["swaps"][number];

/** One opponent matchup within a deck plan: who they are plus the swaps and notes for that game. */
export type DeckMatchupPlanResponse = z.infer<typeof deckPlanResponseSchema>["matchups"][number];

/**
 * The deck-level plan (ADR-029): how to pilot the deck plus its per-matchup
 * sideboard adjustments. All text fields default to empty and `matchups` to
 * `[]`, so an untouched plan round-trips as an "empty" object.
 */
export type DeckPlanResponse = z.infer<typeof deckPlanResponseSchema>;

/** GET /decks/{id}/plan — owner read of a deck's plan (always present, empty when untouched). */
export type DeckPlanDetailResponse = z.infer<typeof deckPlanDetailResponseSchema>;

/**
 * Display metadata for a card referenced by a plan (opponent Legend, chosen
 * battlefields, swapped cards). Denormalized on the public share page so
 * anonymous viewers can render names and thumbnails without the catalog.
 */
export type DeckPlanCardMetaResponse = z.infer<typeof deckPlanCardMetaResponseSchema>;

export type PublicDeckDetailResponse = z.infer<typeof publicDeckDetailResponseSchema>;

export type DeckShareResponse = z.infer<typeof deckShareResponseSchema>;

export type DeckCloneResponse = z.infer<typeof deckCloneResponseSchema>;

export type DeckExportResponse = z.infer<typeof deckExportResponseSchema>;
