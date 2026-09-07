/**
 * Pure pixel analysis for scanner images: where the card sits inside a scan,
 * and how far its levels have to be stretched. Both functions take a raw
 * greyscale buffer and return plain numbers, so they touch neither sharp nor
 * the filesystem — `variants.ts` is what feeds them a decoded scan and applies
 * the results.
 */

/**
 * Greyscale luminance below which a pixel counts as card content when
 * analyzing a scan. The scanner halo line (~178) and paper background stay
 * above it, card borders and art fall below it.
 */
const SCAN_CONTENT_LUMINANCE = 155;

/** A scan's darkest 0.5th percentile is never mapped from deeper than this,
 * so art without true black is not over-stretched. */
const SCAN_BLACK_POINT_CAP = 40;

/** A scan's 99.5th percentile is never mapped from brighter than this, so
 * dark art without true white is not blown out. */
const SCAN_WHITE_POINT_FLOOR = 220;

/** Pixel box compatible with sharp's `extract`. */
export interface ScanCropBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Fraction of the box's crossing dimension a row/column must cover with card
 * pixels to count as a full card edge during tightening. High enough to cut
 * skew wedges (a 3px-tilted edge's transition rows sit around 80%), low
 * enough that the rounded-corner rows of a straight card (~92%) survive.
 */
const SCAN_EDGE_COVERAGE = 0.85;

/**
 * Find the card's bounding box in a greyscale scan by row/column projection:
 * a row or column counts as content only when it has enough dark pixels.
 * This replaces sharp's all-or-nothing `trim`, where a single dark dust
 * speck on the scanner glass pins the box and leaves a wide white margin.
 *
 * Each edge is then tightened inward to the first row/column that is mostly
 * (`SCAN_EDGE_COVERAGE`) card: cards never sit perfectly straight on the
 * glass, and a sub-degree tilt leaves a bright wedge a few px deep along one
 * half of an edge. Tightening is capped at ~0.7% of the dimension so a card
 * whose edge art is genuinely bright can't lose more than a sliver.
 *
 * Returns `null` when the scan holds no content or the buffer doesn't match
 * the given dimensions.
 */
function tightenForward(
  counts: number[],
  from: number,
  limit: number,
  minFull: number,
  maxSteps: number,
): number {
  let index = from;
  for (let steps = 0; steps < maxSteps && index < limit; steps++) {
    const count = counts[index];
    if (count === undefined || count >= minFull) {
      break;
    }
    index++;
  }
  return index;
}

function tightenBackward(
  counts: number[],
  from: number,
  limit: number,
  minFull: number,
  maxSteps: number,
): number {
  let index = from;
  for (let steps = 0; steps < maxSteps && index > limit; steps++) {
    const count = counts[index];
    if (count === undefined || count >= minFull) {
      break;
    }
    index--;
  }
  return index;
}

export function computeScanCropBox(
  grey: Uint8Array,
  width: number,
  height: number,
): ScanCropBox | null {
  if (width <= 0 || height <= 0 || grey.length < width * height) {
    return null;
  }
  // Dust specks are a handful of pixels; a card edge crosses ~75% of the
  // scan. 0.5% of the crossing dimension cleanly separates the two.
  const minRowDark = Math.max(4, Math.round(width * 0.005));
  const minColDark = Math.max(4, Math.round(height * 0.005));

  const rowCounts: number[] = Array.from({ length: height }, () => 0);
  const colCounts: number[] = Array.from({ length: width }, () => 0);
  for (let y = 0; y < height; y++) {
    const rowStart = y * width;
    let rowDark = 0;
    for (const [x, luminance] of grey.subarray(rowStart, rowStart + width).entries()) {
      if (luminance < SCAN_CONTENT_LUMINANCE) {
        rowDark++;
        colCounts[x] = (colCounts[x] ?? 0) + 1;
      }
    }
    rowCounts[y] = rowDark;
  }

  let top = rowCounts.findIndex((count) => count >= minRowDark);
  if (top === -1) {
    return null;
  }
  let bottom = rowCounts.findLastIndex((count) => count >= minRowDark);
  let left = colCounts.findIndex((count) => count >= minColDark);
  if (left === -1) {
    return null;
  }
  let right = colCounts.findLastIndex((count) => count >= minColDark);

  const boxWidth = right - left + 1;
  const boxHeight = bottom - top + 1;
  const minRowFull = Math.round(boxWidth * SCAN_EDGE_COVERAGE);
  const minColFull = Math.round(boxHeight * SCAN_EDGE_COVERAGE);
  const maxTightenY = Math.max(4, Math.round(boxHeight * 0.007));
  const maxTightenX = Math.max(4, Math.round(boxWidth * 0.007));
  top = tightenForward(rowCounts, top, bottom, minRowFull, maxTightenY);
  bottom = tightenBackward(rowCounts, bottom, top, minRowFull, maxTightenY);
  left = tightenForward(colCounts, left, right, minColFull, maxTightenX);
  right = tightenBackward(colCounts, right, left, minColFull, maxTightenX);
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/**
 * Scanners lift true black to ~15-40 and pull highlights down to ~230-250.
 * The stretch is capped so a well-exposed scan converges to a no-op, making re-running it safe.
 */
export function computeScanLevels(
  grey: Uint8Array,
  width: number,
  box: ScanCropBox,
): { multiply: number; offset: number } | null {
  const total = box.width * box.height;
  if (total <= 0 || grey.length < (box.top + box.height - 1) * width + box.left + box.width) {
    return null;
  }
  const hist: number[] = Array.from({ length: 256 }, () => 0);
  for (let y = box.top; y < box.top + box.height; y++) {
    const rowStart = y * width + box.left;
    for (const luminance of grey.subarray(rowStart, rowStart + box.width)) {
      hist[luminance] = (hist[luminance] ?? 0) + 1;
    }
  }
  const percentile = (p: number): number => {
    let acc = 0;
    for (const [luminance, count] of hist.entries()) {
      acc += count;
      if (acc / total >= p) {
        return luminance;
      }
    }
    return 255;
  };
  const black = Math.min(percentile(0.005), SCAN_BLACK_POINT_CAP);
  const white = Math.max(percentile(0.995), SCAN_WHITE_POINT_FLOOR);
  if ((black <= 0 && white >= 255) || white <= black) {
    return null;
  }
  const multiply = 255 / (white - black);
  return { multiply, offset: -black * multiply };
}
