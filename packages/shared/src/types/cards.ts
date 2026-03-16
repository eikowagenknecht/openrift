import type { ArtVariant, CardFace, CardType, Domain, Finish, Rarity, SuperType } from "./enums.js";

export interface Card {
  id: string;
  slug: string;
  name: string;
  type: CardType;
  superTypes: SuperType[];
  domains: Domain[];
  might: number | null;
  energy: number | null;
  power: number | null;
  keywords: string[];
  tags: string[];
  mightBonus: number | null;
  rulesText: string | null;
  effectText: string | null;
}

export interface PrintingImage {
  face: CardFace;
  url: string;
}

export interface Printing {
  id: string;
  slug: string;
  sourceId: string;
  set: string;
  collectorNumber: number;
  rarity: Rarity;
  artVariant: ArtVariant;
  isSigned: boolean;
  isPromo: boolean;
  finish: Finish;
  images: PrintingImage[];
  artist: string;
  publicCode: string;
  printedDescription?: string;
  printedEffect?: string;
  flavorText?: string;
  comment?: string;
  marketPrice?: number;
  card: Card;
}

export function getOrientation(type: CardType): "portrait" | "landscape" {
  return type === "Battlefield" ? "landscape" : "portrait";
}

/** Wire type returned by `GET /catalog` — references card by ID instead of embedding. */
export interface CatalogPrinting {
  id: string;
  slug: string;
  sourceId: string;
  set: string;
  collectorNumber: number;
  rarity: Rarity;
  artVariant: ArtVariant;
  isSigned: boolean;
  isPromo: boolean;
  finish: Finish;
  images: PrintingImage[];
  artist: string;
  publicCode: string;
  printedDescription?: string;
  printedEffect?: string;
  flavorText?: string;
  comment?: string;
  marketPrice?: number;
  cardId: string;
}

export interface RiftboundCatalog {
  sets: { slug: string; name: string }[];
  cards: Record<string, Card>;
  printings: CatalogPrinting[];
}
