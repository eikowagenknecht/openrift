import type { ShareImageAspect } from "@openrift/shared";
import { legendDisplayName, SHARE_IMAGE_CANVAS } from "@openrift/shared";

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
import type { Child, Element } from "./share-image-core.js";
import {
  CARD_ASPECT,
  COLORS,
  baselineNudge,
  cardTile,
  element,
  qrDataUri,
  qrMark,
  renderTreeToPng,
  tileArtDataUri,
} from "./share-image-core.js";

/**
 * Two resolutions share one layout via the `scale` arg: the og:image renders at
 * 1× (1200×630); the download renders at 2× by embedding raster sources (card
 * art, glyphs, QR) at the matching resolution while satori lays out once at base
 * size. The tile itself, the QR mark, and the card aspect come from
 * `share-image-core` so this image and the list and tier-list images stay one
 * family.
 *
 * The two canvases are two compositions rather than one resized layout: the
 * landscape layout is horizontal at its core (a legend panel *beside* a grid,
 * with a band whose tiles absorb the grid's vertical slack), which turned
 * upright is inside out. The vertical export stacks fixed-height bands and
 * gives the grid the rest, so nearly all of its 2.7× pixel count reaches the
 * main grid. Vertical is download-only — no crawler consumes a 9:16 og:image.
 */

/**
 * Per-canvas geometry. Everything that differs between the two compositions
 * lives here rather than being branched on at each use, so a vertical tweak
 * cannot silently move the landscape og:image.
 */
interface DeckCanvas {
  width: number;
  height: number;
  pad: number;
  /** Reserved height for the title area (one row landscape, two lines vertical). */
  titleH: number;
  titleSize: number;
  bylineSize: number;
  metaSize: number;
  /**
   * Size of the QR at the right end of the title area. It sits there rather
   * than in the footer because down there it was boxed in by whatever height
   * the bottom band happened to take, which left it at QR_SIZE — about 7% of
   * the landscape canvas width, and unscannable once a chat client renders the
   * unfurl at a few hundred pixels. The title area has the whole width, so the
   * mark can be bigger; the area grows to the mark's height and the footer
   * shrinks to the host label alone to pay some of that back. Vertical's is
   * bigger again: that canvas is read at arm's length on a phone, and its two
   * title lines already give the block most of the mark's height.
   */
  headerQr: number;
  /** Height the footer reserves once it is only the host label. */
  footerLabelH: number;
  /** Legend domain glyphs, shown beside the card count (no amounts). */
  domainIcon: number;
}

const LANDSCAPE: DeckCanvas = {
  ...SHARE_IMAGE_CANVAS.landscape,
  pad: 22,
  titleH: 46,
  titleSize: 34,
  bylineSize: 22,
  metaSize: 20,
  headerQr: 104,
  footerLabelH: 26,
  domainIcon: 30,
};

const VERTICAL: DeckCanvas = {
  ...SHARE_IMAGE_CANVAS.vertical,
  pad: 28,
  // Title line, then the byline and metadata on a second line beneath it.
  titleH: 96,
  // Type steps up with the canvas: a story is read at arm's length on a phone,
  // where the landscape sizes would be a fraction of the frame's width.
  titleSize: 46,
  bylineSize: 28,
  metaSize: 26,
  headerQr: 132,
  footerLabelH: 32,
  domainIcon: 34,
};

/** Width of the landscape layout's left legend panel. */
const LANDSCAPE_LEFT_W = 250;
/** Base portrait sideboard tile height (grows to fill leftover space). */
const SIDEBOARD_TILE_H = 96;
/** Base landscape battlefield tile height; runes share this row and match it. */
const BATTLEFIELD_BAND_TILE_H = 84;
/** Ceiling on how far the landscape band tiles grow into the grid's leftovers. */
const MAX_TILE_SCALE = 1.7;

/** Vertical legend hero width; its height sets the whole identity band's. */
const VERTICAL_LEGEND_W = 300;
/**
 * Ceiling on a vertical main-grid tile. Without it a three-card deck is drawn
 * as three 340px slabs and a one-card deck as a single 700px one, because the
 * packer maximizes the tile against an area that is now very tall.
 */
const VERTICAL_MAX_GRID_TILE_W = 300;
/** Ceilings for the vertical full-width bands, so a two-card sideboard is not a hero row. */
const VERTICAL_MAX_BAND_TILE_H = 200;
const VERTICAL_MAX_SIDEBOARD_TILE_H = 220;
/**
 * The vertical title has its own full-width line, but the type is larger and
 * the canvas narrower than landscape, so the cap lands in a similar place.
 */
const VERTICAL_TITLE_MAX_CHARS = 32;

// Re-exported so the routes, the oEmbed handler, and the tests keep importing
// the deck image's public surface from one module.
export type { DeckImageCard, DeckImageCardRef, DeckImageInput } from "./deck-image-parts.js";
export { truncateTitle } from "./deck-image-parts.js";

/** Honors the pinned cover printing the same way the web resolves it. */
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
 * Mirrors how the public deck route enriches cards. Shared by the by-id
 * builder (server decks) and the from-cards render endpoint (browser-local
 * decks, which have no server row).
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
      cardName: legendDisplayName(meta),
      quantity: row.quantity,
      imageId: printingMetas[index]?.imageId ?? null,
      energy: meta.energy,
      domains: meta.domains,
      zone: row.zone,
    });
  }
  return result;
}

export async function buildDeckImageCards(
  repos: Pick<Repos, "decks" | "catalog" | "canonicalPrintings">,
  deckId: string,
  userId: string,
): Promise<DeckImageCard[]> {
  const cards = await repos.decks.cardsForDeck(deckId, userId);
  return buildDeckImageCardsFromRefs(repos, cards);
}

/**
 * `scale` renders the same base layout at N× resolution for the HQ download;
 * `aspect` picks the canvas (landscape for the og:image, vertical for the 9:16
 * export).
 */
export function renderDeckImage(
  io: Io,
  input: DeckImageInput,
  scale = 1,
  aspect: ShareImageAspect = "landscape",
): Promise<Buffer> {
  return aspect === "vertical"
    ? renderVerticalDeckImage(io, input, scale)
    : renderLandscapeDeckImage(io, input, scale);
}

async function renderLandscapeDeckImage(
  io: Io,
  input: DeckImageInput,
  scale: number,
): Promise<Buffer> {
  const canvas = LANDSCAPE;
  const { width: canvasW, height: canvasH } = canvas;
  const zones = splitDeckZones(input.cards);
  const { legend, runes, runeCards, battlefields, sideboard, gridCards } = zones;
  const { mainCardCount, sideboardCount } = zones;

  const hasLeftPanel = legend !== null;
  const leftW = hasLeftPanel ? LANDSCAPE_LEFT_W : 0;
  const innerW = canvasW - canvas.pad * 2;
  const titleH = input.shareUrl ? Math.max(canvas.titleH, canvas.headerQr) : canvas.titleH;
  const bodyH = canvasH - canvas.pad * 2 - titleH - GAP;
  const rightW = innerW - leftW - (hasLeftPanel ? BODY_GAP : 0);

  // Legend fills the panel width (small inset), centred over the full height.
  const legendW = LANDSCAPE_LEFT_W - 14;
  const legendH = Math.round(legendW / CARD_ASPECT);

  // The band tiles grow to fill whatever vertical space the main grid leaves —
  // a shallow deck yields a short grid and larger sections — capped by a max
  // scale and by each row's width so nothing ever wraps.
  const willHaveFooter = Boolean(input.siteHost);
  const hasSideboard = sideboard.length > 0;
  const bfCount = battlefields.length;
  const runeCount = runeCards.length;
  const bottomRowScalable = bfCount > 0 || runeCount > 0;
  const hasBottomRow = bottomRowScalable || willHaveFooter;

  const bandGaps = hasSideboard && hasBottomRow ? GAP : 0;
  const bottomRowFixedH = hasBottomRow && !bottomRowScalable ? canvas.footerLabelH : 0;
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

  // The host-label width is estimated generously (12px/char at 20px) so the
  // sections shrink rather than shoving the label past the clipped right edge.
  const footerMarkW = input.siteHost ? input.siteHost.length * 12 : 0;
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
    deckBackdropUri(io, input.coverImageId ?? legend?.imageId, canvasW, canvasH, scale),
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
    Promise.all(domains.map((domain) => glyphUri(io, domain, canvas.domainIcon, scale))),
    input.shareUrl ? qrDataUri(input.shareUrl, scale, canvas.headerQr) : Promise.resolve(null),
  ]);

  const hasFooterMark = Boolean(input.siteHost);

  const domainIcons = domainIconElements(domainUris, canvas.domainIcon);
  const titleRow = element(
    "div",
    {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      height: titleH,
      marginBottom: GAP,
    },
    element(
      "div",
      // The type group keeps its own height and is centred in the row by the
      // row's `alignItems`, so growing the row for the QR does not drag the
      // title down to sit on the row's bottom edge.
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
              fontSize: canvas.bylineSize,
              lineHeight: 1,
              fontWeight: 600,
              color: COLORS.gold,
              transform: `translateY(${baselineNudge(canvas.titleSize, canvas.bylineSize)}px)`,
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
          fontSize: canvas.metaSize,
          lineHeight: 1,
          color: COLORS.muted,
          transform: `translateY(${baselineNudge(canvas.titleSize, canvas.metaSize)}px)`,
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
              transform: `translateY(${baselineNudge(canvas.titleSize, canvas.metaSize) + (canvas.domainIcon - canvas.metaSize) / 2}px)`,
            },
            ...domainIcons,
          )
        : false,
    ),
    qrUri
      ? element(
          "div",
          { display: "flex", flexShrink: 0, marginLeft: BODY_GAP },
          qrMark(qrUri, canvas.headerQr),
        )
      : false,
  );

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

  const footerMark =
    hasFooterMark &&
    element(
      "div",
      { display: "flex", flexDirection: "row", flexShrink: 0, alignItems: "center" },
      input.siteHost
        ? element(
            "div",
            { display: "flex", fontSize: 20, fontWeight: 600, color: COLORS.muted },
            input.siteHost,
          )
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
  const heroBackdrop = deckHeroBackdrop(backdropUri, canvasW, canvasH);

  const root = element(
    "div",
    {
      display: "flex",
      position: "relative",
      flexDirection: "column",
      width: canvasW,
      height: canvasH,
      padding: canvas.pad,
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

  return renderTreeToPng(io, root, canvasW, canvasH, scale);
}

function fitRowTileH(count: number, areaW: number, aspect: number, maxH: number): number {
  if (count === 0) {
    return 0;
  }
  return Math.max(1, Math.floor(Math.min(maxH, (areaW - (count - 1) * GAP) / count / aspect)));
}

/**
 * Stacked over two lines rather than strung along a single row because the
 * canvas is narrower than landscape while the type is larger.
 */
function verticalTitleBlock(
  input: DeckImageInput,
  canvas: DeckCanvas,
  metaLabel: string,
  domainIcons: readonly Element[],
  qrUri: string | null,
  blockH: number,
): Element {
  const type = element(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      flexGrow: 1,
      // The two lines never fill the block once the QR sets its height, so they
      // keep their own height and centre against the mark.
      height: canvas.titleH,
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
      truncateTitle(input.deckName, VERTICAL_TITLE_MAX_CHARS),
    ),
    element(
      "div",
      { display: "flex", flexDirection: "row", alignItems: "center", marginTop: 14 },
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
            // "by Name" rather than "· Name", as on the landscape image.
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
          // Both runs pin lineHeight 1 and the row centres its children, so
          // neither sits on the other's baseline and no correction applies —
          // unlike the landscape title, whose runs share one bottom edge.
        },
        metaLabel,
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
            },
            ...domainIcons,
          )
        : false,
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
          { display: "flex", flexShrink: 0, marginLeft: BODY_GAP },
          qrMark(qrUri, canvas.headerQr),
        )
      : false,
  );
}

/**
 * 1× is already 1080×1920, the native upload size for every vertical surface,
 * so `scale` here is editing headroom rather than the deliverable.
 */
async function renderVerticalDeckImage(
  io: Io,
  input: DeckImageInput,
  scale: number,
): Promise<Buffer> {
  const canvas = VERTICAL;
  const { width: canvasW, height: canvasH } = canvas;
  const zones = splitDeckZones(input.cards);
  const { legend, runeCards, battlefields, sideboard, gridCards } = zones;

  const innerW = canvasW - canvas.pad * 2;
  const titleH = input.shareUrl ? Math.max(canvas.titleH, canvas.headerQr) : canvas.titleH;
  const bodyH = canvasH - canvas.pad * 2 - titleH - GAP;
  const hasFooterMark = Boolean(input.siteHost);
  const footerH = hasFooterMark ? canvas.footerLabelH : 0;

  const bfCount = battlefields.length;
  const runeCount = runeCards.length;

  // Only a deck with a legend gets an identity band; a freeform deck sends
  // battlefields and runes to the full-width stack below the grid instead,
  // where they read as sections rather than as an identity that isn't there.
  const hasIdentityBand = legend !== null;
  const legendW = VERTICAL_LEGEND_W;
  const legendH = Math.round(legendW / CARD_ASPECT);
  const identityRightW = innerW - legendW - BODY_GAP;

  const bandBf = hasIdentityBand && bfCount > 0;
  const bandRunes = hasIdentityBand && runeCount > 0;
  const bandHeaders =
    (bandBf ? SECTION_HEADER_H : 0) +
    (bandRunes ? SECTION_HEADER_H : 0) +
    (bandBf && bandRunes ? GAP : 0);
  const bandAvailH = Math.max(0, legendH - bandHeaders);
  const bandBfWidthCap = bandBf
    ? fitRowTileH(bfCount, identityRightW, BATTLEFIELD_ASPECT, Number.POSITIVE_INFINITY)
    : 0;
  const bandRuneWidthCap = bandRunes
    ? fitRowTileH(runeCount, identityRightW, CARD_ASPECT, Number.POSITIVE_INFINITY)
    : 0;
  // Split the band's height between the two sections, then hand whatever the
  // second one didn't need back to the first, so a two-rune deck does not leave
  // the battlefields short.
  const bandBfFirstPass = bandBf ? Math.min(bandBfWidthCap, bandAvailH * 0.45) : 0;
  const bandRuneH = bandRunes
    ? Math.floor(Math.min(bandRuneWidthCap, bandAvailH - bandBfFirstPass))
    : 0;
  const bandBfH = bandBf ? Math.floor(Math.min(bandBfWidthCap, bandAvailH - bandRuneH)) : 0;

  const lowerBf = !hasIdentityBand && bfCount > 0;
  const lowerRunes = !hasIdentityBand && runeCount > 0;
  const hasSideboard = sideboard.length > 0;
  const lowerBfH = lowerBf
    ? fitRowTileH(bfCount, innerW, BATTLEFIELD_ASPECT, VERTICAL_MAX_BAND_TILE_H)
    : 0;
  const lowerRuneH = lowerRunes
    ? fitRowTileH(runeCount, innerW, CARD_ASPECT, VERTICAL_MAX_BAND_TILE_H)
    : 0;
  const sideboardTileH = hasSideboard
    ? fitRowTileH(sideboard.length, innerW, CARD_ASPECT, VERTICAL_MAX_SIDEBOARD_TILE_H)
    : 0;

  const lowerSections = [lowerBfH, lowerRuneH, sideboardTileH].filter((height) => height > 0);
  const lowerH =
    lowerSections.reduce((sum, height) => sum + height + SECTION_HEADER_H, 0) +
    Math.max(0, lowerSections.length - 1) * GAP;

  const gridAreaH = Math.max(
    120,
    bodyH -
      (hasIdentityBand ? legendH + GAP : 0) -
      (lowerH > 0 ? lowerH + GAP : 0) -
      (footerH > 0 ? footerH + GAP : 0),
  );
  const grid =
    gridCards.length > 0
      ? packGrid(gridCards.length, innerW, gridAreaH, CARD_ASPECT, {
          maxTileW: VERTICAL_MAX_GRID_TILE_W,
          preferWider: true,
        })
      : null;

  const bfTileH = bandBf ? bandBfH : lowerBfH;
  const bfTileW = Math.floor(bfTileH * BATTLEFIELD_ASPECT);
  const runeTileH = bandRunes ? bandRuneH : lowerRuneH;
  const runeTileW = Math.floor(runeTileH * CARD_ASPECT);
  const sideboardTileW = Math.floor(sideboardTileH * CARD_ASPECT);
  const domains = runeCountsByDomain(zones.runes).map((entry) => entry.domain);

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
    deckBackdropUri(io, input.coverImageId ?? legend?.imageId, canvasW, canvasH, scale),
    grid
      ? Promise.all(
          gridCards.map((card) => tileArtDataUri(io, card.imageId, grid.tileW, grid.tileH, scale)),
        )
      : Promise.resolve([]),
    Promise.all(
      battlefields.map((card) => tileArtDataUri(io, card.imageId, bfTileW, bfTileH, scale)),
    ),
    Promise.all(
      sideboard.map((card) =>
        tileArtDataUri(io, card.imageId, sideboardTileW, sideboardTileH, scale),
      ),
    ),
    Promise.all(
      runeCards.map((card) => tileArtDataUri(io, card.imageId, runeTileW, runeTileH, scale)),
    ),
    Promise.all(domains.map((domain) => glyphUri(io, domain, canvas.domainIcon, scale))),
    input.shareUrl ? qrDataUri(input.shareUrl, scale, canvas.headerQr) : Promise.resolve(null),
  ]);

  const battlefieldTiles = battlefields.map((card, index) =>
    cardTile(card, battlefieldUris[index] ?? null, bfTileW, bfTileH),
  );
  const runeTiles = runeCards.map((card, index) =>
    cardTile(card, runeUris[index] ?? null, runeTileW, runeTileH),
  );

  const identityBand: Child =
    hasIdentityBand &&
    element(
      "div",
      {
        display: "flex",
        flexDirection: "row",
        height: legendH,
        gap: BODY_GAP,
        marginTop: GAP,
        flexShrink: 0,
      },
      legend && cardTile(legend, legendUri, legendW, legendH),
      element(
        "div",
        {
          display: "flex",
          flexDirection: "column",
          // Both sections are capped by the width they have to share, so they
          // rarely add up to the legend's height. Pushing them apart pins the
          // first to the hero's top edge and the last to its bottom, which
          // squares off the band instead of leaving it visibly short.
          justifyContent: "space-between",
          width: identityRightW,
          height: legendH,
        },
        bandBf && deckSection("BATTLEFIELDS", battlefieldTiles),
        bandRunes && deckSection("RUNES", runeTiles),
      ),
    );

  const mainGrid =
    grid &&
    element(
      "div",
      {
        display: "flex",
        flexDirection: "row",
        flexWrap: "wrap",
        alignContent: "flex-start",
        justifyContent: "center",
        width: grid.cols * grid.tileW + (grid.cols - 1) * GAP,
        gap: GAP,
      },
      ...gridCards.map((card, index) =>
        cardTile(card, gridUris[index] ?? null, grid.tileW, grid.tileH),
      ),
    );

  // The grid block absorbs the layout's slack. Centring it keeps a deck too
  // small to fill the area sitting between its bands rather than pinned under
  // the identity one with a hole beneath.
  const gridBlock = element(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      flexGrow: 1,
      alignItems: "center",
      justifyContent: "center",
      marginTop: GAP,
    },
    mainGrid ||
      element(
        "div",
        {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 34,
          color: COLORS.muted,
        },
        "No cards yet",
      ),
  );

  const lowerStack: Child =
    lowerH > 0 &&
    element(
      "div",
      { display: "flex", flexDirection: "column", marginTop: GAP, flexShrink: 0 },
      lowerBf && deckSection("BATTLEFIELDS", battlefieldTiles),
      lowerRunes && deckSection("RUNES", runeTiles, lowerBf ? GAP : 0),
      hasSideboard &&
        deckSection(
          "SIDEBOARD",
          sideboard.map((card, index) =>
            cardTile(card, sideboardUris[index] ?? null, sideboardTileW, sideboardTileH),
          ),
          lowerBf || lowerRunes ? GAP : 0,
        ),
    );

  const footer: Child =
    hasFooterMark &&
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
            { display: "flex", fontSize: 24, fontWeight: 600, color: COLORS.muted },
            input.siteHost,
          )
        : false,
    );

  const glowBackground = legend ? legendGlowBackground(legend.domains) : undefined;

  const root = element(
    "div",
    {
      display: "flex",
      position: "relative",
      flexDirection: "column",
      width: canvasW,
      height: canvasH,
      padding: canvas.pad,
      backgroundColor: COLORS.background,
      ...(glowBackground ? { backgroundImage: glowBackground } : {}),
      color: COLORS.text,
      fontFamily: "Hanken Grotesk",
      overflow: "hidden",
    },
    deckHeroBackdrop(backdropUri, canvasW, canvasH),
    verticalTitleBlock(
      input,
      canvas,
      deckMetaLabel(input.formatLabel, zones.mainCardCount, zones.sideboardCount),
      domainIconElements(domainUris, canvas.domainIcon),
      qrUri,
      titleH,
    ),
    identityBand,
    gridBlock,
    lowerStack,
    footer,
  );

  return renderTreeToPng(io, root, canvasW, canvasH, scale);
}
