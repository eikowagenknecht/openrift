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
  setId: string;
  setSlug: string;
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
  card: Card;
}
