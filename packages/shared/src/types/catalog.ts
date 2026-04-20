import type { ArtVariant, CardFace, CardType, Domain, Finish, Rarity, SuperType } from "./enums.js";

export interface Marker {
  id: string;
  slug: string;
  label: string;
  description: string | null;
}

export interface MarkerWithCount extends Marker {
  cardCount: number;
  printingCount: number;
}

export type DistributionChannelKind = "event" | "product";

export interface DistributionChannel {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  kind: DistributionChannelKind;
  /** Parent channel id (NULL = root of the tree). */
  parentId: string | null;
  /** Column header a /promos compact table uses for this channel's children. */
  childrenLabel: string | null;
}

export interface DistributionChannelWithCount extends DistributionChannel {
  cardCount: number;
  printingCount: number;
}

/** A channel a printing was distributed through, plus optional per-printing note. */
export interface PrintingDistributionChannel {
  channel: DistributionChannel;
  distributionNote: string | null;
  /** Ordered labels of the channel's ancestors (root → direct parent), excluding the channel itself. */
  ancestorLabels: string[];
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
  language: string;
  /** Editor note about this specific printing. Surfaced as a small icon + tooltip. */
  comment: string | null;
  /** See {@link CatalogPrintingResponse.canonicalRank}. */
  canonicalRank: number;
  card: Card;
}
