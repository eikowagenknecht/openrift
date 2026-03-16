import type { ArtVariant, CardFace, CardType, Finish, Rarity } from "./enums.js";
import type { CardsTable, Readable } from "./tables.js";

export interface Card {
  id: Readable<CardsTable["id"]>;
  slug: CardsTable["slug"];
  name: CardsTable["name"];
  type: CardsTable["type"];
  superTypes: CardsTable["super_types"];
  domains: CardsTable["domains"];
  might: CardsTable["might"];
  energy: CardsTable["energy"];
  power: CardsTable["power"];
  keywords: CardsTable["keywords"];
  tags: CardsTable["tags"];
  mightBonus: CardsTable["might_bonus"];
  rulesText: CardsTable["rules_text"];
  effectText: CardsTable["effect_text"];
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
