import type { Card, PrintingImage, PromoType } from "../catalog.js";
import type { ArtVariant, Finish, Rarity } from "../enums.js";
import type { Marketplace } from "../pricing.js";

export interface CatalogSetResponse {
  id: string;
  slug: string;
  name: string;
  releasedAt: string | null;
}

export type CatalogCardResponse = Card;

/** Wire type returned by `GET /catalog` — references card by ID instead of embedding. */
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
  marketPrice?: number;
  marketPrices?: Partial<Record<Marketplace, number>>;
  cardId: string;
}

export interface CatalogLanguageResponse {
  code: string;
  name: string;
}

export interface CatalogResponse {
  sets: CatalogSetResponse[];
  cards: Record<string, CatalogCardResponse>;
  printings: CatalogPrintingResponse[];
  totalCopies: number;
  languages: CatalogLanguageResponse[];
}

export interface CardDetailResponse {
  card: CatalogCardResponse;
  printings: CatalogPrintingResponse[];
  sets: CatalogSetResponse[];
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
}

export interface SitemapDataResponse {
  cardSlugs: string[];
  setSlugs: string[];
}
