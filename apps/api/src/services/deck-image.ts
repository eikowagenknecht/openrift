import type { Repos } from "../deps.js";
import type { Io } from "../io.js";
import type { DeckImageCard, DeckImageCardRef, DeckImageInput } from "./deck-image-parts.js";
import {
  BATTLEFIELD_ASPECT,
  BODY_GAP,
  GAP,
  SECTION_HEADER_H,
  deckBackdropUri,
  deckHeroBackdrop,
  deckMetaLabel,
  deckSection,
  domainIconElements,
  glyphUri,
  legendGlowBackground,
  packGrid,
  runeCountsByDomain,
  splitDeckZones,
  truncateTitle,
} from "./deck-image-parts.js";
import { renderDeckImageVertical } from "./deck-image-vertical.js";
import type { ShareImageAspect } from "./share-image-core.js";
import {
  CANVAS,
  CARD_ASPECT,
  COLORS,
  QR_SIZE,
  baselineNudge,
  cardTile,
  element,
  qrDataUri,
  qrMark,
  renderTreeToPng,
  tileArtDataUri,
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
 * 1× (1200×630); the download renders at 2× by embedding raster sources (card
 * art, glyphs, QR) at the matching resolution while satori lays out once at base
 * size. The tile itself, the QR mark, and the card aspect come from
 * `share-image-core` so this image and the list and tier-list images stay one
 * family, and the deck-shaped pieces both this and the 9:16 export are built
 * from come from `deck-image-parts`.
 *
 * This file owns the landscape layout. `renderDeckImage` is still the one entry
 * point: it hands a `vertical` request to `deck-image-vertical.ts`, which draws
 * the same deck stacked for a 9:16 canvas.
 */

const { width: WIDTH, height: HEIGHT } = CANVAS.landscape;
const PAD = 22;

const TITLE_H = 46;
const LEFT_W = 250;

/** The title row's three type sizes. Named because the baseline corrections are
 * derived from the gaps between them, so a size change must reach both places. */
const TITLE_SIZE = 34;
const BYLINE_SIZE = 22;
const META_SIZE = 20;

/** Legend domain glyphs, shown top-right beside the card count (no amounts). */
const DOMAIN_ICON = 30;
/** Base portrait sideboard tile height (grows to fill leftover space). */
const SIDEBOARD_TILE_H = 96;
/** Base landscape battlefield tile height; runes share this row and match it. */
const BATTLEFIELD_BAND_TILE_H = 84;

// Re-exported so the routes, the oEmbed handler, and the tests keep importing
// the deck image's public surface from one module.
export type { DeckImageCard, DeckImageCardRef, DeckImageInput } from "./deck-image-parts.js";
export { formatLabelFromSlug, truncateTitle } from "./deck-image-parts.js";

/**
 * Resolves the deck's custom cover to a printable image id, honoring the
 * pinned printing the same way the web resolves it.
 * @returns The cover's image id, or null when the deck has no custom cover.
 */
export async function resolveCoverImageId(
  repos: Pick<Repos, "canonicalPrintings">,
  deck: { coverCardId: string | null; coverPrintingId: string | null },
): Promise<string | null> {
  if (!deck.coverCardId) {
    return null;
  }
  const metas = await repos.canonicalPrintings.resolvePrintingMetaForRows([
    { cardId: deck.coverCardId, preferredPrintingId: deck.coverPrintingId },
  ]);
  return metas[0]?.imageId ?? null;
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
 * base layout at N× resolution for the HQ download; `aspect` picks the canvas
 * (landscape for the og:image, vertical for the 9:16 export).
 * @returns PNG bytes ready to return as `image/png`.
 */
export async function renderDeckImage(
  io: Io,
  input: DeckImageInput,
  scale = 1,
  aspect: ShareImageAspect = "landscape",
): Promise<Buffer> {
  if (aspect === "vertical") {
    return renderDeckImageVertical(io, input, scale);
  }

  const zones = splitDeckZones(input.cards);
  const { legend, runes, runeCards, battlefields, sideboard, gridCards } = zones;
  const { mainCardCount, sideboardCount } = zones;

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
    legend ? tileArtDataUri(io, legend.imageId, legendW, legendH, scale) : Promise.resolve(null),
    deckBackdropUri(io, input.coverImageId ?? legend?.imageId, WIDTH, HEIGHT, scale),
    grid
      ? Promise.all(
          gridCards.map((card) => tileArtDataUri(io, card.imageId, grid.tileW, grid.tileH, scale)),
        )
      : Promise.resolve([]),
    Promise.all(
      battlefields.map((card) =>
        tileArtDataUri(io, card.imageId, battlefieldTileW, bottomTileH, scale),
      ),
    ),
    Promise.all(
      sideboard.map((card) =>
        tileArtDataUri(io, card.imageId, sideboardTileW, sideboardTileH, scale),
      ),
    ),
    Promise.all(
      runeCards.map((card) => tileArtDataUri(io, card.imageId, runeTileW, runeTileH, scale)),
    ),
    Promise.all(domains.map((domain) => glyphUri(io, domain, DOMAIN_ICON, scale))),
    input.shareUrl ? qrDataUri(input.shareUrl, scale) : Promise.resolve(null),
  ]);

  const hasFooterMark = Boolean(qrUri) || Boolean(input.siteHost);

  // ── Title row ──────────────────────────────────────────────────────────────
  // Name + byline keep their shared text baseline in a left group; the count and
  // the deck's domain glyphs sit as a vertically-centred cluster on the right.
  const domainIcons = domainIconElements(domainUris, DOMAIN_ICON);
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
              fontSize: BYLINE_SIZE,
              lineHeight: 1,
              fontWeight: 600,
              color: COLORS.gold,
              transform: `translateY(${baselineNudge(TITLE_SIZE, BYLINE_SIZE)}px)`,
            },
            // "by Name" rather than "· Name": the middle dot is a mid-height glyph
            // that floats oddly beside the much larger deck title, whereas plain
            // lowercase text shares the title's baseline cleanly.
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
        deckMetaLabel(input.formatLabel, mainCardCount, sideboardCount),
      ),
      domainIcons.length > 0
        ? element(
            "div",
            {
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              marginLeft: 14,
              gap: 6,
              // The glyphs are art, not type, so they centre on the metadata run
              // rather than sitting on its baseline. In a bottom-aligned row that
              // means offsetting by the run's own nudge plus half the height
              // difference between a glyph and the text box.
              transform: `translateY(${baselineNudge(TITLE_SIZE, META_SIZE) + (DOMAIN_ICON - META_SIZE) / 2}px)`,
            },
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

  // Scannable host label beside the QR, bottom-right.
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
      qrUri ? qrMark(qrUri) : false,
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
  const heroBackdrop = deckHeroBackdrop(backdropUri, WIDTH, HEIGHT);

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
