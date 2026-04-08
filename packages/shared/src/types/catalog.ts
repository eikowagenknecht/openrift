import type { ArtVariant, CardFace, CardType, Domain, Finish, Rarity, SuperType } from "./enums.js";
import type { Marketplace } from "./pricing.js";

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
  errata: CardErrata | null;
  bans: CardBan[];
}

export interface PrintingImage {
  face: CardFace;
  url: string;
}

export interface Printing {
  id: string;
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
  marketPrice?: number;
  marketPrices?: Partial<Record<Marketplace, number>>;
  card: Card;
}
