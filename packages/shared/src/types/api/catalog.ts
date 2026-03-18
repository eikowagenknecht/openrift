import type { Card, PrintingImage, PromoType } from "../catalog.js";
import type { ArtVariant, Finish, Rarity } from "../enums.js";

export interface CatalogSetResponse {
  id: string;
  slug: string;
  name: string;
}

export type CatalogCardResponse = Card;

/** Wire type returned by `GET /catalog` — references card by ID instead of embedding. */
export interface CatalogPrintingResponse {
  id: string;
  slug: string;
  sourceId: string;
  setId: string;
  collectorNumber: number;
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
  marketPrice?: number;
  cardId: string;
}

export interface CatalogResponse {
  sets: CatalogSetResponse[];
  cards: Record<string, CatalogCardResponse>;
  printings: CatalogPrintingResponse[];
}
