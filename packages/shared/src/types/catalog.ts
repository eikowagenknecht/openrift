import type { ArtVariant, CardFace, CardType, Domain, Finish, Rarity, SuperType } from "./enums.js";

export interface PromoType {
  id: string;
  slug: string;
  label: string;
}

export interface CardBan {
  formatId: string;
  formatName: string;
  bannedAt: string;
  reason: string | null;
}

export interface CardErrata {
  correctedRulesText: string | null;
  correctedEffectText: string | null;
  source: string;
  sourceUrl: string | null;
  effectiveDate: string | null;
}

export interface Card {
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
  errata: CardErrata | null;
  bans: CardBan[];
}

export interface CardImageVariants {
  full: string;
  thumbnail: string;
}

export interface PrintingImage {
  face: CardFace;
  full: string;
  thumbnail: string;
}

export interface Printing {
  id: string;
  cardId: string;
  shortCode: string;
  setId: string;
  setSlug: string;
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
  card: Card;
}
