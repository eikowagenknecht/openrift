import type { ShareImageAspect } from "@openrift/shared/share-image-params";
import { SHARE_IMAGE_CANVAS } from "@openrift/shared/share-image-params";
import { tierRowColor } from "@openrift/shared/tier-colors";
import { legendDisplayName } from "@openrift/shared/utils";

import type { Repos } from "../../../deps.js";
import type { Io } from "../../../io.js";
import type { Child, Element } from "../../system/services/share-image-core.js";
import {
  CARD_ASPECT,
  COLORS,
  TILE_BORDER,
  baselineNudge,
  cardRadiusPx,
  cardTile,
  element,
  elideTitle,
  qrDataUri,
  qrMark,
  renderTreeToPng,
  tileArtDataUri,
} from "../../system/services/share-image-core.js";

/**
 * Unranked cards never reach this renderer; empty rows are still drawn.
 * The vertical canvas rows size to their wrapped content, not an even split.
 */

const PAD = 24;
const GAP = 10;

const TILE_GAP = 4;

const FOOTER_H = 26;

const ROW_GAP = 8;
const ROW_PAD = 5;
const MIN_TILE_H = 12;
const LABEL_W = 58;

const TITLE_MAX_CHARS = 46;

const TITLE_SIZE = 34;
const BYLINE_SIZE = 22;
const META_SIZE = 20;

interface TierCanvas {
  width: number;
  height: number;
  pad: number;
  labelW: number;
  titleSize: number;
  bylineSize: number;
  metaSize: number;
  titleMaxChars: number;
  titleH: number;
  headerQr: number;
  maxLines: number;
}

const LANDSCAPE: TierCanvas = {
  ...SHARE_IMAGE_CANVAS.landscape,
  pad: PAD,
  labelW: LABEL_W,
  titleSize: TITLE_SIZE,
  bylineSize: BYLINE_SIZE,
  metaSize: META_SIZE,
  titleMaxChars: TITLE_MAX_CHARS,
  titleH: 52,
  headerQr: 104,
  maxLines: 1,
};

const VERTICAL: TierCanvas = {
  ...SHARE_IMAGE_CANVAS.vertical,
  pad: 28,
  labelW: 88,
  titleSize: 46,
  bylineSize: 28,
  metaSize: 26,
  titleMaxChars: 30,
  titleH: 92,
  headerQr: 132,
  maxLines: 3,
};

function canvasFor(aspect: ShareImageAspect): TierCanvas {
  return aspect === "vertical" ? VERTICAL : LANDSCAPE;
}

export function truncateTierListTitle(title: string, max = TITLE_MAX_CHARS): string {
  return elideTitle(title, max);
}

export interface TierListImageEntry {
  cardId: string;
  printingId: string | null;
}

export interface TierListImageCard {
  cardName: string;
  imageId: string | null;
}

export interface TierListImageRow {
  label: string;
  cards: readonly TierListImageCard[];
  unranked?: boolean;
}

export interface TierListImageInput {
  title: string;
  ownerName?: string;
  rows: readonly TierListImageRow[];
  siteHost?: string;
  shareUrl?: string;
}

/** One tile size for the whole board: a card in S is exactly as large as a card in D. */
interface BoardMetrics {
  rowH: number;
  tileH: number;
  tileW: number;
  maxTilesPerRow: number;
}

/** Landscape only: caps are global, not per row. See `measureWrappedBoard` for vertical. */
export function measureBoard(
  rowCount: number,
  cardsInFullestRow: number,
  areaW: number,
  areaH: number,
  labelW = LABEL_W,
): BoardMetrics {
  const rowH = Math.floor((areaH - Math.max(0, rowCount - 1) * ROW_GAP) / Math.max(1, rowCount));
  const heightCap = rowH - 2 * ROW_PAD;
  const tilesAreaW = areaW - labelW - ROW_PAD;
  const widthCap =
    cardsInFullestRow > 0
      ? (tilesAreaW - (cardsInFullestRow - 1) * TILE_GAP) / cardsInFullestRow / CARD_ASPECT
      : Number.POSITIVE_INFINITY;
  const tileH = Math.max(MIN_TILE_H, Math.floor(Math.min(heightCap, widthCap)));
  const tileW = Math.max(9, Math.floor(tileH * CARD_ASPECT));
  const maxTilesPerRow = Math.max(1, Math.floor((tilesAreaW + TILE_GAP) / (tileW + TILE_GAP)));
  return { rowH, tileH, tileW, maxTilesPerRow };
}

/** Tile size is global across rows even though row height varies with wrap. */
export interface WrappedBoardMetrics {
  tileH: number;
  tileW: number;
  tilesPerLine: number;
  linesPerRow: number[];
  rowHeights: number[];
}

function wrapAtTileHeight(
  cardCounts: readonly number[],
  tilesAreaW: number,
  tileH: number,
  maxLines: number,
): { metrics: Omit<WrappedBoardMetrics, "tileH">; totalH: number } {
  const tileW = Math.max(9, Math.floor(tileH * CARD_ASPECT));
  const tilesPerLine = Math.max(1, Math.floor((tilesAreaW + TILE_GAP) / (tileW + TILE_GAP)));
  const linesPerRow = cardCounts.map((count) =>
    Math.min(maxLines, Math.max(1, Math.ceil(count / tilesPerLine))),
  );
  const rowHeights = linesPerRow.map(
    (lines) => lines * tileH + (lines - 1) * TILE_GAP + 2 * ROW_PAD,
  );
  const totalH =
    rowHeights.reduce((sum, height) => sum + height, 0) +
    Math.max(0, cardCounts.length - 1) * ROW_GAP;
  return { metrics: { tileW, tilesPerLine, linesPerRow, rowHeights }, totalH };
}

/**
 * Total height rises monotonically with tile height, so binary search finds
 * the largest fit; if the smallest tile still overflows, the wrap allowance
 * is spent one line at a time.
 */
export function measureWrappedBoard(
  cardCounts: readonly number[],
  areaW: number,
  areaH: number,
  labelW: number,
  maxLines: number,
): WrappedBoardMetrics {
  const tilesAreaW = Math.max(1, areaW - labelW - 2 * ROW_PAD);
  if (cardCounts.length === 0) {
    return { tileH: MIN_TILE_H, tileW: 9, tilesPerLine: 1, linesPerRow: [], rowHeights: [] };
  }

  for (let lines = Math.max(1, maxLines); lines >= 1; lines--) {
    let low = MIN_TILE_H;
    let high = Math.max(MIN_TILE_H, Math.floor(Math.min(areaH, tilesAreaW / CARD_ASPECT)));
    if (wrapAtTileHeight(cardCounts, tilesAreaW, low, lines).totalH > areaH) {
      continue;
    }
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (wrapAtTileHeight(cardCounts, tilesAreaW, mid, lines).totalH <= areaH) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return { tileH: low, ...wrapAtTileHeight(cardCounts, tilesAreaW, low, lines).metrics };
  }

  // Falls back to overflowing and clipping when single-line minimum tiles still don't fit.
  return {
    tileH: MIN_TILE_H,
    ...wrapAtTileHeight(cardCounts, tilesAreaW, MIN_TILE_H, 1).metrics,
  };
}

function overflowChip(hidden: number, tileW: number, tileH: number): Element {
  return element(
    "div",
    {
      display: "flex",
      width: tileW,
      height: tileH,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: cardRadiusPx(tileW, tileH),
      backgroundColor: COLORS.surface,
      border: `${TILE_BORDER}px dashed ${COLORS.surfaceBorder}`,
      color: COLORS.muted,
      fontSize: Math.max(9, Math.round(tileW * 0.3)),
      fontWeight: 700,
    },
    `+${hidden}`,
  );
}

/** satori has no text overflow; an over-long label would push tiles off the row. */
export function fitRowLabel(label: string, rowH: number): string {
  const max = Math.max(3, Math.round((rowH / 24) * 2));
  return label.length > max ? label.slice(0, max) : label;
}

const BOLD_CHAR_WIDTH_RATIO = 0.58;

/**
 * Measured against the chip's width: the vertical board's rows are much
 * taller than wide, so `fitRowLabel`'s height heuristic doesn't apply.
 */
export function fitRowLabelToChip(label: string, chipW: number, fontSize: number): string {
  const max = Math.max(1, Math.floor(chipW / (fontSize * BOLD_CHAR_WIDTH_RATIO)));
  return label.length > max ? label.slice(0, max) : label;
}

function boardRow(
  row: TierListImageRow,
  color: string,
  uris: readonly (string | null)[],
  metrics: BoardMetrics,
): Element {
  const shown = row.cards.slice(0, metrics.maxTilesPerRow);
  const hidden = row.cards.length - shown.length;
  // Chip replaces the last visible card so the row doesn't overflow its width.
  const visible = hidden > 0 ? shown.slice(0, -1) : shown;
  const hiddenTotal = row.cards.length - visible.length;

  const label = element(
    "div",
    {
      display: "flex",
      width: LABEL_W,
      height: metrics.rowH,
      flexShrink: 0,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: color,
      color: "#14161d",
      fontSize: Math.max(12, Math.round(metrics.rowH * 0.42)),
      fontWeight: 700,
    },
    fitRowLabel(row.label, metrics.rowH),
  );

  const tiles = element(
    "div",
    {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      flexGrow: 1,
      height: metrics.rowH,
      paddingLeft: ROW_PAD,
      paddingRight: ROW_PAD,
      gap: TILE_GAP,
      overflow: "hidden",
    },
    ...visible.map((card, index) =>
      cardTile(card, uris[index] ?? null, metrics.tileW, metrics.tileH),
    ),
    hiddenTotal > 0 && overflowChip(hiddenTotal, metrics.tileW, metrics.tileH),
  );

  return element(
    "div",
    {
      display: "flex",
      flexDirection: "row",
      height: metrics.rowH,
      borderRadius: 6,
      overflow: "hidden",
      backgroundColor: "rgba(255,255,255,0.035)",
      border: `1px solid ${COLORS.surfaceBorder}`,
    },
    label,
    tiles,
  );
}

function wrappedBoardRow(
  row: TierListImageRow,
  color: string,
  uris: readonly (string | null)[],
  metrics: WrappedBoardMetrics,
  index: number,
  labelW: number,
): Element {
  const rowH = metrics.rowHeights[index] ?? 0;
  const lines = metrics.linesPerRow[index] ?? 1;
  const capacity = lines * metrics.tilesPerLine;
  const shown = row.cards.slice(0, capacity);
  const hidden = row.cards.length - shown.length;
  const visible = hidden > 0 ? shown.slice(0, -1) : shown;
  const hiddenTotal = row.cards.length - visible.length;

  const labelSize = Math.max(12, Math.min(Math.round(rowH * 0.42), Math.round(labelW * 0.5)));

  const label = element(
    "div",
    {
      display: "flex",
      width: labelW,
      height: rowH,
      flexShrink: 0,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: color,
      color: "#14161d",
      fontSize: labelSize,
      fontWeight: 700,
    },
    fitRowLabelToChip(row.label, labelW, labelSize),
  );

  // Lines are cut explicitly, not left to `flex-wrap`, so cards split evenly (7 cards: 4+3, not 6+1).
  const perLine = Math.max(1, Math.ceil(visible.length / lines));
  const tileLines: Element[] = [];
  for (let start = 0; start < visible.length; start += perLine) {
    const slice = visible.slice(start, start + perLine);
    const isLast = start + perLine >= visible.length;
    tileLines.push(
      element(
        "div",
        { display: "flex", flexDirection: "row", gap: TILE_GAP, height: metrics.tileH },
        ...slice.map((card, offset) =>
          cardTile(card, uris[start + offset] ?? null, metrics.tileW, metrics.tileH),
        ),
        isLast && hiddenTotal > 0 && overflowChip(hiddenTotal, metrics.tileW, metrics.tileH),
      ),
    );
  }
  if (tileLines.length === 0 && hiddenTotal > 0) {
    tileLines.push(
      element(
        "div",
        { display: "flex", flexDirection: "row", height: metrics.tileH },
        overflowChip(hiddenTotal, metrics.tileW, metrics.tileH),
      ),
    );
  }

  const tiles = element(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-start",
      flexGrow: 1,
      height: rowH,
      paddingTop: ROW_PAD,
      paddingLeft: ROW_PAD,
      paddingRight: ROW_PAD,
      gap: TILE_GAP,
      overflow: "hidden",
    },
    ...tileLines,
  );

  return element(
    "div",
    {
      display: "flex",
      flexDirection: "row",
      height: rowH,
      borderRadius: 6,
      overflow: "hidden",
      backgroundColor: "rgba(255,255,255,0.035)",
      border: `1px solid ${COLORS.surfaceBorder}`,
    },
    label,
    tiles,
  );
}

export async function buildTierListImageRows(
  repos: Pick<Repos, "catalog" | "canonicalPrintings">,
  tiers: readonly { label: string; cards: readonly TierListImageEntry[]; unranked?: boolean }[],
): Promise<TierListImageRow[]> {
  const entries = tiers.flatMap((tier) => [...tier.cards]);
  if (entries.length === 0) {
    return tiers.map((tier) => ({ label: tier.label, cards: [], unranked: tier.unranked }));
  }
  const uniqueCardIds = [...new Set(entries.map((entry) => entry.cardId))];
  const [cardMetas, printingMetas] = await Promise.all([
    repos.catalog.cardsByIds(uniqueCardIds),
    repos.canonicalPrintings.resolvePrintingMetaForRows(
      entries.map((entry) => ({
        cardId: entry.cardId,
        preferredPrintingId: entry.printingId,
      })),
    ),
  ]);
  const metaById = new Map(cardMetas.map((meta) => [meta.id, meta]));
  const imageIdByCardId = new Map(
    entries.map((entry, index) => [entry.cardId, printingMetas[index]?.imageId ?? null]),
  );

  return tiers.map((tier) => ({
    label: tier.label,
    unranked: tier.unranked,
    cards: [...tier.cards].flatMap((entry) => {
      const meta = metaById.get(entry.cardId);
      // A card deleted since the tier list was saved is dropped from the image.
      return meta
        ? [
            {
              cardName: legendDisplayName(meta),
              imageId: imageIdByCardId.get(entry.cardId) ?? null,
            },
          ]
        : [];
    }),
  }));
}

function countRanked(rows: readonly TierListImageRow[]): number {
  return rows.reduce((sum, row) => sum + row.cards.length, 0);
}

function rankedLabel(rankedCount: number): string {
  return `${rankedCount} ${rankedCount === 1 ? "card" : "cards"} ranked`;
}

/**
 * Title and byline share a baseline in their own group; the count is a
 * separate cluster since the spacer between them has no baseline to align against.
 */
function landscapeTitle(
  input: TierListImageInput,
  canvas: TierCanvas,
  rankedCount: number,
): Element {
  return element(
    "div",
    {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      height: canvas.titleH,
      flexGrow: 1,
    },
    element(
      "div",
      { display: "flex", flexDirection: "row", alignItems: "flex-end", flexGrow: 1 },
      element(
        "div",
        {
          display: "flex",
          flexShrink: 1,
          fontSize: canvas.titleSize,
          lineHeight: 1,
          fontWeight: 700,
          color: COLORS.text,
          whiteSpace: "nowrap",
        },
        truncateTierListTitle(input.title, canvas.titleMaxChars),
      ),
      input.ownerName
        ? element(
            "div",
            {
              display: "flex",
              flexShrink: 0,
              marginLeft: 12,
              fontSize: canvas.bylineSize,
              lineHeight: 1,
              fontWeight: 600,
              color: COLORS.gold,
              transform: `translateY(${baselineNudge(canvas.titleSize, canvas.bylineSize)}px)`,
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
          fontSize: canvas.metaSize,
          lineHeight: 1,
          color: COLORS.muted,
          transform: `translateY(${baselineNudge(canvas.titleSize, canvas.metaSize)}px)`,
        },
        rankedLabel(rankedCount),
      ),
    ),
  );
}

function verticalTitle(
  input: TierListImageInput,
  canvas: TierCanvas,
  rankedCount: number,
): Element {
  return element(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      height: canvas.titleH,
      flexGrow: 1,
    },
    element(
      "div",
      {
        display: "flex",
        fontSize: canvas.titleSize,
        lineHeight: 1,
        fontWeight: 700,
        color: COLORS.text,
        whiteSpace: "nowrap",
      },
      truncateTierListTitle(input.title, canvas.titleMaxChars),
    ),
    element(
      "div",
      {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        marginTop: 14,
      },
      input.ownerName
        ? element(
            "div",
            {
              display: "flex",
              fontSize: canvas.bylineSize,
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
          fontSize: canvas.metaSize,
          lineHeight: 1,
          color: COLORS.muted,
        },
        // Row is centre-aligned, not bottom-aligned, so this needs no baselineNudge.
        rankedLabel(rankedCount),
      ),
    ),
  );
}

function titleArea(typeBlock: Element, qrUri: string | null, canvas: TierCanvas): Element {
  return element(
    "div",
    {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      height: qrUri ? Math.max(canvas.titleH, canvas.headerQr) : canvas.titleH,
      flexShrink: 0,
    },
    typeBlock,
    qrUri
      ? element(
          "div",
          { display: "flex", flexShrink: 0, marginLeft: 16 },
          qrMark(qrUri, canvas.headerQr),
        )
      : false,
  );
}

function boardArtUris(
  io: Io,
  rows: readonly TierListImageRow[],
  capacityForRow: (index: number) => number,
  tileW: number,
  tileH: number,
  scale: number,
): Promise<(string | null)[][]> {
  return Promise.all(
    rows.map((row, index) =>
      Promise.all(
        row.cards
          .slice(0, capacityForRow(index))
          .map((card) => tileArtDataUri(io, card.imageId, tileW, tileH, scale)),
      ),
    ),
  );
}

export async function renderTierListImage(
  io: Io,
  input: TierListImageInput,
  scale = 1,
  aspect: ShareImageAspect = "landscape",
): Promise<Buffer> {
  const canvas = canvasFor(aspect);
  const rows = input.rows;
  const rankedCount = countRanked(rows);

  const innerW = canvas.width - canvas.pad * 2;
  const hasFooter = Boolean(input.siteHost);
  const titleAreaH = input.shareUrl ? Math.max(canvas.titleH, canvas.headerQr) : canvas.titleH;
  const boardH =
    canvas.height - canvas.pad * 2 - titleAreaH - GAP - (hasFooter ? FOOTER_H + GAP : 0);

  const vertical = aspect === "vertical";
  const fullestRow = rows.reduce((most, row) => Math.max(most, row.cards.length), 0);
  const flat = measureBoard(rows.length, fullestRow, innerW, boardH, canvas.labelW);
  const wrapped = vertical
    ? measureWrappedBoard(
        rows.map((row) => row.cards.length),
        innerW,
        boardH,
        canvas.labelW,
        canvas.maxLines,
      )
    : null;

  const [rowUris, qrUri] = await Promise.all([
    boardArtUris(
      io,
      rows,
      (index) =>
        wrapped ? (wrapped.linesPerRow[index] ?? 1) * wrapped.tilesPerLine : flat.maxTilesPerRow,
      wrapped?.tileW ?? flat.tileW,
      wrapped?.tileH ?? flat.tileH,
      scale,
    ),
    input.shareUrl ? qrDataUri(input.shareUrl, scale, canvas.headerQr) : Promise.resolve(null),
  ]);

  const titleRow = titleArea(
    vertical
      ? verticalTitle(input, canvas, rankedCount)
      : landscapeTitle(input, canvas, rankedCount),
    qrUri,
    canvas,
  );

  const board = element(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      height: boardH,
      gap: ROW_GAP,
      ...(wrapped ? { justifyContent: "center" } : {}),
    },
    ...rows.map((row, index) =>
      wrapped
        ? wrappedBoardRow(
            row,
            tierRowColor(index, row.unranked),
            rowUris[index] ?? [],
            wrapped,
            index,
            canvas.labelW,
          )
        : boardRow(row, tierRowColor(index, row.unranked), rowUris[index] ?? [], flat),
    ),
  );

  const footer: Child =
    hasFooter &&
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
            {
              display: "flex",
              fontSize: vertical ? 24 : 20,
              fontWeight: 600,
              color: COLORS.muted,
            },
            input.siteHost,
          )
        : false,
    );

  const root = element(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      width: canvas.width,
      height: canvas.height,
      padding: canvas.pad,
      backgroundColor: COLORS.background,
      backgroundImage:
        "radial-gradient(80% 120% at 0% 0%, rgba(205,172,110,0.14) 0%, transparent 60%)",
      color: COLORS.text,
      fontFamily: "Hanken Grotesk",
      overflow: "hidden",
    },
    titleRow,
    element("div", { display: "flex", height: GAP, flexShrink: 0 }),
    board,
    footer,
  );

  return renderTreeToPng(io, root, canvas.width, canvas.height, scale);
}
