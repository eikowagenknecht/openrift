import { WellKnown } from "@openrift/shared";
import QRCode from "qrcode";

import type { Repos } from "../deps.js";
import type { Io } from "../io.js";
import type { Child, Element } from "./share-image-core.js";
import {
  CARD_RADIUS,
  COLORS,
  cardArtDataUri,
  element,
  renderTreeToPng,
  svgToPngDataUri,
} from "./share-image-core.js";

/**
 * Server-rendered deck share image (ADR-031): a beautified, Archive-style
 * decklist rendered to PNG for the public deck share route's og:image and an
 * HQ download. Built from the same satori + resvg primitives as the list image
 * (`share-image-core`), but with a deck-shaped layout: a left identity panel
 * (Legend hero, rune-domain summary, battlefields), a cost-sorted grid of the
 * rest of the deck, an optional sideboard strip, and a QR to the deck.
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

const TITLE_H = 46;
const FOOTER_H = 84;
const LEFT_W = 250;

const LEGEND_W = 168;
const LEGEND_H = Math.round(LEGEND_W / CARD_ASPECT);
const GLYPH_SIZE = 34;
const QR_SIZE = 84;
/** Sideboard tiles are capped so the strip never crowds the main grid. */
const SIDEBOARD_TILE_H = 96;
/** Battlefields shown in the identity panel (decks rarely exceed three). */
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
  return cardArtDataUri(io, imageId, tileW * scale, tileH * scale, CARD_RADIUS * scale);
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
  const image: Element = dataUri
    ? { type: "img", props: { src: dataUri, width: tileW, height: tileH } }
    : element(
        "div",
        {
          display: "flex",
          width: tileW,
          height: tileH,
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
      borderRadius: CARD_RADIUS,
      overflow: "hidden",
      backgroundColor: COLORS.surface,
      border: `1px solid ${COLORS.surfaceBorder}`,
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
 * Loads and rasterizes a rune-domain glyph to a PNG data URI.
 * @returns The glyph data URI, or null when the glyph asset is absent.
 */
async function glyphUri(io: Io, domain: string, scale: number): Promise<string | null> {
  try {
    const svg = await io.fs.readFile(`${import.meta.dirname}/../assets/glyphs/rune-${domain}.svg`);
    return await svgToPngDataUri(io, svg, GLYPH_SIZE * scale);
  } catch {
    return null;
  }
}

/**
 * Builds the rune-domain summary row: a glyph (or a gold dot fallback) and a
 * `×count` for each domain present in the runes zone.
 * @returns The summary element, or false when the deck has no runes.
 */
function runeSummary(
  counts: { domain: string; count: number }[],
  glyphUris: (string | null)[],
): Child {
  if (counts.length === 0) {
    return false;
  }
  const items = counts.map((entry, index) => {
    const uri = glyphUris[index];
    const icon: Element = uri
      ? { type: "img", props: { src: uri, width: GLYPH_SIZE, height: GLYPH_SIZE } }
      : element("div", {
          display: "flex",
          width: GLYPH_SIZE,
          height: GLYPH_SIZE,
          borderRadius: GLYPH_SIZE / 2,
          backgroundColor: COLORS.gold,
        });
    return element(
      "div",
      { display: "flex", flexDirection: "row", alignItems: "center" },
      icon,
      element(
        "div",
        { display: "flex", marginLeft: 6, fontSize: 22, fontWeight: 700, color: COLORS.text },
        `×${entry.count}`,
      ),
    );
  });
  // Centered below the legend hero; `gap` (not a per-item margin) keeps the row
  // optically centered instead of biased left by a trailing margin.
  return element(
    "div",
    {
      display: "flex",
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "center",
      gap: 16,
    },
    ...items,
  );
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
  // Conventional deck size: total copies in the main deck (champions + main).
  const mainCardCount = gridCards.reduce((sum, card) => sum + card.quantity, 0);

  const hasLeftPanel = legend !== null || runes.length > 0 || battlefields.length > 0;
  const leftW = hasLeftPanel ? LEFT_W : 0;
  const innerW = WIDTH - PAD * 2;
  const bodyH = HEIGHT - PAD * 2 - TITLE_H - GAP - FOOTER_H - GAP;
  const rightW = innerW - leftW - (hasLeftPanel ? BODY_GAP : 0);

  // Sideboard sits in one capped row at the bottom of the right column.
  const sideboardTileH = sideboard.length > 0 ? SIDEBOARD_TILE_H : 0;
  const sideboardTileW = Math.floor(sideboardTileH * CARD_ASPECT);
  const sideboardBandH = sideboard.length > 0 ? sideboardTileH + GAP + 24 : 0;
  const mainAreaH = bodyH - sideboardBandH;

  const grid =
    gridCards.length > 0 ? packGrid(gridCards.length, rightW, mainAreaH, CARD_ASPECT) : null;

  // Resolve every raster source up front (art is the dominant cost).
  const [legendUri, gridUris, battlefieldUris, sideboardUris, runeGlyphUris, qrUri] =
    await Promise.all([
      legend ? artUri(io, legend.imageId, LEGEND_W, LEGEND_H, scale) : Promise.resolve(null),
      grid
        ? Promise.all(
            gridCards.map((card) => artUri(io, card.imageId, grid.tileW, grid.tileH, scale)),
          )
        : Promise.resolve([]),
      Promise.all(
        battlefields.map((card) =>
          artUri(
            io,
            card.imageId,
            Math.floor((leftW - GAP * 2) / 3),
            Math.floor((leftW - GAP * 2) / 3 / BATTLEFIELD_ASPECT),
            scale,
          ),
        ),
      ),
      Promise.all(
        sideboard.map((card) => artUri(io, card.imageId, sideboardTileW, sideboardTileH, scale)),
      ),
      Promise.all(runeCountsByDomain(runes).map((entry) => glyphUri(io, entry.domain, scale))),
      input.shareUrl
        ? QRCode.toDataURL(input.shareUrl, {
            width: QR_SIZE * scale,
            margin: 2,
            color: { dark: COLORS.gold, light: "#00000000" },
          }).catch(() => null)
        : Promise.resolve(null),
    ]);

  // ── Title row ──────────────────────────────────────────────────────────────
  const titleRow = element(
    "div",
    {
      display: "flex",
      flexDirection: "row",
      alignItems: "baseline",
      height: TITLE_H,
      marginBottom: GAP,
    },
    element(
      "div",
      {
        display: "flex",
        flexShrink: 1,
        fontSize: 34,
        fontWeight: 700,
        color: COLORS.text,
        maxWidth: 560,
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
      },
      input.deckName,
    ),
    input.ownerName
      ? element(
          "div",
          {
            display: "flex",
            flexShrink: 0,
            marginLeft: 12,
            fontSize: 22,
            fontWeight: 600,
            color: COLORS.gold,
          },
          `· ${input.ownerName}`,
        )
      : false,
    element("div", { display: "flex", flexGrow: 1, minWidth: 24 }),
    element(
      "div",
      { display: "flex", flexShrink: 0, fontSize: 20, color: COLORS.muted },
      `${input.formatLabel} · ${mainCardCount} ${mainCardCount === 1 ? "card" : "cards"}`,
    ),
  );

  // ── Left identity panel ──────────────────────────────────────────────────
  const battlefieldTileW = Math.floor((leftW - GAP * 2) / 3);
  const battlefieldTileH = Math.floor(battlefieldTileW / BATTLEFIELD_ASPECT);
  const leftPanel =
    hasLeftPanel &&
    element(
      "div",
      { display: "flex", flexDirection: "column", width: leftW, gap: GAP },
      legend &&
        element(
          "div",
          { display: "flex", justifyContent: "center" },
          cardTile(legend, legendUri, LEGEND_W, LEGEND_H),
        ),
      runeSummary(runeCountsByDomain(runes), runeGlyphUris),
      battlefields.length > 0 &&
        element(
          "div",
          { display: "flex", flexDirection: "row", gap: GAP },
          ...battlefields.map((card, index) =>
            cardTile(card, battlefieldUris[index] ?? null, battlefieldTileW, battlefieldTileH),
          ),
        ),
    );

  // ── Main grid + sideboard (right column) ─────────────────────────────────
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

  const sideboardSection =
    sideboard.length > 0 &&
    element(
      "div",
      { display: "flex", flexDirection: "column", marginTop: GAP },
      element(
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
          "SIDEBOARD",
        ),
        element("div", {
          display: "flex",
          flexGrow: 1,
          height: 1,
          backgroundColor: COLORS.surfaceBorder,
          marginLeft: 10,
        }),
      ),
      element(
        "div",
        { display: "flex", flexDirection: "row", flexWrap: "wrap", gap: GAP },
        ...sideboard.map((card, index) =>
          cardTile(card, sideboardUris[index] ?? null, sideboardTileW, sideboardTileH),
        ),
      ),
    );

  const rightColumn = element(
    "div",
    { display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "flex-start" },
    mainGrid || element("div", { display: "flex", flexGrow: 1 }),
    sideboardSection,
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

  // ── Footer (brand + QR) ────────────────────────────────────────────────────
  const footer = element(
    "div",
    {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      height: FOOTER_H,
      marginTop: GAP,
    },
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
        { display: "flex", fontSize: 22, fontWeight: 600, color: COLORS.muted },
        input.siteHost ?? "OpenRift",
      ),
    ),
    qrUri
      ? { type: "img", props: { src: qrUri, width: QR_SIZE, height: QR_SIZE } }
      : element("div", { display: "flex" }),
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
      color: COLORS.text,
      fontFamily: "Inter",
      overflow: "hidden",
    },
    titleRow,
    body,
    footer,
  );

  return renderTreeToPng(io, root, WIDTH, HEIGHT, scale);
}
