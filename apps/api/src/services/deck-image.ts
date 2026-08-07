import { WellKnown } from "@openrift/shared";
import QRCode from "qrcode";

import type { Repos } from "../deps.js";
import type { Io } from "../io.js";
import type { Child, Element } from "./share-image-core.js";
import {
  COLORS,
  blurredArtBackdropDataUri,
  cardArtDataUri,
  cardRadiusPx,
  element,
  renderTreeToPng,
  svgToPngDataUri,
} from "./share-image-core.js";

/**
 * Server-rendered deck share image (ADR-031): a beautified, Archive-style
 * decklist rendered to PNG for the public deck share route's og:image and an
 * HQ download. Built from the same satori + resvg primitives as the list image
 * (`share-image-core`), but with a deck-shaped layout: a left legend hero, the
 * legend's domain glyphs by the title's card count, a cost-sorted main grid, and
 * a bottom band (sideboard row, then battlefields + runes) whose tiles grow to
 * fill whatever space the grid leaves, with the QR mark pinned bottom-right.
 *
 * Two resolutions share one layout via the `scale` arg: the og:image renders at
 * 1× (1200×630); the download renders at 3× by embedding raster sources (card
 * art, glyphs, QR) at the matching resolution while satori lays out once at base
 * size. Card images already bake in cost/power/name/text, so a tile is just the
 * card art plus a quantity badge — no per-card chrome to re-composite.
 */

const WIDTH = 1200;
const HEIGHT = 630;
const PAD = 22;
const GAP = 10;
const BODY_GAP = 16;
/** Portrait card aspect (width / height); landscape art letterboxes within the box. */
const CARD_ASPECT = 0.715;
/** Battlefield art is landscape; its tiles use this aspect. */
const BATTLEFIELD_ASPECT = 1.4;
/** Tile border width. The art is sized to the box inside it so it stays centered:
 * satori uses border-box, so an art image the full tile size is pinned top-left
 * and clipped bottom-right, shifting the card down-right. Sizing to the content
 * box centers it within the border. */
const TILE_BORDER = 1;

const TITLE_H = 46;
const LEFT_W = 250;

/**
 * Domain colors for the deck-image background glow. Mirrors
 * `DEFAULT_DOMAIN_COLORS` in apps/web/src/lib/domain.ts; kept as a local
 * constant rather than a repo lookup because the renderer has no existing path
 * to the domain enum's DB-backed colors and this is a flat, rarely-changing
 * palette.
 */
const DOMAIN_GLOW_COLORS: Record<string, string> = {
  fury: "#CB212D",
  calm: "#16AA71",
  mind: "#227799",
  body: "#E2710C",
  chaos: "#6B4891",
  order: "#CDA902",
  colorless: "#737373",
};

/**
 * Ambient background glow built from the legend's domain colors, mirroring
 * the web app's deck hero (`deckGlowStyle` in
 * apps/web/src/components/deck/deck-hero.tsx): one radial per domain,
 * anchored to opposite top corners so a dual-domain deck reads as a blend. A
 * deck with no legend keeps the flat background (returns undefined).
 * @returns A CSS `background-image` value, or undefined when there's no legend.
 */
function legendGlowBackground(domains: readonly string[]): string | undefined {
  if (domains.length === 0) {
    return undefined;
  }
  const first = DOMAIN_GLOW_COLORS[domains[0] ?? ""] ?? DOMAIN_GLOW_COLORS.colorless;
  const second = domains.length > 1 ? (DOMAIN_GLOW_COLORS[domains[1] ?? ""] ?? first) : first;
  return `radial-gradient(70% 150% at 12% 0%, ${first}3d 0%, transparent 62%), radial-gradient(60% 130% at 88% 0%, ${second}33 0%, transparent 58%)`;
}

const QR_SIZE = 84;
/** Legend domain glyphs, shown top-right beside the card count (no amounts). */
const DOMAIN_ICON = 30;
/** Section header (label + underline) reserved height, for grid-area math. */
const SECTION_HEADER_H = 23;
/** Base portrait sideboard tile height (grows to fill leftover space). */
const SIDEBOARD_TILE_H = 96;
/** Base landscape battlefield tile height; runes share this row and match it. */
const BATTLEFIELD_BAND_TILE_H = 84;
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

/** Everything the renderer needs to draw a deck share image. */
export interface DeckImageInput {
  deckName: string;
  /** Owner display name shown next to the title; the chip is dropped when empty. */
  ownerName?: string;
  /** Presentable format label, e.g. "Constructed". */
  formatLabel: string;
  cards: readonly DeckImageCard[];
  /** Host shown in the footer (e.g. "openrift.app"); omitted when empty. */
  siteHost?: string;
  /** Absolute deck share URL encoded in the QR; the QR is dropped when absent. */
  shareUrl?: string;
}

interface PackedGrid {
  cols: number;
  tileW: number;
  tileH: number;
}

/**
 * Picks the column count that makes `count` portrait tiles as large as possible
 * while fitting both dimensions of the area. Unlike the list grid this is not
 * capped at two rows — a deck shows its whole main list.
 * @returns The column count and floored tile dimensions.
 */
function packGrid(count: number, areaW: number, areaH: number, aspect: number): PackedGrid {
  let best: PackedGrid = { cols: 1, tileW: 0, tileH: 0 };
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const tileWByWidth = (areaW - (cols - 1) * GAP) / cols;
    const tileHByHeight = (areaH - (rows - 1) * GAP) / rows;
    const tileH = Math.min(tileWByWidth / aspect, tileHByHeight);
    const tileW = tileH * aspect;
    if (tileW > best.tileW) {
      best = { cols, tileW: Math.floor(tileW), tileH: Math.floor(tileH) };
    }
  }
  return best;
}

/** @returns The art data URI for `imageId` at the scaled tile size, or null. */
function artUri(
  io: Io,
  imageId: string | null,
  tileW: number,
  tileH: number,
  scale: number,
): Promise<string | null> {
  if (!imageId) {
    return Promise.resolve(null);
  }
  // Generate at the content-box size (inside the tile border) so the art fills
  // that box exactly and stays centered rather than clipping bottom-right.
  const contentW = tileW - 2 * TILE_BORDER;
  const contentH = tileH - 2 * TILE_BORDER;
  return cardArtDataUri(
    io,
    imageId,
    contentW * scale,
    contentH * scale,
    cardRadiusPx(contentW, contentH) * scale,
  );
}

/**
 * Builds one card tile: the art (or a name-only fallback) and a quantity badge
 * when held in multiples. Badge size tracks the tile so it stays legible in the
 * dense main grid and the larger hero/sideboard tiles alike.
 * @returns The tile element.
 */
function cardTile(
  card: DeckImageCard,
  dataUri: string | null,
  tileW: number,
  tileH: number,
): Element {
  const badgeH = Math.max(20, Math.round(tileH * 0.18));
  // Art / fallback fill the content box inside the border so they stay centered.
  const contentW = tileW - 2 * TILE_BORDER;
  const contentH = tileH - 2 * TILE_BORDER;
  const image: Element = dataUri
    ? { type: "img", props: { src: dataUri, width: contentW, height: contentH } }
    : element(
        "div",
        {
          display: "flex",
          width: contentW,
          height: contentH,
          alignItems: "center",
          justifyContent: "center",
          padding: 8,
          textAlign: "center",
          fontSize: Math.max(12, Math.round(tileW * 0.16)),
          fontWeight: 600,
          color: COLORS.muted,
          lineHeight: 1.2,
        },
        card.cardName,
      );

  const badge =
    card.quantity > 1 &&
    element(
      "div",
      {
        display: "flex",
        position: "absolute",
        bottom: 5,
        right: 5,
        alignItems: "center",
        justifyContent: "center",
        height: badgeH,
        minWidth: badgeH,
        paddingLeft: 6,
        paddingRight: 6,
        borderRadius: Math.round(badgeH * 0.28),
        backgroundColor: "rgba(8,9,12,0.82)",
        color: COLORS.text,
        fontSize: Math.round(badgeH * 0.62),
        fontWeight: 700,
      },
      `×${card.quantity}`,
    );

  return element(
    "div",
    {
      display: "flex",
      position: "relative",
      width: tileW,
      height: tileH,
      borderRadius: cardRadiusPx(tileW, tileH),
      overflow: "hidden",
      backgroundColor: COLORS.surface,
      border: `${TILE_BORDER}px solid ${COLORS.surfaceBorder}`,
    },
    image,
    badge,
  );
}

/**
 * Sums rune quantities per domain (a rune carries one domain; a multi-domain
 * rune folds into "rainbow"), so the identity panel can show one glyph per
 * domain with its count.
 * @returns Domain → total rune count, highest first.
 */
function runeCountsByDomain(runes: readonly DeckImageCard[]): { domain: string; count: number }[] {
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

/**
 * Loads and rasterizes a rune-domain glyph to a PNG data URI at `sizePx`.
 * @returns The glyph data URI, or null when the glyph asset is absent.
 */
async function glyphUri(
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

/**
 * A titled section: a small gold label with a rule, then a wrapping row of tiles.
 * Used for the sideboard, battlefields, and runes bands under the main grid.
 * @returns The section element.
 */
function deckSection(label: string, tiles: Child[], marginTop = 0): Element {
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

/** Longest deck title kept before eliding; bounds the title so it never runs into
 * the right-aligned format/count. Elided in code (not via `overflow: hidden`) so
 * the title stays a plain text node whose flex baseline is its text baseline —
 * an overflow-clipped node reports its box bottom as the baseline instead, which
 * pushes the "by Name" byline off the title's baseline. */
const TITLE_MAX_CHARS = 34;

/** @returns The deck title, truncated with an ellipsis when longer than the cap. */
export function truncateTitle(title: string): string {
  return title.length > TITLE_MAX_CHARS
    ? `${title.slice(0, TITLE_MAX_CHARS - 1).trimEnd()}…`
    : title;
}

/** @returns A presentable format label from a deck-format slug. */
export function formatLabelFromSlug(slug: string): string {
  const spaced = slug.replaceAll("-", " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Compares two deck cards by energy (nulls last), then name, for cost-curve order.
 * @returns A standard comparator result (negative, zero, or positive).
 */
function byEnergyThenName(left: DeckImageCard, right: DeckImageCard): number {
  return (left.energy ?? 99) - (right.energy ?? 99) || left.cardName.localeCompare(right.cardName);
}

/** A deck card reference the renderer can enrich: identity, printing, zone, count. */
export interface DeckImageCardRef {
  cardId: string;
  preferredPrintingId: string | null;
  quantity: number;
  zone: string;
}

/**
 * Resolves the printing art and card meta for a set of card references and maps
 * them to the render shape, mirroring how the public deck route enriches cards.
 * Shared by the by-id builder (server decks) and the from-cards render endpoint
 * (browser-local decks, which have no server row — ADR-035).
 * @returns The cards with names, energy, domains, and art ids.
 */
export async function buildDeckImageCardsFromRefs(
  repos: Pick<Repos, "catalog" | "canonicalPrintings">,
  cards: readonly DeckImageCardRef[],
  options: { skipUnknown?: boolean } = {},
): Promise<DeckImageCard[]> {
  const uniqueCardIds = [...new Set(cards.map((card) => card.cardId))];
  const [cardMetas, printingMetas] = await Promise.all([
    repos.catalog.cardsByIds(uniqueCardIds),
    repos.canonicalPrintings.resolvePrintingMetaForRows(
      cards.map((card) => ({ cardId: card.cardId, preferredPrintingId: card.preferredPrintingId })),
    ),
  ]);
  const metaById = new Map(cardMetas.map((meta) => [meta.id, meta]));
  const result: DeckImageCard[] = [];
  for (const [index, row] of cards.entries()) {
    const meta = metaById.get(row.cardId);
    if (!meta) {
      // The by-id caller treats a missing card as a broken invariant; the
      // public from-cards endpoint tolerates a stale/unknown id and drops it.
      if (options.skipUnknown) {
        continue;
      }
      throw new Error(`Missing enrichment for deck card ${row.cardId}`);
    }
    result.push({
      cardName: meta.name,
      quantity: row.quantity,
      imageId: printingMetas[index]?.imageId ?? null,
      energy: meta.energy,
      domains: meta.domains,
      zone: row.zone,
    });
  }
  return result;
}

/**
 * Resolves the printing art for a saved deck's cards and maps them to the render
 * shape.
 * @returns The deck's cards with names, energy, domains, and art ids.
 */
export async function buildDeckImageCards(
  repos: Pick<Repos, "decks" | "catalog" | "canonicalPrintings">,
  deckId: string,
  userId: string,
): Promise<DeckImageCard[]> {
  const cards = await repos.decks.cardsForDeck(deckId, userId);
  return buildDeckImageCardsFromRefs(repos, cards);
}

/**
 * Renders a deck share image to a PNG buffer (ADR-031). `scale` renders the same
 * base layout at N× resolution for the HQ download.
 * @returns PNG bytes ready to return as `image/png`.
 */
export async function renderDeckImage(io: Io, input: DeckImageInput, scale = 1): Promise<Buffer> {
  const zone = WellKnown.deckZone;
  const legend = input.cards.find((card) => card.zone === zone.LEGEND) ?? null;
  const runes = input.cards.filter((card) => card.zone === zone.RUNES);
  const battlefields = input.cards
    .filter((card) => card.zone === zone.BATTLEFIELD)
    .slice(0, MAX_BATTLEFIELDS);
  const sideboard = input.cards
    .filter((card) => card.zone === zone.SIDEBOARD)
    .sort(byEnergyThenName);
  // Champions lead the grid (the deck's identity units), then the rest by cost.
  const champions = input.cards
    .filter((card) => card.zone === zone.CHAMPION)
    .sort(byEnergyThenName);
  const mainline = input.cards
    .filter((card) => card.zone === zone.MAIN || card.zone === zone.OVERFLOW)
    .sort(byEnergyThenName);
  const gridCards = [...champions, ...mainline];
  // Conventional deck size: champions + main only, reported separately from the
  // sideboard. Overflow copies still show in the grid but are not counted (nor are
  // legend, battlefields, or runes).
  const mainCardCount = gridCards
    .filter((card) => card.zone !== zone.OVERFLOW)
    .reduce((sum, card) => sum + card.quantity, 0);
  const sideboardCount = sideboard.reduce((sum, card) => sum + card.quantity, 0);

  // The left panel is the legend hero alone, vertically centred; the QR + host
  // mark moved to the bottom-right of the grid area.
  const hasLeftPanel = legend !== null;
  const leftW = hasLeftPanel ? LEFT_W : 0;
  const innerW = WIDTH - PAD * 2;
  const bodyH = HEIGHT - PAD * 2 - TITLE_H - GAP;
  const rightW = innerW - leftW - (hasLeftPanel ? BODY_GAP : 0);

  // Legend fills the panel width (small inset), centred over the full height.
  const legendW = LEFT_W - 14;
  const legendH = Math.round(legendW / CARD_ASPECT);

  const runeCards = [...runes].sort(
    (left, right) => right.quantity - left.quantity || left.cardName.localeCompare(right.cardName),
  );

  // Bottom band: sideboard on its own full-width row, then battlefields + runes
  // sharing the row beneath with the QR mark on the right. The section tiles grow
  // to fill whatever vertical space the main grid leaves — a shallow deck yields a
  // short grid and larger sections — capped by a max scale and by each row's width
  // so nothing ever wraps.
  const willHaveFooter = Boolean(input.shareUrl) || Boolean(input.siteHost);
  const hasSideboard = sideboard.length > 0;
  const bfCount = battlefields.length;
  const runeCount = runeCards.length;
  const bottomRowScalable = bfCount > 0 || runeCount > 0;
  const hasBottomRow = bottomRowScalable || willHaveFooter;

  const bandGaps = hasSideboard && hasBottomRow ? GAP : 0;
  const bottomRowFixedH = hasBottomRow && !bottomRowScalable ? QR_SIZE : 0;
  const bandFixedH =
    (hasSideboard ? SECTION_HEADER_H : 0) +
    (bottomRowScalable ? SECTION_HEADER_H : 0) +
    bandGaps +
    bottomRowFixedH;
  const naturalTiles =
    (hasSideboard ? SIDEBOARD_TILE_H : 0) + (bottomRowScalable ? BATTLEFIELD_BAND_TILE_H : 0);
  const naturalBandH = naturalTiles + bandFixedH;
  const bandTopGap = naturalBandH > 0 ? GAP : 0;

  // Reserve the natural band, pack the grid, then hand the leftover back to the band.
  const gridAreaH = bodyH - naturalBandH - bandTopGap;
  const grid =
    gridCards.length > 0 ? packGrid(gridCards.length, rightW, gridAreaH, CARD_ASPECT) : null;
  const gridRows = grid ? Math.ceil(gridCards.length / grid.cols) : 0;
  const gridH = grid ? gridRows * grid.tileH + Math.max(0, gridRows - 1) * GAP : 0;

  const availTiles = bodyH - bandTopGap - gridH - bandFixedH;
  const vScale = naturalTiles > 0 ? Math.max(1, availTiles / naturalTiles) : 1;
  const MAX_TILE_SCALE = 1.7;

  // Sideboard: full-width row; cap height so every tile fits one row.
  const sideboardTileH = hasSideboard
    ? Math.floor(
        Math.min(
          SIDEBOARD_TILE_H * MAX_TILE_SCALE,
          SIDEBOARD_TILE_H * vScale,
          (rightW - (sideboard.length - 1) * GAP) / sideboard.length / CARD_ASPECT,
        ),
      )
    : 0;

  // Battlefields + runes share their row with the QR mark; cap height so both
  // sections plus the full mark (host label + QR) fit the row width. The host
  // width is estimated generously (12px/char at 20px) so the sections shrink
  // rather than shoving the QR past the clipped right edge.
  const hostMarkW = input.siteHost ? input.siteHost.length * 12 : 0;
  const footerMarkW =
    (input.siteHost ? hostMarkW : 0) +
    (input.siteHost && input.shareUrl ? 14 : 0) +
    (input.shareUrl ? QR_SIZE : 0);
  const bottomRowAvailW = rightW - (footerMarkW > 0 ? footerMarkW + BODY_GAP : 0);
  const bottomUnitW = bfCount * BATTLEFIELD_ASPECT + runeCount * CARD_ASPECT;
  const bottomGapsW =
    Math.max(0, bfCount - 1) * GAP +
    Math.max(0, runeCount - 1) * GAP +
    (bfCount > 0 && runeCount > 0 ? BODY_GAP : 0);
  const bottomWidthCapH =
    bottomUnitW > 0 ? (bottomRowAvailW - bottomGapsW) / bottomUnitW : Number.POSITIVE_INFINITY;
  const bottomTileH = bottomRowScalable
    ? Math.floor(
        Math.min(
          BATTLEFIELD_BAND_TILE_H * MAX_TILE_SCALE,
          BATTLEFIELD_BAND_TILE_H * vScale,
          bottomWidthCapH,
        ),
      )
    : 0;
  const runeTileH = bottomTileH;
  const sideboardTileW = Math.floor(sideboardTileH * CARD_ASPECT);
  const battlefieldTileW = Math.floor(bottomTileH * BATTLEFIELD_ASPECT);
  const runeTileW = Math.floor(runeTileH * CARD_ASPECT);

  const domains = runeCountsByDomain(runes).map((entry) => entry.domain);

  // Resolve every raster source up front (art is the dominant cost).
  const [
    legendUri,
    backdropUri,
    gridUris,
    battlefieldUris,
    sideboardUris,
    runeUris,
    domainUris,
    qrUri,
  ] = await Promise.all([
    legend ? artUri(io, legend.imageId, legendW, legendH, scale) : Promise.resolve(null),
    // The backdrop is blurred anyway, so render it at half resolution and let
    // satori scale it up — the payload stays small even at the HQ scale.
    legend?.imageId
      ? blurredArtBackdropDataUri(
          io,
          legend.imageId,
          Math.round((WIDTH / 2) * scale),
          Math.round((HEIGHT / 2) * scale),
        )
      : Promise.resolve(null),
    grid
      ? Promise.all(
          gridCards.map((card) => artUri(io, card.imageId, grid.tileW, grid.tileH, scale)),
        )
      : Promise.resolve([]),
    Promise.all(
      battlefields.map((card) => artUri(io, card.imageId, battlefieldTileW, bottomTileH, scale)),
    ),
    Promise.all(
      sideboard.map((card) => artUri(io, card.imageId, sideboardTileW, sideboardTileH, scale)),
    ),
    Promise.all(runeCards.map((card) => artUri(io, card.imageId, runeTileW, runeTileH, scale))),
    Promise.all(domains.map((domain) => glyphUri(io, domain, DOMAIN_ICON, scale))),
    input.shareUrl
      ? QRCode.toDataURL(input.shareUrl, {
          errorCorrectionLevel: "M",
          width: QR_SIZE * scale,
          // The 2-module quiet zone is white rather than transparent, so it
          // doubles as the light plate the code needs. That keeps the mark's
          // footprint at exactly QR_SIZE for the layout maths below.
          margin: 2,
          color: { dark: "#000000", light: "#ffffff" },
        }).catch(() => null)
      : Promise.resolve(null),
  ]);

  const hasFooterMark = Boolean(qrUri) || Boolean(input.siteHost);

  // ── Title row ──────────────────────────────────────────────────────────────
  // Name + byline keep their shared text baseline in a left group; the count and
  // the deck's domain glyphs sit as a vertically-centred cluster on the right.
  const domainIcons = domainUris
    .map((uri) =>
      uri
        ? ({ type: "img", props: { src: uri, width: DOMAIN_ICON, height: DOMAIN_ICON } } as Element)
        : element("div", {
            display: "flex",
            width: DOMAIN_ICON,
            height: DOMAIN_ICON,
            borderRadius: DOMAIN_ICON / 2,
            backgroundColor: COLORS.gold,
          }),
    )
    .slice(0, domains.length);
  const titleRow = element(
    "div",
    {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      height: TITLE_H,
      marginBottom: GAP,
    },
    element(
      "div",
      { display: "flex", flexDirection: "row", flexShrink: 1, alignItems: "baseline" },
      element(
        "div",
        {
          display: "flex",
          flexShrink: 1,
          fontSize: 34,
          lineHeight: 1,
          fontWeight: 700,
          color: COLORS.text,
          maxWidth: 560,
          whiteSpace: "nowrap",
        },
        truncateTitle(input.deckName),
      ),
      input.ownerName
        ? element(
            "div",
            {
              display: "flex",
              flexShrink: 0,
              marginLeft: 12,
              fontSize: 22,
              lineHeight: 1,
              fontWeight: 600,
              color: COLORS.gold,
              // satori's baseline alignment leaves the smaller run ~2px low next
              // to the 34px title; nudge it up so the two share one baseline.
              transform: "translateY(-2px)",
            },
            // "by Name" rather than "· Name": the middle dot is a mid-height glyph
            // that floats oddly beside the much larger deck title, whereas plain
            // lowercase text shares the title's baseline cleanly.
            `by ${input.ownerName}`,
          )
        : false,
    ),
    element("div", { display: "flex", flexGrow: 1, minWidth: 24 }),
    element(
      "div",
      { display: "flex", flexDirection: "row", flexShrink: 0, alignItems: "center", gap: 14 },
      element(
        "div",
        { display: "flex", fontSize: 20, lineHeight: 1, color: COLORS.muted },
        `${input.formatLabel} · ${mainCardCount}${sideboardCount > 0 ? ` + ${sideboardCount}` : ""} ${mainCardCount + sideboardCount === 1 ? "card" : "cards"}`,
      ),
      domainIcons.length > 0
        ? element(
            "div",
            { display: "flex", flexDirection: "row", alignItems: "center", gap: 6 },
            ...domainIcons,
          )
        : false,
    ),
  );

  // ── Left panel: the legend hero, top-aligned with the main grid ────────────
  const leftPanel =
    hasLeftPanel &&
    element(
      "div",
      {
        display: "flex",
        flexDirection: "column",
        width: leftW,
        alignItems: "center",
        justifyContent: "flex-start",
      },
      legend && cardTile(legend, legendUri, legendW, legendH),
    );

  // ── Main grid (right column) ─────────────────────────────────────────────
  const mainGrid =
    grid &&
    element(
      "div",
      {
        display: "flex",
        flexDirection: "row",
        flexWrap: "wrap",
        alignContent: "flex-start",
        width: grid.cols * grid.tileW + (grid.cols - 1) * GAP,
        gap: GAP,
      },
      ...gridCards.map((card, index) =>
        cardTile(card, gridUris[index] ?? null, grid.tileW, grid.tileH),
      ),
    );

  // ── Bottom band: sideboard on its own row, then battlefields + runes sharing
  // the row beneath with the QR + host mark pinned bottom-right ──────────────
  const sideboardSection =
    hasSideboard &&
    deckSection(
      "SIDEBOARD",
      sideboard.map((card, index) =>
        cardTile(card, sideboardUris[index] ?? null, sideboardTileW, sideboardTileH),
      ),
      GAP,
    );

  const battlefieldSection =
    bfCount > 0 &&
    deckSection(
      "BATTLEFIELDS",
      battlefields.map((card, index) =>
        cardTile(card, battlefieldUris[index] ?? null, battlefieldTileW, bottomTileH),
      ),
    );

  const runesSection =
    runeCount > 0 &&
    deckSection(
      "RUNES",
      runeCards.map((card, index) => cardTile(card, runeUris[index] ?? null, runeTileW, runeTileH)),
    );

  // Scannable host label beside the QR, bottom-right. The code is dark-on-white
  // rather than gold-on-transparent: a light-on-dark code is inverted polarity,
  // which older and cheaper scanners refuse, and this image is the artifact most
  // likely to be scanned off a stranger's phone.
  const footerMark =
    hasFooterMark &&
    element(
      "div",
      { display: "flex", flexDirection: "row", flexShrink: 0, alignItems: "center", gap: 14 },
      input.siteHost
        ? element(
            "div",
            { display: "flex", fontSize: 20, fontWeight: 600, color: COLORS.muted },
            input.siteHost,
          )
        : false,
      qrUri
        ? {
            type: "img",
            props: { src: qrUri, width: QR_SIZE, height: QR_SIZE, style: { borderRadius: 6 } },
          }
        : false,
    );

  const bottomRow =
    hasBottomRow &&
    element(
      "div",
      {
        display: "flex",
        flexDirection: "row",
        alignItems: "flex-end",
        gap: BODY_GAP,
        // Same fixed gap the sideboard uses above itself, so the padding above
        // both bands is identical regardless of how far the grid fills.
        marginTop: GAP,
      },
      battlefieldSection && element("div", { display: "flex", flexShrink: 0 }, battlefieldSection),
      runesSection && element("div", { display: "flex", flexShrink: 0 }, runesSection),
      element("div", { display: "flex", flexGrow: 1 }),
      footerMark,
    );

  // No flex spacer between the grid and the band: the band tiles are already sized
  // to fill the leftover height, so the two sections keep a fixed gap above them
  // and the band lands at the bottom. Any residual slack falls below the band.
  const rightColumn = element(
    "div",
    { display: "flex", flexDirection: "column", flexGrow: 1 },
    mainGrid || element("div", { display: "flex", flexGrow: 1 }),
    sideboardSection,
    bottomRow,
  );

  const emptyNotice =
    gridCards.length === 0 &&
    !hasLeftPanel &&
    element(
      "div",
      {
        display: "flex",
        flexGrow: 1,
        alignItems: "center",
        justifyContent: "center",
        fontSize: 28,
        color: COLORS.muted,
      },
      "No cards yet",
    );

  const body = element(
    "div",
    { display: "flex", flexDirection: "row", flexGrow: 1, gap: BODY_GAP },
    leftPanel,
    emptyNotice || rightColumn,
  );

  const glowBackground = legend ? legendGlowBackground(legend.domains) : undefined;

  // Full-art identity, mirroring the web deck hero: the legend's art blurred
  // across the whole canvas at low opacity, under a vertical scrim that keeps
  // the title row and the bottom band readable. The domain glow stays beneath
  // and shows through the art's transparency.
  const heroBackdrop =
    backdropUri &&
    element(
      "div",
      { display: "flex", position: "absolute", top: 0, left: 0, width: WIDTH, height: HEIGHT },
      {
        type: "img",
        props: {
          src: backdropUri,
          width: WIDTH,
          height: HEIGHT,
          style: { opacity: 0.35 },
        },
      },
      element("div", {
        display: "flex",
        position: "absolute",
        top: 0,
        left: 0,
        width: WIDTH,
        height: HEIGHT,
        backgroundImage:
          "linear-gradient(to bottom, rgba(20,22,29,0.85) 0%, rgba(20,22,29,0.35) 30%, rgba(20,22,29,0.35) 65%, rgba(20,22,29,0.9) 100%)",
      }),
    );

  const root = element(
    "div",
    {
      display: "flex",
      position: "relative",
      flexDirection: "column",
      width: WIDTH,
      height: HEIGHT,
      padding: PAD,
      backgroundColor: COLORS.background,
      ...(glowBackground ? { backgroundImage: glowBackground } : {}),
      color: COLORS.text,
      fontFamily: "Hanken Grotesk",
      overflow: "hidden",
    },
    heroBackdrop,
    titleRow,
    body,
  );

  return renderTreeToPng(io, root, WIDTH, HEIGHT, scale);
}
