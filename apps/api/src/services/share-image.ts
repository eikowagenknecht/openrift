import type { Io } from "../io.js";
import type { Child, Element } from "./share-image-core.js";
import {
  COLORS,
  cardArtDataUri,
  cardRadiusPx,
  element,
  renderTreeToPng,
} from "./share-image-core.js";

/**
 * Server-rendered share images for lists and bundles (ADR-024). satori lays an
 * element tree out to SVG, then resvg rasterizes it to PNG (both via
 * `share-image-core`). The output is wired as the og:image for the public share
 * routes and offered as a downloadable attachment, so a pasted link unfurls with
 * card art in WhatsApp and Discord.
 *
 * Layout: a slim caption bar across the top (owner, intent, count, brand) and a
 * full-bleed grid of card art filling the rest. The grid columns/rows are
 * computed so the cards are as large as the space allows and the rows stay
 * balanced (no stubby last row). The deck renderer (`deck-image.ts`) builds a
 * richer layout from the same primitives.
 */

const WIDTH = 1200;
const HEIGHT = 630;
const TOP_BAR_H = 66;
/** Horizontal padding for the bar and the grid area, and the grid's bottom pad. */
const PAD = 18;
const GRID_GAP = 12;
/** Card tiles shown before collapsing the remainder into a "+N more" tile (2 rows of 6). */
const MAX_TILES = 12;
/** Portrait card aspect (width / height); landscape cards letterbox within the same box. */
const CARD_ASPECT = 0.715;
/** Tile border width. Art is sized to the box inside it so it stays centered:
 * satori uses border-box, so a full-cell-sized image is pinned top-left and
 * clipped bottom-right, shifting the card down-right. */
const TILE_BORDER = 1;

/** One card in the grid. `imageId` is the resolved image_files.id, or null when no art exists. */
export interface ShareImageCard {
  cardName: string;
  quantity: number;
  imageId: string | null;
}

/** Everything the renderer needs to draw a list or bundle share image. */
export interface ShareImageInput {
  /** Public display name of the owner, shown in the caption bar. */
  ownerName: string;
  /** List name (kept for callers/tests; not drawn, the bar stays minimal). */
  title: string;
  /** Caption label, e.g. "Trade list" or "Wishlist". */
  intentLabel: string;
  /** Singular/plural unit for the count, e.g. { one: "printing", many: "printings" }. */
  unit: { one: string; many: string };
  /** Distinct cards to show; the renderer sorts, caps, and collapses the rest. */
  cards: readonly ShareImageCard[];
  /** Headline count, e.g. number of distinct cards across the list/bundle. */
  totalCount: number;
  /** Host shown in the bar (e.g. "openrift.app"); omitted when empty. */
  siteHost?: string;
}

interface GridSpec {
  cols: number;
  cellW: number;
  cellH: number;
}

/**
 * Picks columns/rows and a card-shaped cell size so `count` tiles fill the grid
 * area as large as possible with balanced rows (1 row for a handful, otherwise
 * 2). Cells keep the portrait card aspect; the image is contained within.
 * @returns The column count and cell dimensions.
 */
function computeGrid(count: number, areaW: number, areaH: number): GridSpec {
  const rows = count <= 6 ? 1 : 2;
  const cols = Math.ceil(count / rows);
  const cellWByWidth = (areaW - (cols - 1) * GRID_GAP) / cols;
  const cellHByHeight = (areaH - (rows - 1) * GRID_GAP) / rows;
  const cellH = Math.floor(Math.min(cellHByHeight, cellWByWidth / CARD_ASPECT));
  const cellW = Math.floor(cellH * CARD_ASPECT);
  return { cols, cellW, cellH };
}

/**
 * Builds one grid cell: the card art (or a name-only fallback) plus a quantity
 * badge when the card is held in multiples.
 * @returns The cell element.
 */
function cardCell(
  card: ShareImageCard,
  dataUri: string | null,
  cellW: number,
  cellH: number,
): Element {
  // Art / fallback fill the content box inside the border so they stay centered.
  const contentW = cellW - 2 * TILE_BORDER;
  const contentH = cellH - 2 * TILE_BORDER;
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
          padding: 12,
          textAlign: "center",
          fontSize: 21,
          fontWeight: 600,
          color: COLORS.muted,
          lineHeight: 1.25,
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
        bottom: 8,
        right: 8,
        alignItems: "center",
        justifyContent: "center",
        height: 34,
        minWidth: 34,
        paddingLeft: 9,
        paddingRight: 9,
        borderRadius: 9,
        backgroundColor: "rgba(8,9,12,0.82)",
        color: COLORS.text,
        fontSize: 22,
        fontWeight: 700,
      },
      `×${card.quantity}`,
    );

  return element(
    "div",
    {
      display: "flex",
      position: "relative",
      width: cellW,
      height: cellH,
      borderRadius: cardRadiusPx(cellW, cellH),
      overflow: "hidden",
      backgroundColor: COLORS.surface,
      border: `${TILE_BORDER}px solid ${COLORS.surfaceBorder}`,
    },
    image,
    badge,
  );
}

/**
 * Builds the "+N more" tile shown when the list exceeds the grid capacity.
 * @returns The overflow tile element.
 */
function moreCell(moreCount: number, cellW: number, cellH: number): Element {
  return element(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      width: cellW,
      height: cellH,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: cardRadiusPx(cellW, cellH),
      backgroundColor: COLORS.surface,
      border: `1px solid ${COLORS.surfaceBorder}`,
      color: COLORS.muted,
      fontSize: 26,
      fontWeight: 700,
    },
    element("div", { display: "flex", color: COLORS.gold, fontSize: 40 }, `+${moreCount}`),
    element("div", { display: "flex", marginTop: 4 }, "more"),
  );
}

/**
 * Builds the slim top caption bar.
 * @returns The bar element.
 */
function captionBar(input: ShareImageInput): Element {
  const sep = (): Element =>
    element("div", { display: "flex", color: COLORS.muted, marginLeft: 10, marginRight: 10 }, "·");
  const countLabel = `${input.totalCount} ${input.totalCount === 1 ? input.unit.one : input.unit.many}`;

  return element(
    "div",
    {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      height: TOP_BAR_H,
      paddingLeft: PAD,
      paddingRight: PAD,
      borderBottom: `1px solid ${COLORS.surfaceBorder}`,
      fontSize: 24,
    },
    element(
      "div",
      { display: "flex", flexDirection: "row", alignItems: "center" },
      element("div", { display: "flex", color: COLORS.gold, fontWeight: 600 }, input.ownerName),
      sep(),
      element("div", { display: "flex", color: COLORS.muted }, input.intentLabel),
      sep(),
      element("div", { display: "flex", color: COLORS.muted }, countLabel),
    ),
    element(
      "div",
      { display: "flex", flexDirection: "row", alignItems: "center" },
      element("div", {
        display: "flex",
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: COLORS.gold,
        marginRight: 10,
      }),
      element(
        "div",
        { display: "flex", color: COLORS.muted, fontWeight: 600 },
        input.siteHost ?? "OpenRift",
      ),
    ),
  );
}

/**
 * Renders a list or bundle share image to a PNG buffer (ADR-024).
 * @returns PNG bytes ready to return as `image/png`.
 */
export async function renderShareImage(io: Io, input: ShareImageInput): Promise<Buffer> {
  // Surface multiples first, then alphabetical, so the grid leads with the most
  // tradeable cards. Collapse the overflow into a single "+N more" tile.
  const ordered = [...input.cards].sort(
    (a, b) => b.quantity - a.quantity || a.cardName.localeCompare(b.cardName),
  );
  // Overflow is measured against the true total (not the possibly pre-capped
  // cards array), so "+N more" stays accurate when the route caps how many
  // entries it resolves art for (per-render work bound; see the image route).
  const overflow = input.totalCount > MAX_TILES;
  const shown = overflow ? ordered.slice(0, MAX_TILES - 1) : ordered.slice(0, MAX_TILES);
  const moreCount = overflow ? input.totalCount - shown.length : 0;
  const cellCount = shown.length + (overflow ? 1 : 0);

  const areaW = WIDTH - PAD * 2;
  const areaH = HEIGHT - TOP_BAR_H - PAD;
  const { cols, cellW, cellH } = computeGrid(Math.max(cellCount, 1), areaW, areaH);

  // Content-box size (inside the tile border) so the art stays centered, at 2×
  // for crispness when platforms upscale the preview.
  const artW = cellW - 2 * TILE_BORDER;
  const artH = cellH - 2 * TILE_BORDER;
  const dataUris = await Promise.all(
    shown.map((card) =>
      card.imageId
        ? cardArtDataUri(io, card.imageId, artW * 2, artH * 2, cardRadiusPx(artW, artH) * 2)
        : Promise.resolve(null),
    ),
  );

  const cells: Child[] = shown.map((card, index) => cardCell(card, dataUris[index], cellW, cellH));
  if (overflow) {
    cells.push(moreCell(moreCount, cellW, cellH));
  }

  // Fixed-width wrapping container so exactly `cols` tiles sit per row (balanced
  // rows), centered in the area below the bar.
  const grid = element(
    "div",
    {
      display: "flex",
      flexDirection: "row",
      flexWrap: "wrap",
      width: cols * cellW + (cols - 1) * GRID_GAP,
      gap: GRID_GAP,
      alignContent: "center",
      justifyContent: "center",
    },
    ...cells,
  );

  const gridArea = element(
    "div",
    {
      display: "flex",
      flexGrow: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: PAD,
    },
    grid,
  );

  const root = element(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      width: WIDTH,
      height: HEIGHT,
      backgroundColor: COLORS.background,
      color: COLORS.text,
      fontFamily: "Inter",
      overflow: "hidden",
    },
    captionBar(input),
    gridArea,
  );

  return renderTreeToPng(io, root, WIDTH, HEIGHT);
}
