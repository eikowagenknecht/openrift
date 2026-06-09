import satori from "satori";

import type { Io } from "../io.js";
import { CARD_MEDIA_DIR } from "./image-rehost.js";

/**
 * Server-rendered share images for lists and bundles (ADR-024). satori lays an
 * element tree out to SVG, then the existing sharp rasterizes it to PNG. The
 * output is wired as the og:image for the public share routes and offered as a
 * downloadable attachment, so a pasted link unfurls with card art in WhatsApp
 * and Discord.
 *
 * Layout: a slim caption bar across the top (owner, intent, count, brand) and a
 * full-bleed grid of card art filling the rest. The grid columns/rows are
 * computed so the cards are as large as the space allows and the rows stay
 * balanced (no stubby last row).
 *
 * satori speaks a CSS subset: every container with more than one child needs an
 * explicit `display: "flex"`, the default flex direction is `row`, and colors
 * must be concrete (no oklch). Card thumbnails are stored as WebP, which satori
 * cannot embed, so each is transcoded to PNG with sharp first.
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
/** Corner radius for card tiles (the thumbnail is masked to it so corners never bleed). */
const CARD_RADIUS = 14;
/** Largest self-hosted variant (short edge ~800px); the tiles are big now, so use it. */
const THUMB_VARIANT = "full";

// Concrete approximations of the site's dark theme (apps/web/src/index.css).
const COLORS = {
  background: "#14161d", // --background  oklch(0.16 0.025 260)
  surface: "#21242b", // --card        oklch(0.22 0.005 260)
  surfaceBorder: "#2d313a",
  text: "#f2f2f2", // --foreground  oklch(0.95 0 0)
  muted: "#9aa0ab", // --muted-foreground
  gold: "#cdac6e", // --primary     oklch(0.74 0.09 80)
} as const;

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

interface Element {
  type: string;
  props: Record<string, unknown>;
}
type Child = Element | string | false | null | undefined;

interface GridSpec {
  cols: number;
  cellW: number;
  cellH: number;
}

/**
 * Minimal hyperscript so the layout reads top-down without JSX (the api is not
 * set up for JSX). Falsy children are dropped so conditionals inline cleanly.
 * @returns A satori-compatible element node.
 */
function element(type: string, style: Record<string, unknown>, ...children: Child[]): Element {
  const kept = children.filter(
    (child): child is Element | string => child !== false && child !== null && child !== undefined,
  );
  const childProp = kept.length === 0 ? undefined : kept.length === 1 ? kept[0] : kept;
  return { type, props: { style, children: childProp } };
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

let cachedFonts: { name: string; data: Buffer; weight: 400 | 600 | 700; style: "normal" }[] | null =
  null;

/**
 * Loads the bundled Inter weights once and reuses them across renders. The TTFs
 * ship in the api image (the Dockerfile copies all of apps/api and runs from
 * source); satori cannot read the WOFF2 the web app uses, hence the static TTFs.
 * @returns The satori `fonts` array.
 */
async function loadFonts(io: Io): Promise<NonNullable<typeof cachedFonts>> {
  if (cachedFonts) {
    return cachedFonts;
  }
  const fontDir = `${import.meta.dirname}/../assets/fonts`;
  const read = (file: string): Promise<Buffer> => io.fs.readFile(`${fontDir}/${file}`);
  cachedFonts = [
    { name: "Inter", data: await read("Inter-Regular.ttf"), weight: 400, style: "normal" },
    { name: "Inter", data: await read("Inter-SemiBold.ttf"), weight: 600, style: "normal" },
    { name: "Inter", data: await read("Inter-Bold.ttf"), weight: 700, style: "normal" },
  ];
  return cachedFonts;
}

/**
 * Reads a card thumbnail off disk and transcodes it to a fixed-size PNG data
 * URI. Cards vary in orientation (portrait vs landscape), so `fit: "contain"`
 * letterboxes each onto a uniform transparent tile that drops onto the dark
 * grid cleanly. Rendered at 2x the cell size for crispness when platforms scale.
 * @returns A `data:image/png;base64,...` URI, or null if the file is unreadable.
 */
async function thumbnailDataUri(
  io: Io,
  imageId: string,
  cellW: number,
  cellH: number,
): Promise<string | null> {
  try {
    const path = `${CARD_MEDIA_DIR}/${imageId.slice(-2)}/${imageId}-${THUMB_VARIANT}.webp`;
    const source = await io.fs.readFile(path);
    const width = cellW * 2;
    const height = cellH * 2;
    const radius = CARD_RADIUS * 2;
    // Round the thumbnail's corners in sharp (transparent outside the radius)
    // rather than relying on the tile's overflow:hidden — satori does not clip a
    // child <img> to the parent's border-radius, so a square scan would
    // otherwise poke past the rounded tile at the corners.
    const cornerMask = Buffer.from(
      `<svg width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
    );
    const png = await io
      .sharp(source)
      .resize(width, height, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .composite([{ input: cornerMask, blend: "dest-in" }])
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    // A missing or corrupt file falls back to a name-only tile rather than
    // failing the whole image.
    return null;
  }
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
  const image: Element = dataUri
    ? { type: "img", props: { src: dataUri, width: cellW, height: cellH } }
    : element(
        "div",
        {
          display: "flex",
          width: cellW,
          height: cellH,
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
      borderRadius: 14,
      overflow: "hidden",
      backgroundColor: COLORS.surface,
      border: `1px solid ${COLORS.surfaceBorder}`,
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
      borderRadius: 14,
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
  const fonts = await loadFonts(io);

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

  const dataUris = await Promise.all(
    shown.map((card) =>
      card.imageId ? thumbnailDataUri(io, card.imageId, cellW, cellH) : Promise.resolve(null),
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

  const svg = await satori(root as unknown as Parameters<typeof satori>[0], {
    width: WIDTH,
    height: HEIGHT,
    fonts,
  });

  return io.sharp(Buffer.from(svg)).png().toBuffer();
}
