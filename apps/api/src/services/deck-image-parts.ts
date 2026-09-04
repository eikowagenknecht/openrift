import { DEFAULT_DOMAIN_COLORS, DOMAIN_COLOR_FALLBACK, WellKnown } from "@openrift/shared";

import type { Io } from "../io.js";
import type { Child, Element } from "./share-image-core.js";
import {
  COLORS,
  blurredArtBackdropDataUri,
  element,
  elideTitle,
  svgToPngDataUri,
} from "./share-image-core.js";

/**
 * The pieces both deck-image layouts in `deck-image.ts` (the 1200×630 og:image
 * and the 9:16 export) are built from. The split follows `share-image-core`'s
 * rule one level down: that module holds what every share image shares, this
 * one what every *deck* image shares.
 */

/** Gap between tiles and between stacked bands. */
export const GAP = 10;
/** Gap between the two columns of a side-by-side band. */
export const BODY_GAP = 16;
/** Battlefield art is landscape; its tiles use this aspect. */
export const BATTLEFIELD_ASPECT = 1.4;
/** Section header (label + underline) reserved height, for area math. */
export const SECTION_HEADER_H = 23;
/** Battlefields shown (decks rarely exceed three). */
const MAX_BATTLEFIELDS = 3;

/** One deck card the renderer needs; `imageId` is the resolved art, null when none. */
export interface DeckImageCard {
  cardName: string;
  quantity: number;
  imageId: string | null;
  energy: number | null;
  /** Card domains, used to group runes by their domain glyph. */
  domains: readonly string[];
  /** Deck zone slug (legend / champion / main / runes / battlefield / sideboard / overflow). */
  zone: string;
}

export interface DeckImageInput {
  deckName: string;
  /** Owner display name shown next to the title; the chip is dropped when empty. */
  ownerName?: string;
  /** Presentable format label, e.g. "Constructed". */
  formatLabel: string;
  /** What the list scored, e.g. "1st of 3,283 · Summoner Skirmish Wuhan"; set for an archive entry only. */
  resultLine?: string;
  cards: readonly DeckImageCard[];
  /** Host shown in the footer (e.g. "openrift.app"); omitted when empty. */
  siteHost?: string;
  /** Absolute deck share URL encoded in the QR; the QR is dropped when absent. */
  shareUrl?: string;
  /**
   * Custom cover art for the blurred backdrop, mirroring the web hero. Null /
   * absent keeps the legend-derived backdrop; the left hero panel stays the
   * legend either way.
   */
  coverImageId?: string | null;
}

export interface DeckImageCardRef {
  cardId: string;
  preferredPrintingId: string | null;
  quantity: number;
  zone: string;
}

/** Longest deck title kept before eliding; bounds the title so it never runs into
 * the right-aligned format/count. Shorter than the tier list's cap because this
 * row also carries the domain glyphs. */
const TITLE_MAX_CHARS = 34;

export function truncateTitle(title: string, max = TITLE_MAX_CHARS): string {
  return elideTitle(title, max);
}

function byEnergyThenName(left: DeckImageCard, right: DeckImageCard): number {
  return (left.energy ?? 99) - (right.energy ?? 99) || left.cardName.localeCompare(right.cardName);
}

export interface DeckZones {
  legend: DeckImageCard | null;
  /** Distinct rune cards, most copies first. */
  runeCards: DeckImageCard[];
  /** The raw rune rows, for the per-domain glyph summary. */
  runes: DeckImageCard[];
  battlefields: DeckImageCard[];
  sideboard: DeckImageCard[];
  /** Champions first (the deck's identity units), then the rest by cost. */
  gridCards: DeckImageCard[];
  /** Champions + main copies, excluding overflow. */
  mainCardCount: number;
  sideboardCount: number;
}

export function splitDeckZones(cards: readonly DeckImageCard[]): DeckZones {
  const zone = WellKnown.deckZone;
  const legend = cards.find((card) => card.zone === zone.LEGEND) ?? null;
  const runes = cards.filter((card) => card.zone === zone.RUNES);
  const battlefields = cards
    .filter((card) => card.zone === zone.BATTLEFIELD)
    .slice(0, MAX_BATTLEFIELDS);
  const sideboard = cards.filter((card) => card.zone === zone.SIDEBOARD).sort(byEnergyThenName);
  const champions = cards.filter((card) => card.zone === zone.CHAMPION).sort(byEnergyThenName);
  const mainline = cards
    .filter((card) => card.zone === zone.MAIN || card.zone === zone.OVERFLOW)
    .sort(byEnergyThenName);
  const gridCards = [...champions, ...mainline];
  // Conventional deck size: champions + main only, reported separately from the
  // sideboard. Overflow copies still show in the grid but are not counted (nor are
  // legend, battlefields, or runes).
  const mainCardCount = gridCards
    .filter((card) => card.zone !== zone.OVERFLOW)
    .reduce((sum, card) => sum + card.quantity, 0);
  const runeCards = [...runes].sort(
    (left, right) => right.quantity - left.quantity || left.cardName.localeCompare(right.cardName),
  );

  return {
    legend,
    runeCards,
    runes,
    battlefields,
    sideboard,
    gridCards,
    mainCardCount,
    sideboardCount: sideboard.reduce((sum, card) => sum + card.quantity, 0),
  };
}

/** The "Constructed · 30 + 2 cards" metadata line. */
export function deckMetaLabel(
  formatLabel: string,
  mainCardCount: number,
  sideboardCount: number,
): string {
  const total = mainCardCount + sideboardCount;
  const counts = `${mainCardCount}${sideboardCount > 0 ? ` + ${sideboardCount}` : ""}`;
  return `${formatLabel} · ${counts} ${total === 1 ? "card" : "cards"}`;
}

export interface PackedGrid {
  cols: number;
  tileW: number;
  tileH: number;
}

/** Tolerance for treating two column counts as giving the same tile size. */
const TILE_TIE_TOLERANCE = 1.02;

/** Tuning for `packGrid` beyond the raw area. Both options exist for the tall
 * canvas, where the area is far larger than the deck needs. */
export interface PackGridOptions {
  /**
   * Ceiling on the tile width. Bounds the result without changing the column
   * choice: on the tall canvas a three-card deck would otherwise be drawn as
   * three 340px slabs, and a one-card deck as a single 700px one.
   */
  maxTileW?: number;
  /**
   * Break near-ties toward more columns. On a tall area two column counts can
   * yield the same tile to within a pixel — a two-card deck packs as one column
   * of two at 508px or two columns of one at 507px — and the raw maximum picks
   * the taller arrangement, which on a 9:16 canvas reads as a column of cards
   * running off down the frame rather than as a decklist.
   */
  preferWider?: boolean;
}

/**
 * Picks the column count that makes `count` portrait tiles as large as possible
 * while fitting both dimensions of the area. Unlike the list grid this is not
 * capped at two rows — a deck shows its whole main list.
 */
export function packGrid(
  count: number,
  areaW: number,
  areaH: number,
  aspect: number,
  options: PackGridOptions = {},
): PackedGrid {
  const { maxTileW = Number.POSITIVE_INFINITY, preferWider = false } = options;
  let best: PackedGrid = { cols: 1, tileW: 0, tileH: 0 };
  let bestExact = 0;
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const tileWByWidth = (areaW - (cols - 1) * GAP) / cols;
    const tileHByHeight = (areaH - (rows - 1) * GAP) / rows;
    const tileH = Math.min(tileWByWidth / aspect, tileHByHeight);
    const tileW = tileH * aspect;
    // A later `cols` is always the wider arrangement, so a near-tie only ever
    // needs to beat the incumbent by the tolerance to take it.
    const wins = preferWider ? tileW * TILE_TIE_TOLERANCE > bestExact : tileW > bestExact;
    if (wins) {
      best = { cols, tileW: Math.floor(tileW), tileH: Math.floor(tileH) };
      bestExact = Math.max(bestExact, tileW);
    }
  }
  if (best.tileW > maxTileW) {
    return { cols: best.cols, tileW: Math.floor(maxTileW), tileH: Math.floor(maxTileW / aspect) };
  }
  return best;
}

/**
 * Sums rune quantities per domain, highest first. A rune carries one domain; a
 * multi-domain rune folds into "rainbow".
 */
export function runeCountsByDomain(
  runes: readonly DeckImageCard[],
): { domain: string; count: number }[] {
  const byDomain = new Map<string, number>();
  for (const rune of runes) {
    const [first] = rune.domains;
    const domain = rune.domains.length === 1 && first ? first : "rainbow";
    byDomain.set(domain, (byDomain.get(domain) ?? 0) + rune.quantity);
  }
  return [...byDomain.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((left, right) => right.count - left.count || left.domain.localeCompare(right.domain));
}

export async function glyphUri(
  io: Io,
  domain: string,
  sizePx: number,
  scale: number,
): Promise<string | null> {
  try {
    const svg = await io.fs.readFile(`${import.meta.dirname}/../assets/glyphs/rune-${domain}.svg`);
    return await svgToPngDataUri(io, svg, sizePx * scale);
  } catch {
    return null;
  }
}

export function domainIconElements(
  domainUris: readonly (string | null)[],
  sizePx: number,
): Element[] {
  return domainUris.map((uri) =>
    uri
      ? ({ type: "img", props: { src: uri, width: sizePx, height: sizePx } } as Element)
      : element("div", {
          display: "flex",
          width: sizePx,
          height: sizePx,
          borderRadius: sizePx / 2,
          backgroundColor: COLORS.gold,
        }),
  );
}

export function deckSection(label: string, tiles: Child[], marginTop = 0): Element {
  const header = element(
    "div",
    { display: "flex", flexDirection: "row", alignItems: "center", marginBottom: 8 },
    element("div", {
      display: "flex",
      height: 1,
      width: 28,
      backgroundColor: COLORS.surfaceBorder,
      marginRight: 10,
    }),
    element(
      "div",
      { display: "flex", fontSize: 15, fontWeight: 700, color: COLORS.gold, letterSpacing: 2 },
      label,
    ),
    element("div", {
      display: "flex",
      flexGrow: 1,
      height: 1,
      backgroundColor: COLORS.surfaceBorder,
      marginLeft: 10,
    }),
  );
  return element(
    "div",
    { display: "flex", flexDirection: "column", marginTop },
    header,
    element("div", { display: "flex", flexDirection: "row", flexWrap: "wrap", gap: GAP }, ...tiles),
  );
}

/**
 * Ambient background glow built from the legend's domain colors, mirroring
 * the web app's deck hero (`deckGlowStyle` in
 * apps/web/src/components/deck/deck-hero.tsx): one radial per domain,
 * anchored to opposite top corners so a dual-domain deck reads as a blend. A
 * deck with no legend keeps the flat background.
 */
export function legendGlowBackground(domains: readonly string[]): string | undefined {
  if (domains.length === 0) {
    return undefined;
  }
  const first = DEFAULT_DOMAIN_COLORS[domains[0] ?? ""] ?? DOMAIN_COLOR_FALLBACK;
  const second = domains.length > 1 ? (DEFAULT_DOMAIN_COLORS[domains[1] ?? ""] ?? first) : first;
  return `radial-gradient(70% 150% at 12% 0%, ${first}3d 0%, transparent 62%), radial-gradient(60% 130% at 88% 0%, ${second}33 0%, transparent 58%)`;
}

/**
 * Renders the blurred cover art at half the canvas size. The backdrop is
 * blurred anyway, so half resolution keeps the payload small even at the HQ
 * scale. A custom cover replaces the legend art here, and only here.
 */
export function deckBackdropUri(
  io: Io,
  imageId: string | null | undefined,
  width: number,
  height: number,
  scale: number,
): Promise<string | null> {
  if (!imageId) {
    return Promise.resolve(null);
  }
  return blurredArtBackdropDataUri(
    io,
    imageId,
    Math.round((width / 2) * scale),
    Math.round((height / 2) * scale),
  );
}

/**
 * Full-art identity, mirroring the web deck hero: the cover art blurred across
 * the whole canvas at low opacity, under a vertical scrim that keeps the title
 * row and the bottom band readable.
 */
export function deckHeroBackdrop(backdropUri: string | null, width: number, height: number): Child {
  return (
    backdropUri &&
    element(
      "div",
      { display: "flex", position: "absolute", top: 0, left: 0, width, height },
      {
        type: "img",
        props: { src: backdropUri, width, height, style: { opacity: 0.35 } },
      },
      element("div", {
        display: "flex",
        position: "absolute",
        top: 0,
        left: 0,
        width,
        height,
        backgroundImage:
          "linear-gradient(to bottom, rgba(20,22,29,0.85) 0%, rgba(20,22,29,0.35) 30%, rgba(20,22,29,0.35) 65%, rgba(20,22,29,0.9) 100%)",
      }),
    )
  );
}
