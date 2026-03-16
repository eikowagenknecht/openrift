import type { Card, PrintingImage } from "../catalog.js";
import type { ArtVariant, Finish, Rarity } from "../enums.js";

/** Wire type returned by `GET /catalog` — references card by ID instead of embedding. */
export interface CatalogPrinting {
  id: string;
  slug: string;
  sourceId: string;
  setId: string;
  collectorNumber: number;
  rarity: Rarity;
  artVariant: ArtVariant;
  isSigned: boolean;
  isPromo: boolean;
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

export interface RiftboundCatalog {
  sets: { id: string; slug: string; name: string }[];
  cards: Record<string, Card>;
  printings: CatalogPrinting[];
}
