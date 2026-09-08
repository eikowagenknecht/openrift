import type { Io } from "../../../io.js";
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
} from "../../system/services/share-image-core.js";
import { LANDSCAPE, resultLineElement, titleTypeHeight } from "./deck-image-canvas.js";
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

/** Width of the landscape layout's left legend panel. */
const LANDSCAPE_LEFT_W = 250;
/** Base portrait sideboard tile height (grows to fill leftover space). */
const SIDEBOARD_TILE_H = 96;
/** Base landscape battlefield tile height; runes share this row and match it. */
const BATTLEFIELD_BAND_TILE_H = 84;
/** Ceiling on how far the landscape band tiles grow into the grid's leftovers. */
const MAX_TILE_SCALE = 1.7;

export async function renderLandscapeDeckImage(
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
  const typeH = titleTypeHeight(input, canvas);
  const titleH = input.shareUrl ? Math.max(typeH, canvas.headerQr) : typeH;
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

  // Host-label width is overestimated at 12px/char (20px font) to keep it off the clipped right edge.
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
  const titleTypeRow = element(
    "div",
    // The type group keeps its own height and is centred in the row by the
    // row's `alignItems`, so growing the row for the QR does not drag the
    // title down to sit on the row's bottom edge.
    {
      display: "flex",
      flexDirection: "row",
      alignItems: "flex-end",
      ...(input.resultLine === undefined ? { flexGrow: 1 } : {}),
    },
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
          // "by Name", not "· Name": the middle-dot glyph floats off the title baseline at this size.
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
            // Glyphs center on the metadata run, not its baseline: offset by the run's nudge plus half the glyph/text height difference.
            transform: `translateY(${baselineNudge(canvas.titleSize, canvas.metaSize) + (canvas.domainIcon - canvas.metaSize) / 2}px)`,
          },
          ...domainIcons,
        )
      : false,
  );

  const titleRow = element(
    "div",
    {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      height: titleH,
      marginBottom: GAP,
    },
    input.resultLine === undefined
      ? titleTypeRow
      : element(
          "div",
          { display: "flex", flexDirection: "column", flexGrow: 1 },
          titleTypeRow,
          resultLineElement(input.resultLine, canvas, 10),
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
    mainGrid ?? element("div", { display: "flex", flexGrow: 1 }),
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
