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

/** 63mm x 88mm */
export const CARD_ASPECT = 63 / 88;

/** A card-shaped quadrilateral proposed by one of the detectors. */
export interface CardCandidate {
  quad: Quad;
  aspect: number;
  areaFraction: number;
  rectangularity: number;
  score: number;
}
