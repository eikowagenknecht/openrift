import type {
  Card,
  DistributionChannelWithCount,
  Marker,
  PrintingDistributionChannel,
  PrintingImage,
} from "../catalog.js";
import type { ArtVariant, Finish, Rarity, SetType } from "../enums.js";

export interface CatalogSetResponse {
  id: string;
  slug: string;
  name: string;
  releasedAt: string | null;
  released: boolean;
  setType: SetType;
}

/** Wire type for a single card (adds `id` back for endpoints that return cards outside a map). */
export type CatalogCardResponse = Card & { id: string };

/** Wire type for a single printing (still carries `id` for endpoints that return printings as arrays). */
export interface CatalogPrintingResponse {
  id: string;
  shortCode: string;
  setId: string;
  rarity: Rarity;
  artVariant: ArtVariant;
  isSigned: boolean;
  markers: Marker[];
  distributionChannels: PrintingDistributionChannel[];
  finish: Finish;
  images: PrintingImage[];
  artist: string;
  publicCode: string;
  printedRulesText: string | null;
  printedEffectText: string | null;
  flavorText: string | null;
  printedName: string | null;
  /** Year stamped on the physical card (e.g. 2025). Differs from set release for reprints. */
  printedYear: number | null;
  language: string;
  comment: string | null;
  cardId: string;
  /**
   * Integer sort key from the `printings_ordered` DB view, encoding
   * (language.sort_order, set.sort_order, short_code, has_markers,
   * primary_marker.sort_order, finish.sort_order). A single integer compare
   * replaces the 6-axis JS comparator. User language preference overrides
   * the language axis client-side.
   */
  canonicalRank: number;
}

/** Wire-only value shapes for `GET /catalog` — identity lives in the map key, not the value. */
export type CatalogResponseCardValue = Omit<CatalogCardResponse, "id">;
export type CatalogResponsePrintingValue = Omit<CatalogPrintingResponse, "id">;

export interface CatalogResponse {
  sets: CatalogSetResponse[];
  cards: Record<string, CatalogResponseCardValue>;
  printings: Record<string, CatalogResponsePrintingValue>;
  totalCopies: number;
  /**
   * Map of card id → array of admin-curated custom-tag slugs (sorted).
   * Consumed only by custom deck-builder formats (e.g. region-locked
   * freeform). Standard UI should not render these alongside `card.tags`.
   */
  customTagAssignments: Record<string, string[]>;
}

export interface CardDetailResponse {
  card: CatalogCardResponse;
  printings: CatalogPrintingResponse[];
  sets: CatalogSetResponse[];
  // CACHE-1: prices are not inlined; read them from the /prices resource.
}

export interface SetListEntry extends CatalogSetResponse {
  cardCount: number;
  printingCount: number;
  coverImageId: string | null;
}

export interface SetListResponse {
  sets: SetListEntry[];
}

export interface SetDetailResponse {
  set: CatalogSetResponse;
  cards: Record<string, CatalogCardResponse>;
  printings: CatalogPrintingResponse[];
  // CACHE-1: prices are not inlined; read them from the /prices resource.
}

/**
 * Public "promos" page: cards distributed through any channel (event or
 * product). The page groups by channel and lists which printings appeared at
 * each.
 */
export interface PromosListResponse {
  channels: DistributionChannelWithCount[];
  cards: Record<string, CatalogCardResponse>;
  printings: CatalogPrintingResponse[];
  // CACHE-1: prices are not inlined; read them from the /prices resource.
}

interface SitemapEntry {
  slug: string;
  updatedAt: string;
}

export interface SitemapDataResponse {
  cards: SitemapEntry[];
  sets: SitemapEntry[];
}

/**
 * Lightweight payload for the public landing page. Only the values the hero
 * needs: three counts for the count-up stats and a pre-filtered, sampled list
 * of front-face image_files.id values for the decorative card scatter
 * (battlefields excluded). The client builds thumbnail URLs via `imageUrl()`.
 */
export interface LandingSummaryResponse {
  cardCount: number;
  printingCount: number;
  copyCount: number;
  thumbnailIds: string[];
}
