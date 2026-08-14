import { tierRowColor } from "@openrift/shared";

import type { Repos } from "../deps.js";
import type { Io } from "../io.js";
import type { Child, Element } from "./share-image-core.js";
import {
  CARD_ASPECT,
  COLORS,
  QR_SIZE,
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
} from "./share-image-core.js";

/**
 * Server-rendered tier-list share image: the ranked board as a stack of
 * labelled rows, drawn to PNG for the public share route's og:image and the
 * creator's export download. Built from the same satori + resvg primitives as
 * the list and deck images (`share-image-core`), so all four surfaces share one
 * font loader, art transcoder, and rasterizer.
 *
 * Unranked cards never reach this renderer — the board is the artifact, and a
 * trailing tray of everything the creator hasn't got to yet would dominate it.
 * Empty rows *are* drawn, because a deliberately empty D tier is a statement
 * about the set.
 *
 * Two resolutions share one layout via `scale`: the og:image renders at 1×
 * (1200×630), the download at 2×, with raster sources embedded at the matching
 * resolution while satori lays out once at base size (ADR-031).
 */

const WIDTH = 1200;
const HEIGHT = 630;
const PAD = 24;
const GAP = 10;

const TILE_GAP = 4;

const TITLE_H = 52;
/** The footer is exactly the mark's height: the QR is the tallest thing in it,
 * and the host label centres against it. */
const FOOTER_H = QR_SIZE;

/** Width of a row's label chip. Fits three characters at the largest row height. */
const LABEL_W = 58;
const ROW_GAP = 8;
/** Breathing room between a row's border and its tiles. */
const ROW_PAD = 5;

/** Longest title kept before eliding, so it never collides with the right cluster. */
const TITLE_MAX_CHARS = 46;

/** The title row's three type sizes. Named because the baseline corrections are
 * derived from the gaps between them, so a size change must reach both places. */
const TITLE_SIZE = 34;
const BYLINE_SIZE = 22;
const META_SIZE = 20;

/** @returns The title, truncated with an ellipsis when longer than the cap. */
export function truncateTierListTitle(title: string): string {
  return elideTitle(title, TITLE_MAX_CHARS);
}

/** One stored board entry, before its art is resolved. */
export interface TierListImageEntry {
  cardId: string;
  /** Printing the creator pinned for the tile; null takes the card's default. */
  printingId: string | null;
}

/** One ranked card the renderer needs; `imageId` is the resolved art, null when none. */
export interface TierListImageCard {
  cardName: string;
  imageId: string | null;
}

/** One row of the board, already resolved to renderable cards. */
export interface TierListImageRow {
  label: string;
  cards: readonly TierListImageCard[];
  /** The grey "considered and cut" row, drawn off the ranking ramp. */
  unranked?: boolean;
}

/** Everything the renderer needs to draw a tier-list share image. */
export interface TierListImageInput {
  title: string;
  /** Owner display name shown next to the title; dropped when empty. */
  ownerName?: string;
  rows: readonly TierListImageRow[];
  /** Host shown in the footer (e.g. "openrift.app"); omitted when empty. */
  siteHost?: string;
  /** Absolute share URL encoded in the QR; the QR is dropped when absent. */
  shareUrl?: string;
}

/**
 * Geometry shared by every row: one tile size for the whole board, so a card in
 * S is exactly as large as a card in D and the rows read as one ladder.
 */
interface BoardMetrics {
  rowH: number;
  tileH: number;
  tileW: number;
  /** Tiles that fit one row at this size; the rest collapse into a "+N" chip. */
  maxTilesPerRow: number;
}

/**
 * Sizes the board so every row fits the available height, then caps the tile
 * width so the fullest row still fits horizontally. Both constraints are
 * global rather than per row: a uniform tile is what makes the ranking legible.
 * @returns The shared row and tile geometry.
 */
export function measureBoard(
  rowCount: number,
  cardsInFullestRow: number,
  areaW: number,
  areaH: number,
): BoardMetrics {
  const rowH = Math.floor((areaH - Math.max(0, rowCount - 1) * ROW_GAP) / Math.max(1, rowCount));
  const heightCap = rowH - 2 * ROW_PAD;
  const tilesAreaW = areaW - LABEL_W - ROW_PAD;
  // Width cap only bites when a row genuinely overflows; a board whose rows all
  // fit keeps the taller tiles the height allows.
  const widthCap =
    cardsInFullestRow > 0
      ? (tilesAreaW - (cardsInFullestRow - 1) * TILE_GAP) / cardsInFullestRow / CARD_ASPECT
      : Number.POSITIVE_INFINITY;
  const tileH = Math.max(12, Math.floor(Math.min(heightCap, widthCap)));
  const tileW = Math.max(9, Math.floor(tileH * CARD_ASPECT));
  const maxTilesPerRow = Math.max(1, Math.floor((tilesAreaW + TILE_GAP) / (tileW + TILE_GAP)));
  return { rowH, tileH, tileW, maxTilesPerRow };
}

/**
 * The "+N" chip that stands in for cards past what fits on a row. Sized off the
 * tile so it sits in the row's rhythm rather than breaking it.
 * @returns The overflow chip element.
 */
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

/**
 * Truncates a row label to what its chip can show. Rows default to one
 * character but a creator may rename them ("Broken", "Trap"), and satori has no
 * text overflow — an over-long label would push the tiles off the row.
 * @returns The label, truncated to fit the chip.
 */
export function fitRowLabel(label: string, rowH: number): string {
  // Roughly two characters per 24px of row height, floored at three so a short
  // board never shows a bare initial where the chip has room for more.
  const max = Math.max(3, Math.round((rowH / 24) * 2));
  return label.length > max ? label.slice(0, max) : label;
}

/**
 * One board row: the coloured label chip, then the row's tiles.
 * @returns The row element.
 */
function boardRow(
  row: TierListImageRow,
  color: string,
  uris: readonly (string | null)[],
  metrics: BoardMetrics,
): Element {
  const shown = row.cards.slice(0, metrics.maxTilesPerRow);
  const hidden = row.cards.length - shown.length;
  // The chip stands in for the last visible card, so drop one tile to make room
  // rather than letting the row overflow its width.
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

/**
 * Resolves display art for a board's card ids and drops any that no longer
 * resolve, mirroring how the deck renderer tolerates a stale id. Granularity is
 * per card, so each one takes its default printing's image.
 * @returns The board's rows with names and art ids attached.
 */
export async function buildTierListImageRows(
  repos: Pick<Repos, "catalog" | "canonicalPrintings">,
  tiers: readonly { label: string; cards: readonly TierListImageEntry[]; unranked?: boolean }[],
): Promise<TierListImageRow[]> {
  const entries = tiers.flatMap((tier) => [...tier.cards]);
  if (entries.length === 0) {
    return tiers.map((tier) => ({ label: tier.label, cards: [], unranked: tier.unranked }));
  }
  // Keyed on card *and* pinned printing: the same card cannot repeat across the
  // board, so one key per entry is already the deduplicated set.
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
      // A card deleted from the catalogue since the list was saved simply drops
      // out of the image rather than rendering as a blank tile.
      return meta
        ? [{ cardName: meta.name, imageId: imageIdByCardId.get(entry.cardId) ?? null }]
        : [];
    }),
  }));
}

/**
 * Renders a tier-list share image to a PNG buffer. `scale` renders the same
 * base layout at N× resolution for the HQ download.
 * @returns PNG bytes ready to return as `image/png`.
 */
export async function renderTierListImage(
  io: Io,
  input: TierListImageInput,
  scale = 1,
): Promise<Buffer> {
  const rows = input.rows;
  const rankedCount = rows.reduce((sum, row) => sum + row.cards.length, 0);

  const innerW = WIDTH - PAD * 2;
  const hasFooter = Boolean(input.siteHost) || Boolean(input.shareUrl);
  const boardH = HEIGHT - PAD * 2 - TITLE_H - GAP - (hasFooter ? FOOTER_H + GAP : 0);

  const fullestRow = rows.reduce((most, row) => Math.max(most, row.cards.length), 0);
  const metrics = measureBoard(rows.length, fullestRow, innerW, boardH);

  const [rowUris, qrUri] = await Promise.all([
    Promise.all(
      rows.map((row) =>
        Promise.all(
          row.cards
            .slice(0, metrics.maxTilesPerRow)
            .map((card) => tileArtDataUri(io, card.imageId, metrics.tileW, metrics.tileH, scale)),
        ),
      ),
    ),
    input.shareUrl ? qrDataUri(input.shareUrl, scale) : Promise.resolve(null),
  ]);

  // ── Title row ─────────────────────────────────────────────────────────────
  // Same construction as the deck image: title and byline share a baseline
  // inside their own left group, and the count is a vertically-centred cluster
  // on the right. Baseline-aligning the whole row instead puts the count's
  // baseline on the 34px title's, which reads as a misaligned header — and the
  // flexible spacer between them has no text baseline at all to align to.
  // The type roles match the deck and list images too, so the three read as one
  // family: gold marks who made it, muted carries the incidental metadata.
  const titleRow = element(
    "div",
    {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      height: TITLE_H,
      flexShrink: 0,
    },
    element(
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
        truncateTierListTitle(input.title),
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
        `${rankedCount} ${rankedCount === 1 ? "card" : "cards"} ranked`,
      ),
    ),
  );

  const board = element(
    "div",
    { display: "flex", flexDirection: "column", height: boardH, gap: ROW_GAP },
    ...rows.map((row, index) =>
      boardRow(row, tierRowColor(index, row.unranked), rowUris[index] ?? [], metrics),
    ),
  );

  // Host label left, mark right — the same bottom-right mark the deck image
  // carries, at the same size.
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
    titleRow,
    element("div", { display: "flex", height: GAP, flexShrink: 0 }),
    board,
    footer,
  );

  return renderTreeToPng(io, root, WIDTH, HEIGHT, scale);
}
