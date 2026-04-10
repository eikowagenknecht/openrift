import type { Card, PrintingImage, PromoType } from "../catalog.js";
import type { ArtVariant, Finish, Rarity } from "../enums.js";
import type { PriceMap } from "./pricing.js";

export interface CatalogSetResponse {
  id: string;
  slug: string;
  name: string;
  releasedAt: string | null;
}

export type CatalogCardResponse = Card;

/** Wire type for a single printing (still carries `id` for endpoints that return printings as arrays). */
export interface CatalogPrintingResponse {
  id: string;
  shortCode: string;
  setId: string;
  rarity: Rarity;
  artVariant: ArtVariant;
  isSigned: boolean;
  promoType: PromoType | null;
  finish: Finish;
  images: PrintingImage[];
  artist: string;
  publicCode: string;
  printedRulesText: string | null;
  printedEffectText: string | null;
  flavorText: string | null;
  printedName: string | null;
  language: string;
  cardId: string;
}

/** Wire-only value shapes for `GET /catalog` — identity lives in the map key, not the value. */
export type CatalogResponseCardValue = Omit<CatalogCardResponse, "id">;
export type CatalogResponsePrintingValue = Omit<CatalogPrintingResponse, "id">;

export interface CatalogResponse {
  sets: CatalogSetResponse[];
  cards: Record<string, CatalogResponseCardValue>;
  printings: Record<string, CatalogResponsePrintingValue>;
  totalCopies: number;
}

export interface CardDetailResponse {
  card: CatalogCardResponse;
  printings: CatalogPrintingResponse[];
  sets: CatalogSetResponse[];
  /**
   * Latest market prices for the printings on this page, per marketplace.
   * Embedded so the SSR `head()` function can synchronously read prices for
   * Schema.org Product/Offer JSON-LD without waiting for client-side fetches.
   * Runtime UI should still go through `usePrices()` for the cross-page lookup.
   */
  prices: PriceMap;
}

export interface SetListEntry extends CatalogSetResponse {
  cardCount: number;
  printingCount: number;
  coverImageUrl: string | null;
}

export interface SetListResponse {
  sets: SetListEntry[];
}

export interface SetDetailResponse {
  set: CatalogSetResponse;
  cards: Record<string, CatalogCardResponse>;
  printings: CatalogPrintingResponse[];
  /**
   * Latest market prices for the printings in this set, per marketplace.
   * Used for SSR JSON-LD; runtime UI reads through `usePrices()`.
   */
  prices: PriceMap;
}

interface SitemapEntry {
  slug: string;
  updatedAt: string;
}

export interface SitemapDataResponse {
  cards: SitemapEntry[];
  sets: SitemapEntry[];
}
