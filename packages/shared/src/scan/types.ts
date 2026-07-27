/**
 * Core value types for the card scanner. Everything here is DOM-free so the
 * same code runs in a browser worker, in Bun for the offline bench, and in the
 * API when building the reference index.
 */

/** Packed 8-bit RGBA pixels, row-major, 4 bytes per pixel. */
export interface RgbaImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Single-channel 8-bit image, row-major. */
export interface GrayImage {
  data: Uint8Array;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Four corners of a detected card, in clockwise order starting at the corner
 * closest to the top-left of the frame. Coordinates are in the pixel space of
 * whatever image the quad was detected in.
 */
export type Quad = readonly [Point, Point, Point, Point];

/**
 * Row-major 3x3 matrix. Used for the homographies that map a detected quad
 * onto the canonical upright card rectangle.
 */
export type Matrix3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/** Physical card proportions: 63mm x 88mm stock, the same for every Riftbound card. */
export const CARD_ASPECT = 63 / 88;

/** A card-shaped quadrilateral proposed by one of the detectors. */
export interface CardCandidate {
  /** Corners in the coordinate space of the frame that was passed in. */
  quad: Quad;
  /** Long side over short side; a flat-on card reads about 1.397. */
  aspect: number;
  /** Quad area as a fraction of the whole frame. */
  areaFraction: number;
  /** Quad area over hull area; near 1 when the outline really is a quadrilateral. */
  rectangularity: number;
  /** Combined shape and aim prior, higher is better. */
  score: number;
}
