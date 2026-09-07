import type {
  deckFolderListResponseSchema,
  deckFolderResponseSchema,
} from "@openrift/shared/contracts/deck-folders";
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
  deckCatalogSubsetSchema,
  deckPlanCardMetaResponseSchema,
  publicDeckCardResponseSchema,
  publicDeckDetailResponseSchema,
  publicDeckResponseSchema,
} from "@openrift/shared/contracts/public-decks";
import type {
  deckLinkSchema,
  deckPlanResponseSchema,
  formatConfigResponseSchema,
} from "@openrift/shared/response-schemas";
import type { z } from "zod";

/** Concrete (not a generic `Record`) so TanStack server-fn typing can preserve inference through the response types. */
export type DeckFormatConfig = NonNullable<z.infer<typeof formatConfigResponseSchema>>;

export type { DeckOddsConfig, DeckOddsGroup } from "@openrift/shared/contracts/decks";

export type DeckListResponse = z.infer<typeof deckListResponseSchema>;

/** No isPublic/shareToken/description. */
export type DeckSummaryResponse = z.infer<typeof deckSummaryResponseSchema>;

export type DeckListItemResponse = z.infer<typeof deckListItemResponseSchema>;

export type DeckFolderResponse = z.infer<typeof deckFolderResponseSchema>;

export type DeckFolderListResponse = z.infer<typeof deckFolderListResponseSchema>;

export type DeckLink = z.infer<typeof deckLinkSchema>;

export type DeckResponse = z.infer<typeof deckResponseSchema>;

export type DeckCardResponse = z.infer<typeof deckCardResponseSchema>;

export type DeckDetailResponse = z.infer<typeof deckDetailResponseSchema>;

/** Excludes owner-only fields (shareToken, isPublic). */
export type PublicDeckResponse = z.infer<typeof publicDeckResponseSchema>;

/** Carries the preferred printing's thumbnail + full image URL so the share page can SSR without the global catalog. */
export type PublicDeckCardResponse = z.infer<typeof publicDeckCardResponseSchema>;

export type DeckMatchupSwapResponse = z.infer<
  typeof deckPlanResponseSchema
>["matchups"][number]["swaps"][number];

export type DeckMatchupPlanResponse = z.infer<typeof deckPlanResponseSchema>["matchups"][number];

/** All text fields default to empty and `matchups` to `[]`, so an untouched plan round-trips as "empty". */
export type DeckPlanResponse = z.infer<typeof deckPlanResponseSchema>;

export type DeckPlanDetailResponse = z.infer<typeof deckPlanDetailResponseSchema>;

/** Denormalized on the public share page so anonymous viewers can render names and thumbnails without the catalog. */
export type DeckPlanCardMetaResponse = z.infer<typeof deckPlanCardMetaResponseSchema>;

export type PublicDeckDetailResponse = z.infer<typeof publicDeckDetailResponseSchema>;

export type DeckCatalogSubset = z.infer<typeof deckCatalogSubsetSchema>;

export type DeckShareResponse = z.infer<typeof deckShareResponseSchema>;

export type DeckCloneResponse = z.infer<typeof deckCloneResponseSchema>;

export type DeckExportResponse = z.infer<typeof deckExportResponseSchema>;
