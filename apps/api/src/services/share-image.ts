import type { ShareImageAspect } from "@openrift/shared/share-image-params";
import { SHARE_IMAGE_CANVAS } from "@openrift/shared/share-image-params";

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
 * Server-rendered share images for lists, collections and user bundles.
 * Landscape is the og:image for the public share routes and a downloadable
 * attachment. The 9:16 canvas is a separate download-only composition.
 */

const { width: WIDTH, height: HEIGHT } = SHARE_IMAGE_CANVAS.landscape;
const PAD = 24;
const GAP = 10;
const TITLE_H = 52;
const FOOTER_H = QR_SIZE;
const FOOTER_LABEL_H = 26;
const GRID_GAP = 12;
const MAX_TILES = 12;
const TITLE_MAX_CHARS = 46;

const TITLE_SIZE = 34;
const BYLINE_SIZE = 22;
const META_SIZE = 20;

const { width: V_WIDTH, height: V_HEIGHT } = SHARE_IMAGE_CANVAS.vertical;
const V_PAD = 28;
const V_TITLE_H = 92;
const V_TITLE_SIZE = 46;
const V_BYLINE_SIZE = 28;
const V_META_SIZE = 26;
const V_TITLE_MAX_CHARS = 30;
const V_HEADER_QR = 132;
const V_FOOTER_H = 32;
const V_FOOTER_FONT = 24;
const V_GRID_GAP = 14;
const V_MAX_TILES = 20;

export interface ShareImageCard {
  cardName: string;
  quantity: number;
  imageId: string | null;
}

export interface ShareImageInput {
  ownerName: string;
  title: string;
  intentLabel: string;
  unit: { one: string; many: string };
  cards: readonly ShareImageCard[];
  totalCount: number;
  siteHost?: string;
  shareUrl?: string;
}

export interface ShareImageOptions {
  aspect?: ShareImageAspect;
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

/** Picks the column count that makes `count` tiles as large as the area allows. */
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

export type MarkPlacement = "tile" | "cell" | "footer" | "none";

/** Must never be the reason the card art shrinks. */
export function markPlacement(
  cardCount: number,
  overflow: boolean,
  hasMark: boolean,
  areaW: number,
  fullAreaH: number,
  withQr = true,
): MarkPlacement {
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
 * Every part is optional: only built when at least one of moreCount, qrUri,
 * or siteHost is present.
 */
function markCell(
  moreCount: number,
  qrUri: string | null,
  siteHost: string | undefined,
  cellW: number,
  cellH: number,
): Element {
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

function titleRow(input: ShareImageInput): Element {
  // All three runs share one flex-end row: separately centered boxes of
  // different heights would leave their baselines offset.
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

function verticalTitleBlock(input: ShareImageInput, qrUri: string | null, blockH: number): Element {
  const type = element(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      flexGrow: 1,
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
      // No baseline correction needed: both runs pin lineHeight 1 and the row centers its children.
      element(
        "div",
        {
          display: "flex",
          fontSize: V_META_SIZE,
          lineHeight: 1,
          color: COLORS.muted,
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
 * Overflow is measured against `totalCount`, not `cards.length`, so "+N more"
 * stays accurate when the route pre-caps how many entries it resolves art for.
 */
function selectCards(input: ShareImageInput, maxTiles: number): ShownCards {
  const ordered = [...input.cards].sort(
    (a, b) => b.quantity - a.quantity || a.cardName.localeCompare(b.cardName),
  );
  const overflow = input.totalCount > maxTiles;
  const shown = overflow ? ordered.slice(0, maxTiles - 1) : ordered.slice(0, maxTiles);
  return { shown, overflow, moreCount: overflow ? input.totalCount - shown.length : 0 };
}

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

  // Fixed width so exactly `cols` tiles wrap per row.
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

/** `markPlacement` does not apply here: the overflow tile is always just "+N more". */
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
    // Host and QR are already placed in the footer/title block here.
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
