import type { Io } from "../io.js";
import type { DeckImageInput } from "./deck-image-parts.js";
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
  CANVAS,
  CARD_ASPECT,
  COLORS,
  cardTile,
  element,
  qrDataUri,
  qrMark,
  renderTreeToPng,
  tileArtDataUri,
} from "./share-image-core.js";

/**
 * The 9:16 deck image: the same decklist as the landscape og:image, recomposed
 * for a canvas held upright. This is a download-only export — no crawler
 * consumes a vertical og:image — for the surfaces a decklist is actually read
 * on a phone: a story, a photo-mode slide, or a plate dropped into a video
 * editor.
 *
 * It is a second composition rather than a resize because the landscape layout
 * is horizontal at its core: a legend panel *beside* a grid, with a band whose
 * tiles absorb whatever vertical slack the grid leaves. Rotating the canvas
 * turns that arrangement inside out. Here the stack runs title → identity band
 * (legend beside its battlefields and runes) → main grid → sideboard → footer,
 * each band a fixed height and the grid taking the rest.
 *
 * The payoff is legibility: 1080×1920 is 2.7× the pixels of 1200×630, and
 * nearly all of it reaches the main grid, so a full decklist renders at roughly
 * 1.7× the tile size the landscape image can manage.
 */

const { width: WIDTH, height: HEIGHT } = CANVAS.vertical;
const PAD = 28;

/** Title line, then the byline and metadata on a second line beneath it. */
const TITLE_H = 96;
const TITLE_SIZE = 46;
const BYLINE_SIZE = 28;
const META_SIZE = 26;
/** The title has its own full-width line here, but the type is larger and the
 * canvas narrower than landscape, so the cap lands in a similar place. */
const TITLE_MAX_CHARS = 32;
const DOMAIN_ICON = 34;

/**
 * The QR sits at the right end of the title block, as it does on the landscape
 * image, rather than in the footer. Bigger here than there because the canvas
 * is read at arm's length on a phone, and because the two title lines already
 * give the block most of the mark's height.
 */
const HEADER_QR_SIZE = 132;
/** Height the footer reserves once it is only the host label. */
const FOOTER_LABEL_H = 32;

/** Legend hero width; its height sets the whole identity band's. */
const LEGEND_W = 300;
/**
 * Ceiling on a main-grid tile. Without it a three-card deck is drawn as three
 * 340px slabs and a one-card deck as a single 700px one, because the packer
 * maximizes the tile against an area that is now very tall.
 */
const MAX_GRID_TILE_W = 300;
/** Ceilings for the full-width bands, so a two-card sideboard is not a hero row. */
const MAX_BAND_TILE_H = 200;
const MAX_SIDEBOARD_TILE_H = 220;

/**
 * Height of a single full-width row of `count` tiles, bounded by the width it
 * has to share and by a ceiling so a sparse row stays a row.
 * @returns The tile height, or 0 when there is nothing to draw.
 */
function fitRowTileH(count: number, areaW: number, aspect: number, maxH: number): number {
  if (count === 0) {
    return 0;
  }
  return Math.max(1, Math.floor(Math.min(maxH, (areaW - (count - 1) * GAP) / count / aspect)));
}

/**
 * The title block: the deck name on its own line, then the byline, the
 * format/count, and the domain glyphs sharing a second one, with the QR at the
 * right of both. Stacked rather than strung along a single row because the
 * canvas is narrower than landscape while the type is larger.
 * @returns The title block element.
 */
function titleBlock(
  input: DeckImageInput,
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
      height: TITLE_H,
    },
    element(
      "div",
      {
        display: "flex",
        fontSize: TITLE_SIZE,
        lineHeight: 1,
        fontWeight: 700,
        color: COLORS.text,
        whiteSpace: "nowrap",
      },
      truncateTitle(input.deckName, TITLE_MAX_CHARS),
    ),
    element(
      "div",
      { display: "flex", flexDirection: "row", alignItems: "center", marginTop: 14 },
      input.ownerName
        ? element(
            "div",
            {
              display: "flex",
              fontSize: BYLINE_SIZE,
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
          fontSize: META_SIZE,
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
          qrMark(qrUri, HEADER_QR_SIZE),
        )
      : false,
  );
}

/**
 * Renders the vertical deck image to a PNG buffer. `scale` renders the same
 * base layout at N× resolution; 1× is already 1080×1920, the native upload size
 * for every vertical surface, so `scale` here is editing headroom rather than
 * the deliverable.
 * @returns PNG bytes ready to return as `image/png`.
 */
export async function renderDeckImageVertical(
  io: Io,
  input: DeckImageInput,
  scale = 1,
): Promise<Buffer> {
  const zones = splitDeckZones(input.cards);
  const { legend, runeCards, battlefields, sideboard, gridCards } = zones;

  const innerW = WIDTH - PAD * 2;
  // The title block is as tall as its tallest content: the two type lines
  // normally, the QR when there is one.
  const titleH = input.shareUrl ? Math.max(TITLE_H, HEADER_QR_SIZE) : TITLE_H;
  const bodyH = HEIGHT - PAD * 2 - titleH - GAP;
  const hasFooterMark = Boolean(input.siteHost);
  const footerH = hasFooterMark ? FOOTER_LABEL_H : 0;

  const bfCount = battlefields.length;
  const runeCount = runeCards.length;

  // ── Identity band: the legend hero, with its battlefields and runes beside it.
  // Only a deck with a legend gets one; a freeform deck sends both bands to the
  // full-width stack below the grid instead, where they read as sections rather
  // than as an identity that isn't there.
  const hasIdentityBand = legend !== null;
  const legendW = LEGEND_W;
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

  // ── Full-width bands below the grid ────────────────────────────────────────
  const lowerBf = !hasIdentityBand && bfCount > 0;
  const lowerRunes = !hasIdentityBand && runeCount > 0;
  const hasSideboard = sideboard.length > 0;
  const lowerBfH = lowerBf ? fitRowTileH(bfCount, innerW, BATTLEFIELD_ASPECT, MAX_BAND_TILE_H) : 0;
  const lowerRuneH = lowerRunes ? fitRowTileH(runeCount, innerW, CARD_ASPECT, MAX_BAND_TILE_H) : 0;
  const sideboardTileH = hasSideboard
    ? fitRowTileH(sideboard.length, innerW, CARD_ASPECT, MAX_SIDEBOARD_TILE_H)
    : 0;

  const lowerSections = [lowerBfH, lowerRuneH, sideboardTileH].filter((height) => height > 0);
  const lowerH =
    lowerSections.reduce((sum, height) => sum + height + SECTION_HEADER_H, 0) +
    Math.max(0, lowerSections.length - 1) * GAP;

  // Everything else is fixed, so the grid takes what remains.
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
          maxTileW: MAX_GRID_TILE_W,
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
    deckBackdropUri(io, input.coverImageId ?? legend?.imageId, WIDTH, HEIGHT, scale),
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
    Promise.all(domains.map((domain) => glyphUri(io, domain, DOMAIN_ICON, scale))),
    input.shareUrl ? qrDataUri(input.shareUrl, scale, HEADER_QR_SIZE) : Promise.resolve(null),
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
      width: WIDTH,
      height: HEIGHT,
      padding: PAD,
      backgroundColor: COLORS.background,
      ...(glowBackground ? { backgroundImage: glowBackground } : {}),
      color: COLORS.text,
      fontFamily: "Hanken Grotesk",
      overflow: "hidden",
    },
    deckHeroBackdrop(backdropUri, WIDTH, HEIGHT),
    titleBlock(
      input,
      deckMetaLabel(input.formatLabel, zones.mainCardCount, zones.sideboardCount),
      domainIconElements(domainUris, DOMAIN_ICON),
      qrUri,
      titleH,
    ),
    identityBand,
    gridBlock,
    lowerStack,
    footer,
  );

  return renderTreeToPng(io, root, WIDTH, HEIGHT, scale);
}
