import type { Matrix3, Point, Quad } from "./types";

interface Line {
  /** A point on the line. */
  px: number;
  py: number;
  /** Unit direction vector. */
  dx: number;
  dy: number;
}

/**
 * Total-least-squares line fit, which unlike an ordinary least-squares fit is
 * stable for near-vertical edges.
 *
 * @returns The fitted line, or null when the points are too few or degenerate.
 */
function fitLine(points: readonly Point[]): Line | null {
  if (points.length < 2) {
    return null;
  }
  let mx = 0;
  let my = 0;
  for (const p of points) {
    mx += p.x;
    my += p.y;
  }
  mx /= points.length;
  my /= points.length;

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of points) {
    const dx = p.x - mx;
    const dy = p.y - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  // Principal eigenvector of the 2x2 covariance matrix.
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const dx = Math.cos(theta);
  const dy = Math.sin(theta);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
    return null;
  }
  return { px: mx, py: my, dx, dy };
}

function intersectLines(a: Line, b: Line): Point | null {
  const denom = a.dx * b.dy - a.dy * b.dx;
  if (Math.abs(denom) < 1e-9) {
    return null;
  }
  const t = ((b.px - a.px) * b.dy - (b.py - a.py) * b.dx) / denom;
  return { x: a.px + a.dx * t, y: a.py + a.dy * t };
}

/**
 * Snap an approximate quad onto the contour's straight edges. Each side is
 * re-fitted from the contour points that lie along it, ignoring the rounded
 * corner zones, and the corners are then taken as the intersections of
 * neighbouring sides. This is worth doing: at typical framing a card's corner
 * radius is a dozen pixels, and feeding that error into the unwarp smears the
 * whole descriptor.
 *
 * @returns The refined quad, or the input quad when a side could not be fitted.
 */
export function refineQuad(quad: Quad, contour: readonly Point[]): Quad {
  const buckets: Point[][] = [[], [], [], []];
  // Only points hugging the outline may vote. Edge pixels from the card's own
  // artwork sit well inside it and would drag the fitted sides inwards.
  const maxDist = 0.04 * quadDiagonal(quad);
  for (const p of contour) {
    let bestEdge = -1;
    let bestDist = Infinity;
    let bestT = 0;
    for (let e = 0; e < 4; e++) {
      const a = quad[e];
      const b = quad[(e + 1) % 4];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq === 0) {
        continue;
      }
      const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
      const clamped = Math.max(0, Math.min(1, t));
      const cx = a.x + dx * clamped;
      const cy = a.y + dy * clamped;
      const dist = Math.hypot(p.x - cx, p.y - cy);
      if (dist < bestDist) {
        bestDist = dist;
        bestEdge = e;
        bestT = clamped;
      }
    }
    // Skip the corner zones, where the card's rounded profile curves away from
    // the straight edge and would bias the fit inwards.
    if (bestEdge >= 0 && bestDist <= maxDist && bestT > 0.12 && bestT < 0.88) {
      buckets[bestEdge].push(p);
    }
  }

  const lines: (Line | null)[] = buckets.map((pts) => (pts.length >= 6 ? fitLine(pts) : null));
  if (lines.some((l) => l === null)) {
    return quad;
  }

  const corners: Point[] = [];
  for (let i = 0; i < 4; i++) {
    const prev = lines[(i + 3) % 4];
    const cur = lines[i];
    if (!prev || !cur) {
      return quad;
    }
    const hit = intersectLines(prev, cur);
    if (!hit) {
      return quad;
    }
    // A refined corner should stay near the approximate one; a wild
    // intersection means the sides were near-parallel and cannot be trusted.
    if (Math.hypot(hit.x - quad[i].x, hit.y - quad[i].y) > 0.25 * quadDiagonal(quad)) {
      return quad;
    }
    corners.push(hit);
  }
  return [corners[0], corners[1], corners[2], corners[3]];
}

function quadDiagonal(quad: Quad): number {
  return Math.max(
    Math.hypot(quad[2].x - quad[0].x, quad[2].y - quad[0].y),
    Math.hypot(quad[3].x - quad[1].x, quad[3].y - quad[1].y),
  );
}

/**
 * Put a quad into canonical order: clockwise in image space, starting on a
 * short side, so that mapping it to an upright rectangle always lands the
 * card's long axis vertically. Only a 180-degree ambiguity is left, which the
 * matcher resolves by scoring both.
 *
 * @returns The reordered quad.
 */
export function canonicalizeQuad(quad: Quad): Quad {
  const cx = (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4;
  const cy = (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4;
  const byAngle = [...quad].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
  );
  const ordered = byAngle as unknown as Quad;

  const side = (i: number): number =>
    Math.hypot(ordered[(i + 1) % 4].x - ordered[i].x, ordered[(i + 1) % 4].y - ordered[i].y);
  const pairA = side(0) + side(2);
  const pairB = side(1) + side(3);
  if (pairA <= pairB) {
    return ordered;
  }
  return [ordered[1], ordered[2], ordered[3], ordered[0]];
}

/**
 * Direct linear transform for four point correspondences, with h33 pinned to 1.
 *
 * @returns The 3x3 homography mapping `from` onto `to`, or null if degenerate.
 */
export function computeHomography(from: Quad, to: Quad): Matrix3 | null {
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solveLinearSystem(a, b);
  if (!h) {
    return null;
  }
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

/**
 * Gaussian elimination with partial pivoting.
 *
 * @returns The solution vector, or null when the matrix is singular.
 */
function solveLinearSystem(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) {
        pivot = row;
      }
    }
    if (Math.abs(m[pivot][col]) < 1e-10) {
      return null;
    }
    [m[col], m[pivot]] = [m[pivot], m[col]];
    const pivotValue = m[col][col];
    for (let row = 0; row < n; row++) {
      if (row === col) {
        continue;
      }
      const factor = m[row][col] / pivotValue;
      if (factor === 0) {
        continue;
      }
      for (let k = col; k <= n; k++) {
        m[row][k] -= factor * m[col][k];
      }
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

/**
 * Apply a homography to a point.
 *
 * @returns The transformed point.
 */
export function applyHomography(h: Matrix3, p: Point): Point {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  return {
    x: (h[0] * p.x + h[1] * p.y + h[2]) / w,
    y: (h[3] * p.x + h[4] * p.y + h[5]) / w,
  };
}

/**
 * Intersection-over-union of two quads, approximated on their axis-aligned
 * bounding boxes. Good enough to decide whether two detections across
 * consecutive video frames are the same physical card.
 *
 * @returns A value in [0, 1].
 */
export function quadIou(a: Quad, b: Quad): number {
  const boxA = boundingBox(a);
  const boxB = boundingBox(b);
  const x1 = Math.max(boxA.minX, boxB.minX);
  const y1 = Math.max(boxA.minY, boxB.minY);
  const x2 = Math.min(boxA.maxX, boxB.maxX);
  const y2 = Math.min(boxA.maxY, boxB.maxY);
  if (x2 <= x1 || y2 <= y1) {
    return 0;
  }
  const overlap = (x2 - x1) * (y2 - y1);
  const areaA = (boxA.maxX - boxA.minX) * (boxA.maxY - boxA.minY);
  const areaB = (boxB.maxX - boxB.minX) * (boxB.maxY - boxB.minY);
  return overlap / (areaA + areaB - overlap);
}

/**
 * Axis-aligned bounds of a quad.
 *
 * @returns The bounding box.
 */
export function boundingBox(quad: Quad): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of quad) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}
