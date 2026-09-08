import type {
  ArtVariant,
  CardFace,
  CardSize,
  CardType,
  Domain,
  Finish,
  Rarity,
  SuperType,
} from "./enums.js";

export interface Marker {
  id: string;
  slug: string;
  label: string;
  description: string | null;
}

export interface CustomTagCategory {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  sortOrder: number;
}

export interface CustomTag {
  id: string;
  slug: string;
  label: string;
  category: string;
  categoryLabel: string;
  description: string | null;
  sortOrder: number;
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

export interface PrintingDistributionChannel {
  channel: DistributionChannel;
  distributionNote: string | null;
  /** Ordered labels of the channel's ancestors (root → direct parent), excluding the channel itself. */
  ancestorLabels: string[];
}

export interface PrintingCitation {
  id: string;
  label: string;
  /** Null when the citation has no permalink (a stream nobody archived). */
  sourceUrl: string | null;
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
  /** Always `types[0]`; kept for single-answer consumers. */
  type: CardType;
  /** Ordered card types; multi-type cards ("Unit Gear") have more than one. */
  types: CardType[];
  superTypes: SuperType[];
  domains: Domain[];
  /** Ordered by token name; stored as card ids so it reads the same in every language. */
  tokenCardIds: string[];
  might: number | null;
  energy: number | null;
  power: number | null;
  keywords: string[];
  tags: string[];
  mightBonus: number | null;
  /** `null` = normal rules, `0` = unlimited (see `UNLIMITED_COPIES`), positive = cap at that value. */
  maxCopiesOverride: number | null;
  errata: CardErrata | null;
  bans: CardBan[];
}

export interface PrintingImage {
  face: CardFace;
  imageId: string;
  /** Omitted when the image maker is unrecorded, which is most of the catalogue. */
  credit?: string;
}

export interface Printing {
  id: string;
  cardId: string;
  shortCode: string;
  setId: string;
  setSlug: string;
  setReleased: boolean;
  rarity: Rarity;
  artVariant: ArtVariant;
  isSigned: boolean;
  isOvernumbered: boolean;
  markers: Marker[];
  distributionChannels: PrintingDistributionChannel[];
  /** Omitted when the printing has nothing cited — see the wire schema. */
  citations?: PrintingCitation[];
  finish: Finish;
  /** Physical card size. `standard` for the normal print, `oversized` for the larger variety. */
  size: CardSize;
  /** Omitted, never `false`: read as `=== true`. */
  hasFoilTwin?: true;
  images: PrintingImage[];
  artist: string;
  publicCode: string;
  printedRulesText: string | null;
  printedEffectText: string | null;
  flavorText: string | null;
  printedName: string | null;
  /** Year stamped on the physical card (e.g. 2025). Differs from set release for reprints. */
  printedYear: number | null;
  language: string;
  comment: string | null;
  /** See {@link CatalogPrintingResponse.canonicalRank}. */
  canonicalRank: number;
  /** Absent means `auto`. `"pinned"` always arrives with {@link fallbackImageId}. */
  fallbackArtMode?: "pinned" | "none";
  /** The pinned substitute's image id. Present exactly when the mode is `"pinned"`. */
  fallbackImageId?: string;
  card: Card;
}
