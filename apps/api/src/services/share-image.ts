import type { Io } from "../io.js";
import type { Child, Element, ShareImageAspect } from "./share-image-core.js";
import {
  CANVAS,
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
 * Server-rendered share images for lists, collections and user bundles.
 * satori lays an element tree out to SVG, then resvg rasterizes it to PNG
 * (both via `share-image-core`). The landscape output is wired as the og:image
 * for the public share routes and offered as a downloadable attachment, so a
 * pasted link unfurls with card art in WhatsApp and Discord.
 *
 * On landscape the host + QR mark moves to wherever it is free
 * (`markPlacement`): into the overflow tile, into a trailing cell, or into a
 * footer band. Unlike the deck and tier-list images — which have fixed furniture
 * to hang a footer off — this canvas is nothing but grid, so a reserved band
 * would come straight out of the card art.
 *
 * The 9:16 canvas is a second composition, as it is for the deck and tier-list
 * images: a download-only export for the places a list is read on a phone held
 * upright. There the mark does have furniture to sit in — a two-line title block
 * with room for a large QR at its right, and a footer that is only the host —
 * so the grid keeps the whole middle of the canvas. At the same twelve cards
 * that is a tile roughly 1.6× the landscape one; the cap is raised instead, to
 * twenty cards still drawn wider than landscape draws twelve. Landscape's
 * geometry is deliberately left alone: it is what every published og:image
 * already looks like.
 */

const { width: WIDTH, height: HEIGHT } = CANVAS.landscape;
const PAD = 24;
const GAP = 10;
const TITLE_H = 52;
/** The footer is exactly the mark's height: the QR is the tallest thing in it. */
const FOOTER_H = QR_SIZE;
/** Height the footer reserves when the mark carries no code — one line of type. */
const FOOTER_LABEL_H = 26;
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

const { width: V_WIDTH, height: V_HEIGHT } = CANVAS.vertical;
const V_PAD = 28;
/** Title line, then the byline and the count on a second line beneath it. */
const V_TITLE_H = 92;
/** Type steps up with the canvas: a story is read at arm's length on a phone,
 * where the landscape sizes would be a fraction of the frame's width. */
const V_TITLE_SIZE = 46;
const V_BYLINE_SIZE = 28;
const V_META_SIZE = 26;
/** Narrower canvas and larger type than landscape, and the byline no longer
 * shares the line, so the whole width is the title's. */
const V_TITLE_MAX_CHARS = 30;
/**
 * The vertical mark rides the title block, at the size the deck and tier-list
 * vertical exports use. It has room there that the landscape grid never has —
 * which is why that canvas still threads the mark through `markPlacement`.
 */
const V_HEADER_QR = 132;
/** The vertical footer is only the host label, so it reserves one line. */
const V_FOOTER_H = 32;
const V_FOOTER_FONT = 24;
/** Gap between vertical tiles, a shade wider than landscape's because the tiles
 * themselves are roughly 1.6× as large. */
const V_GRID_GAP = 14;
/**
 * Tiles shown on the vertical canvas before the "+N more" tile takes over. The
 * grid packs 20 into a 4×5 board at ~230px a tile, still wider than the ~180px
 * a landscape image gives twelve — past that the cards read as thumbnails.
 */
const V_MAX_TILES = 20;

/** One card in the grid. `imageId` is the resolved image_files.id, or null when no art exists. */
export interface ShareImageCard {
  cardName: string;
  quantity: number;
  imageId: string | null;
}

export interface ShareImageInput {
  ownerName: string;
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

/** Canvas and mark choices a caller can make; both default to today's output. */
export interface ShareImageOptions {
  /** Canvas to compose on. Landscape is the og:image; vertical is a download. */
  aspect?: ShareImageAspect;
  /**
   * Whether to encode `shareUrl` as a scannable code. False keeps the host
   * branding and drops only the code, for a creator compositing the image
   * somewhere the link would be noise.
   */
  qr?: boolean;
}

interface GridSpec {
  cols: number;
  cellW: number;
  cellH: number;
}

function computeGrid(count: number, areaW: number, areaH: number): GridSpec {
  const rows = count <= 6 ? 1 : 2;
  const cols = Math.ceil(count / rows);
  return gridAtColumns(count, cols, areaW, areaH, GRID_GAP);
}

function gridAtColumns(
  count: number,
  cols: number,
  areaW: number,
  areaH: number,
  gap: number,
): GridSpec {
  const rows = Math.ceil(count / cols);
  const cellWByWidth = (areaW - (cols - 1) * gap) / cols;
  const cellHByHeight = (areaH - (rows - 1) * gap) / rows;
  const cellH = Math.floor(Math.min(cellHByHeight, cellWByWidth / CARD_ASPECT));
  const cellW = Math.floor(cellH * CARD_ASPECT);
  return { cols, cellW, cellH };
}

/**
 * Picks the column count that makes `count` tiles as large as the area allows.
 * The landscape grid does not need this — two rows is always the answer on a
 * canvas barely taller than one card — but the 9:16 area is deep enough that the
 * right shape genuinely varies: five cards want two columns of three, twenty
 * want four of five, and a fixed row rule would leave either case half empty.
 */
export function bestGridForArea(
  count: number,
  areaW: number,
  areaH: number,
  gap: number,
): GridSpec {
  const tiles = Math.max(count, 1);
  let best = gridAtColumns(tiles, 1, areaW, areaH, gap);
  for (let cols = 2; cols <= tiles; cols++) {
    const candidate = gridAtColumns(tiles, cols, areaW, areaH, gap);
    if (candidate.cellW > best.cellW) {
      best = candidate;
    }
  }
  return best;
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
 *
 * `withQr` false changes the answer, not just the drawing: the mark is then a
 * single host label, and a card-sized cell holding one small line of type reads
 * as a card that failed to load. So it always takes the footer, which at label
 * height costs the grid a fraction of what the full band does.
 */
export function markPlacement(
  cardCount: number,
  overflow: boolean,
  hasMark: boolean,
  areaW: number,
  fullAreaH: number,
  withQr = true,
): MarkPlacement {
  // An overflowing list needs the tile whether or not there is a mark to put in
  // it, so the mark rides along for free either way.
  if (overflow) {
    return "tile";
  }
  if (!hasMark) {
    return "none";
  }
  if (!withQr) {
    return "footer";
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

function countLabel(input: ShareImageInput): string {
  return `${input.totalCount} ${input.totalCount === 1 ? input.unit.one : input.unit.many}`;
}

/**
 * The landscape title row. Identical in construction and type roles to the
 * deck and tier-list heading rows — gold marks who made it, muted carries the
 * incidental metadata.
 */
function titleRow(input: ShareImageInput): Element {
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
      `${input.intentLabel} · ${countLabel(input)}`,
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
 * The vertical title block. Stacked rather than strung along a single row
 * because the canvas is narrower than landscape while the type is larger, so
 * all three runs on one line would leave the title a dozen characters. Same
 * construction as the tier-list and deck vertical exports.
 */
function verticalTitleBlock(input: ShareImageInput, qrUri: string | null, blockH: number): Element {
  const type = element(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      flexGrow: 1,
      // The two lines never fill the block once the QR sets its height, so they
      // keep their own height and centre against the mark.
      height: V_TITLE_H,
    },
    element(
      "div",
      {
        display: "flex",
        fontSize: V_TITLE_SIZE,
        lineHeight: 1,
        fontWeight: 700,
        color: COLORS.text,
        whiteSpace: "nowrap",
      },
      elideTitle(input.title, V_TITLE_MAX_CHARS),
    ),
    element(
      "div",
      { display: "flex", flexDirection: "row", alignItems: "center", marginTop: 14 },
      input.ownerName
        ? element(
            "div",
            {
              display: "flex",
              fontSize: V_BYLINE_SIZE,
              lineHeight: 1,
              fontWeight: 600,
              color: COLORS.gold,
            },
            `by ${input.ownerName}`,
          )
        : false,
      element("div", { display: "flex", flexGrow: 1, minWidth: 24 }),
      element(
        "div",
        {
          display: "flex",
          fontSize: V_META_SIZE,
          lineHeight: 1,
          color: COLORS.muted,
          // Both runs pin lineHeight 1 and the row centres its children, so
          // neither sits on the other's baseline and the correction the
          // landscape row needs does not apply here.
        },
        `${input.intentLabel} · ${countLabel(input)}`,
      ),
    ),
  );

  return element(
    "div",
    {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      height: blockH,
      flexShrink: 0,
    },
    type,
    qrUri
      ? element(
          "div",
          { display: "flex", flexShrink: 0, marginLeft: 16 },
          qrMark(qrUri, V_HEADER_QR),
        )
      : false,
  );
}

interface ShownCards {
  shown: ShareImageCard[];
  overflow: boolean;
  moreCount: number;
}

/**
 * Orders the cards and splits off the overflow: multiples first, then
 * alphabetical, so the grid leads with the most tradeable cards.
 *
 * Overflow is measured against the true total (not the possibly pre-capped
 * cards array), so "+N more" stays accurate when the route caps how many
 * entries it resolves art for (per-render work bound).
 */
function selectCards(input: ShareImageInput, maxTiles: number): ShownCards {
  const ordered = [...input.cards].sort(
    (a, b) => b.quantity - a.quantity || a.cardName.localeCompare(b.cardName),
  );
  const overflow = input.totalCount > maxTiles;
  const shown = overflow ? ordered.slice(0, maxTiles - 1) : ordered.slice(0, maxTiles);
  return { shown, overflow, moreCount: overflow ? input.totalCount - shown.length : 0 };
}

/**
 * Renders a list, collection or bundle share image to a PNG buffer. `scale`
 * renders the same base layout at N× resolution for the HQ download, as the
 * deck and tier-list renderers do.
 */
export function renderShareImage(
  io: Io,
  input: ShareImageInput,
  scale = 1,
  options: ShareImageOptions = {},
): Promise<Buffer> {
  const withQr = options.qr !== false;
  return options.aspect === "vertical"
    ? renderVerticalShareImage(io, input, scale, withQr)
    : renderLandscapeShareImage(io, input, scale, withQr);
}

async function renderLandscapeShareImage(
  io: Io,
  input: ShareImageInput,
  scale: number,
  withQr: boolean,
): Promise<Buffer> {
  const { shown, overflow, moreCount } = selectCards(input, MAX_TILES);

  const hasMark = Boolean(input.siteHost) || Boolean(withQr && input.shareUrl);
  const areaW = WIDTH - PAD * 2;
  const fullAreaH = HEIGHT - PAD * 2 - TITLE_H - GAP;
  const placement = markPlacement(shown.length, overflow, hasMark, areaW, fullAreaH, withQr);
  const footerH = withQr ? FOOTER_H : FOOTER_LABEL_H;

  const cellCount = shown.length + (placement === "tile" || placement === "cell" ? 1 : 0);
  const areaH = placement === "footer" ? fullAreaH - footerH - GAP : fullAreaH;
  const { cols, cellW, cellH } = computeGrid(Math.max(cellCount, 1), areaW, areaH);

  const [dataUris, qrUri] = await Promise.all([
    Promise.all(shown.map((card) => tileArtDataUri(io, card.imageId, cellW, cellH, scale))),
    withQr && input.shareUrl ? qrDataUri(input.shareUrl, scale) : Promise.resolve(null),
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
  // tier-list images carry.
  const footer: Child =
    placement === "footer" &&
    element(
      "div",
      {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        height: footerH,
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

/**
 * The 9:16 composition. The mark has its own furniture here, so
 * `markPlacement` does not apply — the overflow tile, when there is one, is
 * just "+N more".
 */
async function renderVerticalShareImage(
  io: Io,
  input: ShareImageInput,
  scale: number,
  withQr: boolean,
): Promise<Buffer> {
  const { shown, overflow, moreCount } = selectCards(input, V_MAX_TILES);

  const hasQr = withQr && Boolean(input.shareUrl);
  const hasFooter = Boolean(input.siteHost);
  const titleH = hasQr ? Math.max(V_TITLE_H, V_HEADER_QR) : V_TITLE_H;
  const areaW = V_WIDTH - V_PAD * 2;
  const areaH = V_HEIGHT - V_PAD * 2 - titleH - GAP - (hasFooter ? V_FOOTER_H + GAP : 0);

  const cellCount = shown.length + (overflow ? 1 : 0);
  const { cols, cellW, cellH } = bestGridForArea(Math.max(cellCount, 1), areaW, areaH, V_GRID_GAP);

  const [dataUris, qrUri] = await Promise.all([
    Promise.all(shown.map((card) => tileArtDataUri(io, card.imageId, cellW, cellH, scale))),
    hasQr && input.shareUrl ? qrDataUri(input.shareUrl, scale, V_HEADER_QR) : Promise.resolve(null),
  ]);

  const cells: Child[] = shown.map((card, index) =>
    cardTile(card, dataUris[index] ?? null, cellW, cellH),
  );
  if (overflow) {
    // The host rides the footer and the code the title block, so the overflow
    // tile carries only the count it exists for.
    cells.push(markCell(moreCount, null, undefined, cellW, cellH));
  }

  const grid = element(
    "div",
    {
      display: "flex",
      flexDirection: "row",
      flexWrap: "wrap",
      width: cols * cellW + (cols - 1) * V_GRID_GAP,
      gap: V_GRID_GAP,
      alignContent: "center",
      justifyContent: "center",
    },
    ...cells,
  );

  const gridArea = element(
    "div",
    { display: "flex", flexGrow: 1, alignItems: "center", justifyContent: "center" },
    grid,
  );

  const footer: Child =
    hasFooter &&
    element(
      "div",
      {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        height: V_FOOTER_H,
        marginTop: GAP,
        flexShrink: 0,
      },
      input.siteHost
        ? element(
            "div",
            { display: "flex", fontSize: V_FOOTER_FONT, fontWeight: 600, color: COLORS.muted },
            input.siteHost,
          )
        : false,
    );

  const root = element(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      width: V_WIDTH,
      height: V_HEIGHT,
      padding: V_PAD,
      backgroundColor: COLORS.background,
      backgroundImage:
        "radial-gradient(80% 120% at 0% 0%, rgba(205,172,110,0.14) 0%, transparent 60%)",
      color: COLORS.text,
      fontFamily: "Hanken Grotesk",
      overflow: "hidden",
    },
    verticalTitleBlock(input, qrUri, titleH),
    element("div", { display: "flex", height: GAP, flexShrink: 0 }),
    gridArea,
    footer,
  );

  return renderTreeToPng(io, root, V_WIDTH, V_HEIGHT, scale);
}
