import { qrPngDataUri } from "@openrift/shared/qr";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";

import type { Io } from "../io.js";
import { CARD_MEDIA_DIR } from "./images/paths.js";

/**
 * Shared primitives for the server-rendered share images. A constant that
 * governs how the renderers *look* the same — palette, card aspect, tile, mark
 * size — belongs here rather than being restated per renderer, which is how
 * the surfaces drifted apart in the first place.
 *
 * satori speaks a CSS subset: every container with more than one child needs
 * an explicit `display: "flex"`, the default flex direction is `row`, and
 * colors must be concrete (no oklch). Raster sources (WebP card art, SVG
 * glyphs) cannot be embedded by satori directly, so each is transcoded to a
 * PNG data URI with sharp first.
 */

/**
 * `vertical` is a download-only export: no crawler consumes a 9:16 og:image
 * (they crop or letterbox it), so an aspect never reaches the `og:image` URL.
 */
export type ShareImageAspect = "landscape" | "vertical";

/**
 * 1200×630 is the og convention; 1080×1920 is the native upload resolution for
 * every vertical surface, so the 1× vertical render is already the deliverable.
 */
export const CANVAS: Record<ShareImageAspect, { width: number; height: number }> = {
  landscape: { width: 1200, height: 630 },
  vertical: { width: 1080, height: 1920 },
};

export function aspectFromQuery(value: string | undefined): ShareImageAspect {
  return value === "vertical" ? "vertical" : "landscape";
}

/**
 * Public, immutably-cached images are capped at 2× because rasterizing cost
 * grows super-linearly and every URL is a new cache entry. 3× is offered only
 * on the owner-only download routes (authenticated, `no-store`, low traffic).
 */
export const MAX_IMAGE_SCALE = 3;

/**
 * `?size=hq` is the older two-valued form and still means 2×, so existing
 * og:image and download URLs keep rendering what they did. An unparseable
 * `scale` falls through rather than erroring — a bad multiplier should cost
 * sharpness, not the whole image.
 */
export function scaleFromQuery(scale: string | undefined, size: string | undefined): number {
  const asked = Number(scale);
  if (Number.isInteger(asked) && asked >= 1 && asked <= MAX_IMAGE_SCALE) {
    return asked;
  }
  return size === "hq" ? 2 : 1;
}

/** `?qr=0` is the opt-out for a creator who wants a clean plate to composite over. */
export function qrFromQuery(value: string | undefined): boolean {
  return value !== "0";
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
 * One mark size for every image, sized for the worst case these images meet —
 * a code read off a paused stream frame or a feed thumbnail — rather than for
 * whatever space a given layout happened to have spare.
 */
export const QR_SIZE = 84;

const QR_RADIUS = 6;

/** Largest self-hosted variant (short edge ~800px). */
const CARD_ART_VARIANT = "full";

/**
 * Mirrors the web app's proportional `5% / 3.6%` card radius
 * (card-grid-constants.ts). Derived off the short edge rather than fixed in
 * px, so every tile size — landscape battlefield tiles included — rounds in
 * proportion to the art the way the app does.
 */
export const CARD_RADIUS_FRACTION = 0.05;

export function cardRadiusPx(tileW: number, tileH: number): number {
  return Math.round(Math.min(tileW, tileH) * CARD_RADIUS_FRACTION);
}

export interface Element {
  type: string;
  props: Record<string, unknown>;
}
export type Child = Element | string | false | null | undefined;

/** Falsy children are dropped so conditionals inline cleanly. */
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
 * satori cannot read the WOFF2 the web app uses, so these TTFs are static
 * instances of the same variable face.
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
 * Cards vary in orientation, so `fit: "contain"` letterboxes each onto a
 * uniform transparent tile. Callers pass the target resolution (display px ×
 * render scale) so high-res renders embed crisp source art.
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
    // Corners are rounded in sharp rather than via the tile's overflow:hidden —
    // satori does not clip a child <img> to the parent's border-radius, so a
    // square scan would poke past the rounded tile at the corners.
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
 * Mirrors the web deck hero's full-art treatment. The blur is baked in here
 * because satori has no CSS `filter`; callers overlay their own scrim
 * gradients and opacity in the element tree.
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
 * The input density is raised so librsvg renders the vector natively at the
 * target size rather than upscaling a 24px bitmap.
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

export interface TileCard {
  cardName: string;
  /** Tier-list tiles omit it — a tier list ranks a card once, so there is nothing to count. */
  quantity?: number;
}

/**
 * Card images already bake in cost/power/name/text, so a tile is just art plus
 * the badge. Every measurement is a fraction of the tile rather than a fixed
 * pixel value, so one tile serves ~90px deck cells and ~300px list cells alike
 * without per-surface constants to drift apart.
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
  // Bounded because past ~40px the badge stops reading as a badge and starts
  // competing with the art.
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
 * Elided in code rather than with `overflow: hidden` so the title stays a
 * plain text node whose flex baseline is its text baseline — an
 * overflow-clipped node reports its box bottom as the baseline instead, which
 * pushes an adjacent byline off it.
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
 * Dark-on-white rather than gold-on-transparent: a light-on-dark code is
 * inverted polarity, which older and cheaper scanners refuse. The 2-module
 * quiet zone is white rather than transparent, so it doubles as the light
 * plate the code needs and the mark's footprint stays exactly `size` for the
 * layout maths.
 */
export function qrDataUri(url: string, scale: number, size = QR_SIZE): Promise<string | null> {
  return qrPngDataUri(url, { width: size * scale }).catch(() => null);
}

/**
 * Keep `size` equal to the size the source was generated at: scaling down
 * resamples cleanly, but scaling up blurs the modules.
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
 * resvg rather than sharp's librsvg path: ~20× faster here (a 2× render drops
 * from ~14s to ~0.8s). satori renders text as vector paths, so resvg needs no
 * fonts; `zoom: scale` renders the same base-sized layout at N×, with raster
 * sources embedded at the matching resolution by the caller.
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
