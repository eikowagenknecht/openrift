import { Resvg } from "@resvg/resvg-js";
import satori from "satori";

import type { Io } from "../io.js";
import { CARD_MEDIA_DIR } from "./images/paths.js";

/**
 * Shared primitives for the server-rendered share images (ADR-024, ADR-031):
 * the satori hyperscript, the bundled fonts, the card-art / SVG transcoders, and
 * the satori → resvg finish. The list/bundle renderer (`share-image.ts`) and the
 * deck renderer (`deck-image.ts`) both compose these; the layouts live in those
 * files, the reusable bits live here.
 *
 * satori speaks a CSS subset: every container with more than one child needs an
 * explicit `display: "flex"`, the default flex direction is `row`, and colors
 * must be concrete (no oklch). Raster sources (card art is WebP, glyphs are SVG)
 * cannot be embedded by satori directly, so each is transcoded to a PNG data URI
 * with sharp first.
 */

// Concrete approximations of the site's dark theme (apps/web/src/index.css).
export const COLORS = {
  background: "#14161d", // --background  oklch(0.16 0.025 260)
  surface: "#21242b", // --card        oklch(0.22 0.005 260)
  surfaceBorder: "#2d313a",
  text: "#f2f2f2", // --foreground  oklch(0.95 0 0)
  muted: "#9aa0ab", // --muted-foreground
  gold: "#cdac6e", // --primary     oklch(0.74 0.09 80)
} as const;

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
export async function cardArtDataUri(
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
