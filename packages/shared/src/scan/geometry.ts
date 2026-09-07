import type { Matrix3, Point, Quad } from "./types";

interface Line {
  px: number;
  py: number;
  dx: number;
  dy: number;
}

/** Total-least-squares line fit: stable for near-vertical edges, unlike ordinary least squares. */
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
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const dx = Math.cos(theta);
  const dy = Math.sin(theta);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
    return null;
  }
  return { px: mx, py: my, dx, dy };
}

interface Edge {
  a: Point;
  b: Point;
  votes: Point[];
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
 * Snap an approximate quad onto the contour's straight edges, refitting each
 * side and taking corners as intersections of neighbouring sides.
 */
export function refineQuad(quad: Quad, contour: readonly Point[]): Quad {
  const edges: [Edge, Edge, Edge, Edge] = [
    { a: quad[0], b: quad[1], votes: [] },
    { a: quad[1], b: quad[2], votes: [] },
    { a: quad[2], b: quad[3], votes: [] },
    { a: quad[3], b: quad[0], votes: [] },
  ];
  const diagonal = quadDiagonal(quad);
  // Only points hugging the outline may vote. Edge pixels from the card's own
  // artwork sit well inside it and would drag the fitted sides inwards.
  const maxDist = 0.04 * diagonal;
  for (const p of contour) {
    let bestVotes: Point[] | null = null;
    let bestDist = Infinity;
    let bestT = 0;
    for (const { a, b, votes } of edges) {
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
        bestVotes = votes;
        bestT = clamped;
      }
    }
    // Skip the corner zones, where the card's rounded profile curves away from
    // the straight edge and would bias the fit inwards.
    if (bestVotes && bestDist <= maxDist && bestT > 0.12 && bestT < 0.88) {
      bestVotes.push(p);
    }
  }

  const fit = (votes: readonly Point[]): Line | null => (votes.length >= 6 ? fitLine(votes) : null);
  const sides: [Line | null, Line | null, Line | null, Line | null] = [
    fit(edges[0].votes),
    fit(edges[1].votes),
    fit(edges[2].votes),
    fit(edges[3].votes),
  ];

  // A refined corner should stay near the approximate one; a wild
  // intersection means the sides were near-parallel and cannot be trusted.
  const corner = (prev: Line | null, cur: Line | null, approximate: Point): Point | null => {
    if (!prev || !cur) {
      return null;
    }
    const hit = intersectLines(prev, cur);
    if (!hit) {
      return null;
    }
    return Math.hypot(hit.x - approximate.x, hit.y - approximate.y) > 0.25 * diagonal ? null : hit;
  };
  const c0 = corner(sides[3], sides[0], quad[0]);
  const c1 = corner(sides[0], sides[1], quad[1]);
  const c2 = corner(sides[1], sides[2], quad[2]);
  const c3 = corner(sides[2], sides[3], quad[3]);
  if (!c0 || !c1 || !c2 || !c3) {
    return quad;
  }
  return [c0, c1, c2, c3];
}

function quadDiagonal(quad: Quad): number {
  return Math.max(
    Math.hypot(quad[2].x - quad[0].x, quad[2].y - quad[0].y),
    Math.hypot(quad[3].x - quad[1].x, quad[3].y - quad[1].y),
  );
}

/**
 * Put a quad into canonical order: clockwise, starting on a short side, so the
 * card's long axis lands vertically. Leaves a 180-degree ambiguity for the
 * matcher to resolve by scoring both.
 */
export function canonicalizeQuad(quad: Quad): Quad {
  const cx = (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4;
  const cy = (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4;
  const ordered: [Point, Point, Point, Point] = [quad[0], quad[1], quad[2], quad[3]];
  ordered.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));

  const side = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);
  const pairA = side(ordered[0], ordered[1]) + side(ordered[2], ordered[3]);
  const pairB = side(ordered[1], ordered[2]) + side(ordered[3], ordered[0]);
  if (pairA <= pairB) {
    return ordered;
  }
  return [ordered[1], ordered[2], ordered[3], ordered[0]];
}

/** Direct linear transform for four point correspondences, with h33 pinned to 1. */
export function computeHomography(from: Quad, to: Quad): Matrix3 | null {
  const pairs: readonly (readonly [Point, Point])[] = [
    [from[0], to[0]],
    [from[1], to[1]],
    [from[2], to[2]],
    [from[3], to[3]],
  ];
  const augmented: number[][] = [];
  for (const [source, target] of pairs) {
    const { x, y } = source;
    const { x: u, y: v } = target;
    augmented.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u], [0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  const h = solveLinearSystem(augmented);
  if (!h) {
    return null;
  }
  const [h0, h1, h2, h3, h4, h5, h6, h7] = h;
  if (
    h0 === undefined ||
    h1 === undefined ||
    h2 === undefined ||
    h3 === undefined ||
    h4 === undefined ||
    h5 === undefined ||
    h6 === undefined ||
    h7 === undefined
  ) {
    return null;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7, 1];
}

/** Gauss-Jordan on an n-by-(n+1) augmented matrix, mutated in place. */
function solveLinearSystem(m: number[][]): number[] | null {
  const n = m.length;

  for (let col = 0; col < n; col++) {
    let pivot = col;
    let pivotMagnitude = Math.abs(m[col]?.[col] ?? 0);
    for (let row = col + 1; row < n; row++) {
      const magnitude = Math.abs(m[row]?.[col] ?? 0);
      if (magnitude > pivotMagnitude) {
        pivot = row;
        pivotMagnitude = magnitude;
      }
    }
    if (pivotMagnitude < 1e-10) {
      return null;
    }
    const head = m[col];
    const pivotRow = m[pivot];
    if (!head || !pivotRow) {
      return null;
    }
    m[col] = pivotRow;
    m[pivot] = head;
    const pivotValue = pivotRow[col];
    if (pivotValue === undefined) {
      return null;
    }
    for (const [row, target] of m.entries()) {
      if (row === col) {
        continue;
      }
      const leading = target[col];
      if (leading === undefined) {
        return null;
      }
      const factor = leading / pivotValue;
      if (factor === 0) {
        continue;
      }
      for (let k = col; k <= n; k++) {
        const value = target[k];
        const above = pivotRow[k];
        if (value === undefined || above === undefined) {
          return null;
        }
        target[k] = value - factor * above;
      }
    }
  }

  const solution: number[] = [];
  for (const [i, row] of m.entries()) {
    const rhs = row[n];
    const diagonal = row[i];
    if (rhs === undefined || diagonal === undefined) {
      return null;
    }
    solution.push(rhs / diagonal);
  }
  return solution;
}

export function applyHomography(h: Matrix3, p: Point): Point {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  return {
    x: (h[0] * p.x + h[1] * p.y + h[2]) / w,
    y: (h[3] * p.x + h[4] * p.y + h[5]) / w,
  };
}

/** Intersection-over-union of two quads, approximated on their axis-aligned bounding boxes. */
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
