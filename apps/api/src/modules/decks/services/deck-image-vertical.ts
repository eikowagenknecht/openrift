import type { Io } from "../../../io.js";
import type { Child, Element } from "../../system/services/share-image-core.js";
import {
  CARD_ASPECT,
  COLORS,
  cardTile,
  element,
  qrDataUri,
  qrMark,
  renderTreeToPng,
  tileArtDataUri,
} from "../../system/services/share-image-core.js";
import type { DeckCanvas } from "./deck-image-canvas.js";
import { VERTICAL, resultLineElement, titleTypeHeight } from "./deck-image-canvas.js";
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

function fitRowTileH(count: number, areaW: number, aspect: number, maxH: number): number {
  if (count === 0) {
    return 0;
  }
  return Math.max(1, Math.floor(Math.min(maxH, (areaW - (count - 1) * GAP) / count / aspect)));
}

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
      // The QR can set this block taller than the type lines fill on their own.
      height: titleTypeHeight(input, canvas),
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
    input.resultLine === undefined ? false : resultLineElement(input.resultLine, canvas, 12),
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
 * 1x already renders at 1080x1920, the native upload size for every vertical
 * surface; `scale` above 1 adds editing headroom, not resolution.
 */
export async function renderVerticalDeckImage(
  io: Io,
  input: DeckImageInput,
  scale: number,
): Promise<Buffer> {
  const canvas = VERTICAL;
  const { width: canvasW, height: canvasH } = canvas;
  const zones = splitDeckZones(input.cards);
  const { legend, runeCards, battlefields, sideboard, gridCards } = zones;

  const innerW = canvasW - canvas.pad * 2;
  const typeH = titleTypeHeight(input, canvas);
  const titleH = input.shareUrl ? Math.max(typeH, canvas.headerQr) : typeH;
  const bodyH = canvasH - canvas.pad * 2 - titleH - GAP;
  const hasFooterMark = Boolean(input.siteHost);
  const footerH = hasFooterMark ? canvas.footerLabelH : 0;

  const bfCount = battlefields.length;
  const runeCount = runeCards.length;

  // Only a deck with a legend gets an identity band; a freeform deck's
  // battlefields and runes go to the full-width stack below the grid instead.
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
          // The two sections rarely add up to the legend's height; space-between pins the first to the hero's top edge and the last to its bottom.
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

  // Centered so a deck too small to fill the grid area sits between its bands, not pinned under the identity band with a gap beneath.
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
    mainGrid ??
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
