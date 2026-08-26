import type {
  cardDetailRelatedCardSchema,
  cardDetailResponseSchema,
} from "@openrift/shared/contracts/cards";
import type {
  catalogCardResponseValueSchema,
  catalogPrintingResponseValueSchema,
  catalogResponseSchema,
} from "@openrift/shared/contracts/catalog";
import type { landingSummaryResponseSchema } from "@openrift/shared/contracts/landing-summary";
import type { promosListResponseSchema } from "@openrift/shared/contracts/promos";
import type {
  setDetailResponseSchema,
  setListEntrySchema,
  setListResponseSchema,
} from "@openrift/shared/contracts/sets";
import type { sitemapDataResponseSchema } from "@openrift/shared/contracts/sitemap";
import type {
  catalogCardResponseSchema,
  catalogPrintingResponseSchema,
  catalogSetResponseSchema,
} from "@openrift/shared/response-schemas";
import type { z } from "zod";

export type CatalogSetResponse = z.infer<typeof catalogSetResponseSchema>;

/** Wire type for a single card (adds `id` back for endpoints that return cards outside a map). */
export type CatalogCardResponse = z.infer<typeof catalogCardResponseSchema>;

/** Wire type for a single printing (still carries `id` for endpoints that return printings as arrays). */
export type CatalogPrintingResponse = z.infer<typeof catalogPrintingResponseSchema>;

/** Wire-only value shapes for `GET /catalog` — identity lives in the map key, not the value. */
export type CatalogResponseCardValue = z.infer<typeof catalogCardResponseValueSchema>;
export type CatalogResponsePrintingValue = z.infer<typeof catalogPrintingResponseValueSchema>;

export type CatalogResponse = z.infer<typeof catalogResponseSchema>;

export type CardDetailResponse = z.infer<typeof cardDetailResponseSchema>;

export type CardDetailRelatedCard = z.infer<typeof cardDetailRelatedCardSchema>;

export type SetListEntry = z.infer<typeof setListEntrySchema>;

export type SetListResponse = z.infer<typeof setListResponseSchema>;

export type SetDetailResponse = z.infer<typeof setDetailResponseSchema>;

/**
 * Public "promos" page: cards distributed through any channel (event or
 * product). The page groups by channel and lists which printings appeared at
 * each.
 */
export type PromosListResponse = z.infer<typeof promosListResponseSchema>;

export type SitemapDataResponse = z.infer<typeof sitemapDataResponseSchema>;

/**
 * Lightweight payload for the public landing page. Only the values the hero
 * needs: three counts for the count-up stats and a pre-filtered, sampled list
 * of front-face image_files.id values for the decorative card scatter
 * (battlefields excluded). The client builds thumbnail URLs via `imageUrl()`.
 */
export type LandingSummaryResponse = z.infer<typeof landingSummaryResponseSchema>;
