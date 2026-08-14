import { Resvg } from "@resvg/resvg-js";
import QRCode from "qrcode";
import satori from "satori";

import type { Io } from "../io.js";
import { CARD_MEDIA_DIR } from "./images/paths.js";

/**
 * Shared primitives for the server-rendered share images (ADR-024, ADR-031):
 * the satori hyperscript, the bundled fonts, the card-art / SVG transcoders, the
 * card tile, the QR mark, and the satori → resvg finish. The list/bundle
 * renderer (`share-image.ts`), the deck renderer (`deck-image.ts`) and the
 * tier-list renderer (`tier-list-image.ts`) all compose these; the layouts live
 * in those files, everything the three share lives here.
 *
 * A constant that governs how the three *look* the same — the palette, the card
 * aspect, the tile, the mark size — belongs here rather than being restated per
 * renderer, which is how the surfaces drifted apart in the first place.
 *
 * satori speaks a CSS subset: every container with more than one child needs an
 * explicit `display: "flex"`, the default flex direction is `row`, and colors
 * must be concrete (no oklch). Raster sources (card art is WebP, glyphs are SVG)
 * cannot be embedded by satori directly, so each is transcoded to a PNG data URI
 * with sharp first.
 */

/**
 * Which canvas a share image renders on. `landscape` is the link-unfurl shape
 * every og:image uses; `vertical` is a download-only export for the places a
 * decklist is read on a phone held upright — a story, a photo-mode slide, or a
 * background plate in a video editor. No crawler consumes a 9:16 og:image (they
 * crop or letterbox it), so an aspect never reaches the `og:image` URL.
 */
export type ShareImageAspect = "landscape" | "vertical";

/**
 * Canvas size per aspect. 1200×630 is the og convention; 1080×1920 is the
 * native upload resolution for every vertical surface, so the 1× vertical
 * render is already the deliverable and `size=hq` is only editing headroom.
 */
export const CANVAS: Record<ShareImageAspect, { width: number; height: number }> = {
  landscape: { width: 1200, height: 630 },
  vertical: { width: 1080, height: 1920 },
};

/** @returns The aspect a request asked for; anything unrecognized stays landscape. */
export function aspectFromQuery(value: string | undefined): ShareImageAspect {
  return value === "vertical" ? "vertical" : "landscape";
}

// Concrete approximations of the site's dark theme (apps/web/src/index.css).
export const COLORS = {
  background: "#14161d", // --background  oklch(0.16 0.025 260)
  surface: "#21242b", // --card        oklch(0.22 0.005 260)
  surfaceBorder: "#2d313a",
  text: "#f2f2f2", // --foreground  oklch(0.95 0 0)
  muted: "#9aa0ab", // --muted-foreground
  gold: "#cdac6e", // --primary     oklch(0.74 0.09 80)
} as const;

/** Portrait card aspect (width / height); landscape art letterboxes within the box. */
export const CARD_ASPECT = 0.715;

/**
 * Tile border width. The art is sized to the box inside it so it stays centered:
 * satori uses border-box, so an art image the full tile size is pinned top-left
 * and clipped bottom-right, shifting the card down-right. Sizing to the content
 * box centers it within the border.
 */
export const TILE_BORDER = 1;

/**
 * Scannable mark size, one value for every image that carries one. Sized for the
 * worst case these images meet — a code read off a paused stream frame or a feed
 * thumbnail — rather than for whatever space a given layout happened to have
 * spare, which is what made the tier list's mark 52px and the deck's 84px.
 */
export const QR_SIZE = 84;

/** Corner radius on the QR's white plate. */
const QR_RADIUS = 6;

/** Largest self-hosted variant (short edge ~800px); the tiles are big, so use it. */
const CARD_ART_VARIANT = "full";

/**
 * Card corner radius as a fraction of the tile's short edge. Mirrors the web
 * app's proportional `5% / 3.6%` card radius (apps/web card-grid-constants.ts):
 * for a portrait 63×88 card, 5% of the width is ~3.6% of the height, i.e. a
 * near-circular corner at ~5% of the short edge. Deriving it off the short edge
 * — rather than a fixed pixel value — keeps every tile size, and the landscape
 * battlefield tiles, rounded in proportion to the art the way the app does.
 */
export const CARD_RADIUS_FRACTION = 0.05;

/**
 * Computes the proportional card corner radius in px for a tile of the given
 * size. The art is masked to this same radius so corners never bleed past the
 * tile (satori does not clip a child `<img>` to the parent's `border-radius`).
 * @returns The corner radius in px, matching the app's size-relative rounding.
 */
export function cardRadiusPx(tileW: number, tileH: number): number {
  return Math.round(Math.min(tileW, tileH) * CARD_RADIUS_FRACTION);
}

export interface Element {
  type: string;
  props: Record<string, unknown>;
}
export type Child = Element | string | false | null | undefined;

/**
 * Minimal hyperscript so the layout reads top-down without JSX (the api is not
 * set up for JSX). Falsy children are dropped so conditionals inline cleanly.
 * @returns A satori-compatible element node.
 */
export function element(
  type: string,
  style: Record<string, unknown>,
  ...children: Child[]
): Element {
  const kept = children.filter(
    (child): child is Element | string => child !== false && child !== null && child !== undefined,
  );
  const childProp = kept.length === 0 ? undefined : kept.length === 1 ? kept[0] : kept;
  return { type, props: { style, children: childProp } };
}

interface SatoriFont {
  name: string;
  data: Buffer;
  weight: 400 | 600 | 700;
  style: "normal";
}

let cachedFonts: SatoriFont[] | null = null;

/**
 * Loads the bundled Hanken Grotesk weights once and reuses them across renders.
 * These match the app UI font. The TTFs ship in the api image (the Dockerfile
 * copies all of apps/api and runs from source); satori cannot read the WOFF2
 * the web app uses, so these are static instances of the same variable face.
 * @returns The satori `fonts` array.
 */
async function loadFonts(io: Io): Promise<SatoriFont[]> {
  if (cachedFonts) {
    return cachedFonts;
  }
  const fontDir = `${import.meta.dirname}/../assets/fonts`;
  const read = (file: string): Promise<Buffer> => io.fs.readFile(`${fontDir}/${file}`);
  cachedFonts = [
    {
      name: "Hanken Grotesk",
      data: await read("HankenGrotesk-Regular.ttf"),
      weight: 400,
      style: "normal",
    },
    {
      name: "Hanken Grotesk",
      data: await read("HankenGrotesk-SemiBold.ttf"),
      weight: 600,
      style: "normal",
    },
    {
      name: "Hanken Grotesk",
      data: await read("HankenGrotesk-Bold.ttf"),
      weight: 700,
      style: "normal",
    },
  ];
  return cachedFonts;
}

/**
 * Reads a card image off disk and transcodes it to a PNG data URI at the given
 * pixel size. Cards vary in orientation (portrait vs landscape), so
 * `fit: "contain"` letterboxes each onto a uniform transparent tile that drops
 * onto the dark surface cleanly. Callers pass the target resolution (display px
 * times the render scale) so high-res renders embed crisp source art.
 * @returns A `data:image/png;base64,...` URI, or null if the file is unreadable.
 */
async function cardArtDataUri(
  io: Io,
  imageId: string,
  widthPx: number,
  heightPx: number,
  radiusPx: number,
): Promise<string | null> {
  try {
    const path = `${CARD_MEDIA_DIR}/${imageId.slice(-2)}/${imageId}-${CARD_ART_VARIANT}.webp`;
    const source = await io.fs.readFile(path);
    // Round the art's corners in sharp (transparent outside the radius) rather
    // than relying on the tile's overflow:hidden — satori does not clip a child
    // <img> to the parent's border-radius, so a square scan would otherwise poke
    // past the rounded tile at the corners.
    const cornerMask = Buffer.from(
      `<svg width="${widthPx}" height="${heightPx}"><rect width="${widthPx}" height="${heightPx}" rx="${radiusPx}" ry="${radiusPx}" fill="#fff"/></svg>`,
    );
    const png = await io
      .sharp(source)
      .resize(widthPx, heightPx, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .composite([{ input: cornerMask, blend: "dest-in" }])
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    // A missing or corrupt file falls back to a name-only tile rather than
    // failing the whole image.
    return null;
  }
}

/**
 * Renders a card image as a blurred full-bleed backdrop, mirroring the web
 * deck hero's full-art treatment: cover-crop anchored below the card's top
 * border (so the frame edge never shows), strong gaussian blur, and a slight
 * saturation lift. The blur is baked in here because satori has no CSS
 * `filter`. Callers overlay their own scrim gradients and set opacity in the
 * element tree.
 * @returns A `data:image/png;base64,...` URI, or null if the file is unreadable.
 */
export async function blurredArtBackdropDataUri(
  io: Io,
  imageId: string,
  widthPx: number,
  heightPx: number,
): Promise<string | null> {
  try {
    const path = `${CARD_MEDIA_DIR}/${imageId.slice(-2)}/${imageId}-${CARD_ART_VARIANT}.webp`;
    const source = await io.fs.readFile(path);
    // Oversized top-anchored cover, then a window one quarter down: skips the
    // card border and lands on the art band, independent of source dimensions.
    const overscanH = Math.round(heightPx * 1.4);
    const png = await io
      .sharp(source)
      .resize(widthPx, overscanH, { fit: "cover", position: "top" })
      .extract({ left: 0, top: Math.round(heightPx * 0.25), width: widthPx, height: heightPx })
      .blur(widthPx / 50)
      .modulate({ saturation: 1.25 })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Rasterizes an SVG buffer to a PNG data URI at the given pixel size. Used for
 * the rune-domain glyphs, which ship as small (24px) SVGs: the input density is
 * raised so librsvg renders the vector natively at the target size rather than
 * upscaling a 24px bitmap.
 * @returns A `data:image/png;base64,...` URI, or null if the SVG is unrenderable.
 */
export async function svgToPngDataUri(
  io: Io,
  svg: Buffer,
  sizePx: number,
  intrinsicPx = 24,
): Promise<string | null> {
  try {
    const density = Math.max(72, Math.ceil((sizePx / intrinsicPx) * 72));
    const png = await io
      .sharp(svg, { density })
      .resize(sizePx, sizePx, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Resolves a tile's art at the render scale. Generated at the content-box size
 * (inside the tile border) so the art fills that box exactly and stays centered
 * rather than clipping bottom-right.
 * @returns The art data URI, or null when there is no art or it is unreadable.
 */
export function tileArtDataUri(
  io: Io,
  imageId: string | null,
  tileW: number,
  tileH: number,
  scale: number,
): Promise<string | null> {
  if (!imageId) {
    return Promise.resolve(null);
  }
  const contentW = tileW - 2 * TILE_BORDER;
  const contentH = tileH - 2 * TILE_BORDER;
  return cardArtDataUri(
    io,
    imageId,
    contentW * scale,
    contentH * scale,
    cardRadiusPx(contentW, contentH) * scale,
  );
}

/** A card as a tile needs it: a name for the art-less fallback, and a count. */
export interface TileCard {
  cardName: string;
  /** Copies held; the badge is drawn only above one. Tier-list tiles omit it —
   * a tier list ranks a card once, so there is nothing to count. */
  quantity?: number;
}

/**
 * One card tile: the art, or a name-only fallback, plus a quantity badge when
 * the card is held in multiples. Card images already bake in cost/power/name/
 * text, so a tile is just art plus the badge — there is no per-card chrome to
 * re-composite.
 *
 * Every measurement is a fraction of the tile rather than a fixed pixel value,
 * so one tile serves the deck grid's ~90px cells, the list grid's ~180px cells
 * and a tier row's tiles alike without per-surface constants to drift apart.
 * @returns The tile element.
 */
export function cardTile(
  card: TileCard,
  dataUri: string | null,
  tileW: number,
  tileH: number,
): Element {
  const contentW = tileW - 2 * TILE_BORDER;
  const contentH = tileH - 2 * TILE_BORDER;
  const image: Element = dataUri
    ? { type: "img", props: { src: dataUri, width: contentW, height: contentH } }
    : element(
        "div",
        {
          display: "flex",
          width: contentW,
          height: contentH,
          alignItems: "center",
          justifyContent: "center",
          padding: Math.max(3, Math.round(tileW * 0.05)),
          textAlign: "center",
          fontSize: Math.max(7, Math.round(tileW * 0.16)),
          fontWeight: 600,
          color: COLORS.muted,
          lineHeight: 1.2,
        },
        card.cardName,
      );

  const quantity = card.quantity ?? 1;
  // Proportional between the bounds, so the badge stays legible on the deck
  // grid's small tiles without ballooning on a five-card list where each tile is
  // 300px tall — past ~40px it stops reading as a badge and starts competing
  // with the art.
  const badgeH = Math.min(40, Math.max(20, Math.round(tileH * 0.18)));
  const inset = Math.max(5, Math.round(tileH * 0.03));
  const badge =
    quantity > 1 &&
    element(
      "div",
      {
        display: "flex",
        position: "absolute",
        bottom: inset,
        right: inset,
        alignItems: "center",
        justifyContent: "center",
        height: badgeH,
        minWidth: badgeH,
        paddingLeft: Math.round(badgeH * 0.18),
        paddingRight: Math.round(badgeH * 0.18),
        borderRadius: Math.round(badgeH * 0.28),
        backgroundColor: "rgba(8,9,12,0.82)",
        color: COLORS.text,
        fontSize: Math.round(badgeH * 0.62),
        fontWeight: 700,
      },
      `×${quantity}`,
    );

  return element(
    "div",
    {
      display: "flex",
      position: "relative",
      width: tileW,
      height: tileH,
      borderRadius: cardRadiusPx(tileW, tileH),
      overflow: "hidden",
      backgroundColor: COLORS.surface,
      border: `${TILE_BORDER}px solid ${COLORS.surfaceBorder}`,
    },
    image,
    badge,
  );
}

/**
 * Truncates a title to `max` characters with an ellipsis. Elided in code rather
 * than with `overflow: hidden` so the title stays a plain text node whose flex
 * baseline is its text baseline — an overflow-clipped node reports its box
 * bottom as the baseline instead, which pushes an adjacent byline off it.
 * @returns The title, truncated when longer than the cap.
 */
export function elideTitle(title: string, max: number): string {
  return title.length > max ? `${title.slice(0, max - 1).trimEnd()}…` : title;
}

/**
 * Slope of the baseline error against the font-size gap, for runs that set
 * `lineHeight: 1`. Fitted on rendered output with gaps of 20–180px, where the
 * integer-pixel measurement pins it tightly: 40/20 → 3px, 100/20 → 11px,
 * 200/20 → 26px.
 *
 * It is specific to that line height. The same measurement at satori's default
 * line height gives 0.29, because the error is
 * `gap × (lineHeight + descent − ascent) / 2` and only the line height varies.
 * Runs that do not pin `lineHeight: 1` need the other constant — which is the
 * trap: applying this one to a default-line-height pair under-corrects by half,
 * and applying the other one to a `lineHeight: 1` pair lifts the smaller run
 * twice as far as it should go.
 */
const BASELINE_ERROR_SLOPE_LH1 = 0.14;

/**
 * Vertical correction for a smaller text run set beside a larger one — a byline
 * next to a title, "more" next to "+30".
 *
 * satori does not implement `alignItems: "baseline"`: it bottom-aligns the boxes
 * instead (measured, it produces output byte-identical to `flex-end`). Bottom
 * aligned, the smaller run's baseline lands low by the difference in the space
 * each box reserves beneath its baseline, which is a fixed fraction of the font
 * size — hence a correction linear in the size gap.
 *
 * **Both runs must set `lineHeight: 1`**, which every title row and the list
 * image's overflow tile do. The constant is only right for that line height; see
 * BASELINE_ERROR_SLOPE_LH1.
 *
 * Apply as `transform: translateY(...)` on the smaller run, and bottom-align the
 * row that holds them (`alignItems: "flex-end"`) so they start from a shared
 * edge — a row that centres its children instead leaves each box centred on its
 * own height, which no per-run offset can then reconcile.
 * @returns The px offset (negative, i.e. upward) for the smaller run.
 */
export function baselineNudge(largerFontSize: number, smallerFontSize: number): number {
  const gap = largerFontSize - smallerFontSize;
  // Equal (or inverted) sizes need no correction, and returning a plain 0 keeps
  // `-0` out of the emitted `translateY(-0px)`.
  return gap <= 0 ? 0 : -Math.round(gap * BASELINE_ERROR_SLOPE_LH1);
}

/**
 * Encodes `url` as a scannable code at the render scale. Dark-on-white rather
 * than gold-on-transparent: a light-on-dark code is inverted polarity, which
 * older and cheaper scanners refuse, and these images are the artifacts most
 * likely to be scanned off a stranger's phone. The 2-module quiet zone is white
 * rather than transparent, so it doubles as the light plate the code needs and
 * the mark's footprint stays exactly QR_SIZE for the layout maths.
 * @returns The QR data URI, or null when encoding fails.
 */
export function qrDataUri(url: string, scale: number): Promise<string | null> {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: "M",
    width: QR_SIZE * scale,
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
  }).catch(() => null);
}

/**
 * The QR image element, at the shared mark size unless a layout genuinely can't
 * fit it (a code inside a narrow grid tile). Only ever pass a smaller `size` —
 * the source is generated at QR_SIZE, so scaling down resamples cleanly while
 * scaling up would blur the modules.
 * @returns The mark element.
 */
export function qrMark(dataUri: string, size = QR_SIZE): Element {
  return {
    type: "img",
    props: {
      src: dataUri,
      width: size,
      height: size,
      style: { borderRadius: QR_RADIUS },
    },
  };
}

/**
 * Lays the element tree out with satori, then rasterizes the SVG to PNG with
 * resvg. resvg is the canonical satori rasterizer and is ~20× faster here than
 * sharp's librsvg path (ADR-031): a 2× render drops from ~14s to ~0.8s. satori
 * renders text as vector paths, so resvg needs no fonts; `zoom: scale` renders
 * the same base-sized layout at N× (raster sources are embedded at the matching
 * resolution by the caller, so they stay crisp).
 * @returns PNG bytes.
 */
export async function renderTreeToPng(
  io: Io,
  root: Element,
  width: number,
  height: number,
  scale = 1,
): Promise<Buffer> {
  const fonts = await loadFonts(io);
  const svg = await satori(root as unknown as Parameters<typeof satori>[0], {
    width,
    height,
    fonts,
  });
  const rendered = new Resvg(svg, {
    fitTo: { mode: "zoom", value: scale },
    font: { loadSystemFonts: false },
  }).render();
  return Buffer.from(rendered.asPng());
}
