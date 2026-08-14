import type { Io } from "../io.js";
import type { Child, Element } from "./share-image-core.js";
import {
  CARD_ASPECT,
  COLORS,
  QR_SIZE,
  baselineNudge,
  cardRadiusPx,
  cardTile,
  element,
  elideTitle,
  qrDataUri,
  qrMark,
  renderTreeToPng,
  tileArtDataUri,
} from "./share-image-core.js";

/**
 * Server-rendered share images for lists and bundles (ADR-024). satori lays an
 * element tree out to SVG, then resvg rasterizes it to PNG (both via
 * `share-image-core`). The output is wired as the og:image for the public share
 * routes and offered as a downloadable attachment, so a pasted link unfurls with
 * card art in WhatsApp and Discord.
 *
 * Layout opens with the same title row the deck and tier-list images use (name,
 * owner, and what the list is), then gives the rest of the canvas to the card
 * grid, whose columns/rows are computed so the cards are as large as the space
 * allows and the rows stay balanced (no stubby last row).
 *
 * The host + QR mark moves to wherever it is free (`markPlacement`): into the
 * overflow tile, into a trailing cell, or into a footer band. Unlike the deck
 * and tier-list images — which have fixed furniture to hang a footer off — this
 * one is nothing but grid, so a reserved band came straight out of the card art.
 *
 * This used to carry a bordered caption bar that never drew the list's name,
 * which made a shared wishlist unfurl as an anonymous wall of art. The title row
 * replaced it: the name is the one thing a recipient needs, and the shared
 * heading means the three share images now read as one product.
 */

const WIDTH = 1200;
const HEIGHT = 630;
const PAD = 24;
const GAP = 10;
const TITLE_H = 52;
/** The footer is exactly the mark's height: the QR is the tallest thing in it. */
const FOOTER_H = QR_SIZE;
const GRID_GAP = 12;
/** Card tiles shown before collapsing the remainder into a "+N more" tile (2 rows of 6). */
const MAX_TILES = 12;
/** Longest title kept before eliding, so it never collides with the right cluster. */
const TITLE_MAX_CHARS = 46;

/** The title row's three type sizes. Named because the baseline corrections are
 * derived from the gaps between them, so a size change must reach both places. */
const TITLE_SIZE = 34;
const BYLINE_SIZE = 22;
const META_SIZE = 20;

/** One card in the grid. `imageId` is the resolved image_files.id, or null when no art exists. */
export interface ShareImageCard {
  cardName: string;
  quantity: number;
  imageId: string | null;
}

/** Everything the renderer needs to draw a list or bundle share image. */
export interface ShareImageInput {
  /** Public display name of the owner, shown next to the title. */
  ownerName: string;
  /** List name, drawn as the title. */
  title: string;
  /** What the list is, e.g. "Trade list" or "Wishlist". */
  intentLabel: string;
  /** Singular/plural unit for the count, e.g. { one: "printing", many: "printings" }. */
  unit: { one: string; many: string };
  /** Distinct cards to show; the renderer sorts, caps, and collapses the rest. */
  cards: readonly ShareImageCard[];
  /** Headline count, e.g. number of distinct cards across the list/bundle. */
  totalCount: number;
  /** Host shown in the footer (e.g. "openrift.app"); omitted when empty. */
  siteHost?: string;
  /** Absolute share URL encoded in the QR; the QR is dropped when absent (an
   * owner downloading an unshared list has no link to encode). */
  shareUrl?: string;
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

/** Where the host + scan code end up for a given list. */
export type MarkPlacement =
  /** Inside the overflow tile, which the grid was already spending a cell on. */
  | "tile"
  /** A trailing grid cell of its own. */
  | "cell"
  /** A band below the grid, in slack the cards could not have used anyway. */
  | "footer"
  /** Nowhere: nothing to link to and no host to name. */
  | "none";

/**
 * Picks where the mark goes, on one rule — it must never be the reason the card
 * art shrinks.
 *
 * An overflow tile is free, because the grid already spends a cell on it. With
 * no overflow the two candidates trade off against the grid's binding
 * constraint: a one-row grid is limited by width, so the footer sits in vertical
 * slack the cards could not have used, while a two-row grid is limited by height,
 * where every pixel the footer takes comes off the art and a trailing cell is far
 * cheaper. Rather than encode that as a row-count rule, size both and keep the
 * one that leaves the cards larger.
 * @returns The chosen placement.
 */
export function markPlacement(
  cardCount: number,
  overflow: boolean,
  hasMark: boolean,
  areaW: number,
  fullAreaH: number,
): MarkPlacement {
  // An overflowing list needs the tile whether or not there is a mark to put in
  // it, so the mark rides along for free either way.
  if (overflow) {
    return "tile";
  }
  if (!hasMark) {
    return "none";
  }
  const asFooter = computeGrid(Math.max(cardCount, 1), areaW, fullAreaH - FOOTER_H - GAP);
  const asCell = computeGrid(cardCount + 1, areaW, fullAreaH);
  return asCell.cellW > asFooter.cellW ? "cell" : "footer";
}

/**
 * The tile that closes the grid: "+N more", the scan code, and the host, in one
 * card-shaped cell. Folding the mark into the overflow tile is what lets the
 * grid keep the full canvas — the tile is a cell the layout already spends, so
 * the code and the host ride along for nothing. The dashed border marks it as a
 * stand-in rather than a card, matching the tier-list image's overflow chip.
 *
 * Every part is optional: an unshared list has no code, a list that fits has no
 * "+N more", and the tile is only built when at least one of them is present.
 * @returns The tile element.
 */
function markCell(
  moreCount: number,
  qrUri: string | null,
  siteHost: string | undefined,
  cellW: number,
  cellH: number,
): Element {
  // Sized off the cell so the tile reads the same in a six-across grid (~180px)
  // and a seven-across one (~150px).
  const qrSize = Math.min(QR_SIZE, cellW - 28);
  const moreFont = Math.round(cellW * 0.19);
  const hostFont = Math.max(11, Math.round(cellW * 0.075));

  return element(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      width: cellW,
      height: cellH,
      alignItems: "center",
      justifyContent: "center",
      gap: Math.round(cellH * 0.045),
      borderRadius: cardRadiusPx(cellW, cellH),
      backgroundColor: COLORS.surface,
      border: `1px dashed ${COLORS.surfaceBorder}`,
    },
    moreCount > 0
      ? element(
          "div",
          { display: "flex", flexDirection: "row", alignItems: "baseline" },
          element(
            "div",
            { display: "flex", color: COLORS.gold, fontSize: moreFont, fontWeight: 700 },
            `+${moreCount}`,
          ),
          element(
            "div",
            {
              display: "flex",
              marginLeft: 6,
              color: COLORS.muted,
              fontSize: Math.round(moreFont * 0.62),
              fontWeight: 600,
              transform: `translateY(${baselineNudge(moreFont, Math.round(moreFont * 0.62))}px)`,
            },
            "more",
          ),
        )
      : false,
    qrUri ? qrMark(qrUri, qrSize) : false,
    siteHost
      ? element(
          "div",
          { display: "flex", color: COLORS.muted, fontSize: hostFont, fontWeight: 600 },
          siteHost,
        )
      : false,
  );
}

/**
 * The title row: the list's name with the owner's byline on one baseline, and
 * what the list is plus its size as a muted cluster on the right. Identical in
 * construction and type roles to the deck and tier-list heading rows — gold
 * marks who made it, muted carries the incidental metadata.
 * @returns The title row element.
 */
function titleRow(input: ShareImageInput): Element {
  const countLabel = `${input.totalCount} ${input.totalCount === 1 ? input.unit.one : input.unit.many}`;

  // One bottom-aligned row holds all three runs, rather than a baseline-aligned
  // left group centred beside a separately-centred right one: two centred boxes
  // of different heights each sit on their own centre line, so their baselines
  // step apart by half the height difference and no per-run offset can close it.
  // Sharing one bottom edge is what makes the nudges below meaningful.
  const runs = element(
    "div",
    { display: "flex", flexDirection: "row", alignItems: "flex-end", flexGrow: 1 },
    element(
      "div",
      {
        display: "flex",
        flexShrink: 1,
        fontSize: TITLE_SIZE,
        lineHeight: 1,
        fontWeight: 700,
        color: COLORS.text,
        whiteSpace: "nowrap",
      },
      elideTitle(input.title, TITLE_MAX_CHARS),
    ),
    input.ownerName
      ? element(
          "div",
          {
            display: "flex",
            flexShrink: 0,
            marginLeft: 12,
            fontSize: BYLINE_SIZE,
            lineHeight: 1,
            fontWeight: 600,
            color: COLORS.gold,
            transform: `translateY(${baselineNudge(TITLE_SIZE, BYLINE_SIZE)}px)`,
          },
          `by ${input.ownerName}`,
        )
      : false,
    element("div", { display: "flex", flexGrow: 1, minWidth: 24 }),
    element(
      "div",
      {
        display: "flex",
        flexShrink: 0,
        fontSize: META_SIZE,
        lineHeight: 1,
        color: COLORS.muted,
        transform: `translateY(${baselineNudge(TITLE_SIZE, META_SIZE)}px)`,
      },
      `${input.intentLabel} · ${countLabel}`,
    ),
  );

  return element(
    "div",
    {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      height: TITLE_H,
      flexShrink: 0,
    },
    runs,
  );
}

/**
 * Renders a list or bundle share image to a PNG buffer (ADR-024). `scale`
 * renders the same base layout at N× resolution for the HQ download, as the
 * deck and tier-list renderers do.
 * @returns PNG bytes ready to return as `image/png`.
 */
export async function renderShareImage(io: Io, input: ShareImageInput, scale = 1): Promise<Buffer> {
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

  const hasMark = Boolean(input.siteHost) || Boolean(input.shareUrl);
  const areaW = WIDTH - PAD * 2;
  const fullAreaH = HEIGHT - PAD * 2 - TITLE_H - GAP;
  const placement = markPlacement(shown.length, overflow, hasMark, areaW, fullAreaH);

  const cellCount = shown.length + (placement === "tile" || placement === "cell" ? 1 : 0);
  const areaH = placement === "footer" ? fullAreaH - FOOTER_H - GAP : fullAreaH;
  const { cols, cellW, cellH } = computeGrid(Math.max(cellCount, 1), areaW, areaH);

  const [dataUris, qrUri] = await Promise.all([
    Promise.all(shown.map((card) => tileArtDataUri(io, card.imageId, cellW, cellH, scale))),
    input.shareUrl ? qrDataUri(input.shareUrl, scale) : Promise.resolve(null),
  ]);

  const cells: Child[] = shown.map((card, index) =>
    cardTile(card, dataUris[index] ?? null, cellW, cellH),
  );
  if (placement === "tile" || placement === "cell") {
    cells.push(markCell(moreCount, qrUri, input.siteHost, cellW, cellH));
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
    },
    grid,
  );

  // Host label left, mark right — the same bottom-right footer the deck and
  // tier-list images carry. Only drawn when the grid left room for it.
  const footer: Child =
    placement === "footer" &&
    element(
      "div",
      {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        height: FOOTER_H,
        marginTop: GAP,
        flexShrink: 0,
      },
      input.siteHost
        ? element(
            "div",
            { display: "flex", fontSize: 20, fontWeight: 600, color: COLORS.muted },
            input.siteHost,
          )
        : false,
      element("div", { display: "flex", flexGrow: 1 }),
      qrUri ? qrMark(qrUri) : false,
    );

  const root = element(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      width: WIDTH,
      height: HEIGHT,
      padding: PAD,
      backgroundColor: COLORS.background,
      backgroundImage:
        "radial-gradient(80% 120% at 0% 0%, rgba(205,172,110,0.14) 0%, transparent 60%)",
      color: COLORS.text,
      fontFamily: "Hanken Grotesk",
      overflow: "hidden",
    },
    titleRow(input),
    element("div", { display: "flex", height: GAP, flexShrink: 0 }),
    gridArea,
    footer,
  );

  return renderTreeToPng(io, root, WIDTH, HEIGHT, scale);
}
