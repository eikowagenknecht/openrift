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

/**
 * Admin-curated namespace for {@link CustomTag}s. Each tag belongs to exactly
 * one category, so the deck-builder UI can offer only the right vocabulary
 * (e.g. just "region" tags for region-locked freeform decks).
 */
export interface CustomTagCategory {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  sortOrder: number;
}

/**
 * Admin-curated supplemental tag attachable to any card, used by custom
 * deck-builder formats. `category` is the category slug (kept on the tag for
 * convenience so consumers can group by it without a second lookup).
 */
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

/** A channel a printing was distributed through, plus optional per-printing note. */
export interface PrintingDistributionChannel {
  channel: DistributionChannel;
  distributionNote: string | null;
  /** Ordered labels of the channel's ancestors (root → direct parent), excluding the channel itself. */
  ancestorLabels: string[];
}

/**
 * Where a claim about a promo printing comes from: a video, a post, or a plain
 * label when nothing is linkable. Called a citation, not a source, because a
 * "printing source" already means a provider's candidate row in the admin.
 */
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
  /** Always `types[0]`; kept for single-answer consumers (ADR-037). */
  type: CardType;
  /** Ordered card types; multi-type cards ("Unit Gear") have more than one. */
  types: CardType[];
  superTypes: SuperType[];
  domains: Domain[];
  /**
   * Token cards this card tells the player to create, ordered by token name.
   * Derived from EN rules text but stored as card ids, so it reads the same in
   * every language (migration 228).
   */
  tokenCardIds: string[];
  might: number | null;
  energy: number | null;
  power: number | null;
  keywords: string[];
  tags: string[];
  mightBonus: number | null;
  /**
   * Deck copy-limit override for cards whose rules text changes it ("Your
   * deck can have any number of cards named ..."). `null` = normal rules,
   * `0` = unlimited (see `UNLIMITED_COPIES`), positive = cap at that value.
   */
  maxCopiesOverride: number | null;
  errata: CardErrata | null;
  bans: CardBan[];
}

export interface PrintingImage {
  face: CardFace;
  imageId: string;
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
  /** Editor note about this specific printing. Surfaced as a small icon + tooltip. */
  comment: string | null;
  /** See {@link CatalogPrintingResponse.canonicalRank}. */
  canonicalRank: number;
  /**
   * Admin override for the substitute artwork shown when this printing has no
   * image of its own. Absent means `auto` — the derived standard-art fallback,
   * which is the state of nearly every printing, so the field is omitted from
   * the wire rather than spelled out ~7k times. `"pinned"` always arrives with
   * {@link fallbackImageId}. See {@link findStandardArtFallback}.
   */
  fallbackArtMode?: "pinned" | "none";
  /** The pinned substitute's image id. Present exactly when the mode is `"pinned"`. */
  fallbackImageId?: string;
  card: Card;
}
