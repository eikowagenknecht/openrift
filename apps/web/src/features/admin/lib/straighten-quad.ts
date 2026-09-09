import type { ImageQuad } from "@openrift/shared/contracts/admin/card-images";
import { canonicalizeQuad } from "@openrift/shared/scan/geometry";
import type { CardCandidate, Point, Quad } from "@openrift/shared/scan/types";

const DEFAULT_INSET = 0.1;

function toImageQuad(quad: Quad): ImageQuad {
  return [
    { x: quad[0].x, y: quad[0].y },
    { x: quad[1].x, y: quad[1].y },
    { x: quad[2].x, y: quad[2].y },
    { x: quad[3].x, y: quad[3].y },
  ];
}

export function defaultQuad(width: number, height: number): ImageQuad {
  const left = width * DEFAULT_INSET;
  const right = width - left;
  const top = height * DEFAULT_INSET;
  const bottom = height - top;
  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ];
}

export function scaleQuad(quad: ImageQuad, factor: number): ImageQuad {
  return [
    { x: quad[0].x * factor, y: quad[0].y * factor },
    { x: quad[1].x * factor, y: quad[1].y * factor },
    { x: quad[2].x * factor, y: quad[2].y * factor },
    { x: quad[3].x * factor, y: quad[3].y * factor },
  ];
}

export function clampQuad(quad: ImageQuad, width: number, height: number): ImageQuad {
  const clamp = (point: Point): Point => ({
    x: Math.min(Math.max(point.x, 0), width),
    y: Math.min(Math.max(point.y, 0), height),
  });
  return [clamp(quad[0]), clamp(quad[1]), clamp(quad[2]), clamp(quad[3])];
}

export function bestCandidateQuad(candidates: readonly CardCandidate[]): ImageQuad | null {
  let best: CardCandidate | null = null;
  for (const candidate of candidates) {
    if (best === null || candidate.score > best.score) {
      best = candidate;
    }
  }
  if (best === null) {
    return null;
  }
  const ordered = toImageQuad(canonicalizeQuad(best.quad));
  let first = 0;
  let nearest = Infinity;
  let index = 0;
  for (const corner of ordered) {
    const distance = Math.hypot(corner.x, corner.y);
    if (distance < nearest) {
      nearest = distance;
      first = index;
    }
    index++;
  }
  if (first === 1) {
    return [ordered[1], ordered[2], ordered[3], ordered[0]];
  }
  if (first === 2) {
    return [ordered[2], ordered[3], ordered[0], ordered[1]];
  }
  if (first === 3) {
    return [ordered[3], ordered[0], ordered[1], ordered[2]];
  }
  return ordered;
}

export function quadCacheKey(quad: ImageQuad | null): string {
  if (quad === null) {
    return "0";
  }
  const source = quad.map((point) => `${Math.round(point.x)},${Math.round(point.y)}`).join(";");
  let hash = 0x81_1c_9d_c5;
  for (let index = 0; index < source.length; index++) {
    hash ^= source.codePointAt(index) ?? 0;
    hash = Math.imul(hash, 0x01_00_01_93);
  }
  return (hash >>> 0).toString(36);
}

export function imageToDisplayScale(naturalWidth: number, displayedWidth: number): number {
  if (naturalWidth <= 0 || displayedWidth <= 0) {
    return 1;
  }
  return displayedWidth / naturalWidth;
}

/** Reads the quad off an admin image response that may predate the field. */
export function imageQuadOf(image: { quad?: ImageQuad | null }): ImageQuad | null {
  return image.quad ?? null;
}
