import { quadIou } from "./geometry";
import { boxBlurGray, downscaleGray } from "./image";
import type { CardCandidate, GrayImage, Point, Quad } from "./types";
import { CARD_ASPECT } from "./types";

export interface FitOptions {
  /** Long side of the frame the search runs on. */
  workingSize: number;
  /** Card long-side lengths to try, as a fraction of the frame's short side. */
  scales: readonly number[];
  /** Rotations to try, in degrees. */
  rotations: readonly number[];
  /** Centre offsets to try, as a fraction of the frame size. */
  offsets: readonly number[];
  /** Samples taken along each of the four edges. */
  samplesPerEdge: number;
  /** How many candidates to return after suppression. */
  maxCandidates: number;
}

export const DEFAULT_FIT_OPTIONS: FitOptions = {
  workingSize: 320,
  scales: [0.42, 0.52, 0.62, 0.72, 0.82, 0.92, 1.02],
  rotations: [-14, -7, 0, 7, 14],
  offsets: [-0.14, 0, 0.14],
  samplesPerEdge: 28,
  maxCandidates: 3,
};

/**
 * Find the card the camera is aimed at by fitting a rectangle to the edges,
 * without segmenting anything.
 *
 * Contour finding needs a card to be separable from its surroundings, which is
 * exactly what a binder page denies: the cards are packed edge to edge behind
 * plastic, so their outlines merge into one blob and no threshold pulls them
 * apart. This takes the opposite approach. A card is a rectangle of known
 * proportions, so the search enumerates rectangles directly and scores each by
 * how much edge energy lies along its perimeter, oriented the right way. A
 * neighbouring card contributes nothing to that score unless it happens to sit
 * exactly where a card-shaped border would be.
 *
 * @returns Candidates in the input frame's coordinates, best first.
 */
export function fitCardRects(frame: GrayImage, options: Partial<FitOptions> = {}): CardCandidate[] {
  const opts = { ...DEFAULT_FIT_OPTIONS, ...options };
  const scale = Math.min(1, opts.workingSize / Math.max(frame.width, frame.height));
  const width = Math.max(8, Math.round(frame.width * scale));
  const height = Math.max(8, Math.round(frame.height * scale));
  const small = boxBlurGray(downscaleGray(frame, width, height), 1);

  const { gx, gy } = signedGradients(small);
  const meanEnergy = averageMagnitude(gx, gy);
  if (meanEnergy <= 0) {
    return [];
  }

  const shortSide = Math.min(width, height);
  const centreX = width / 2;
  const centreY = height / 2;
  const scored: CardCandidate[] = [];

  for (const longSide of opts.scales.map((s) => s * shortSide)) {
    const cardShort = longSide * CARD_ASPECT;
    if (longSide < 24 || cardShort < 16) {
      continue;
    }
    for (const degrees of opts.rotations) {
      const radians = (degrees * Math.PI) / 180;
      for (const dx of opts.offsets) {
        for (const dy of opts.offsets) {
          const centre = { x: centreX + dx * width, y: centreY + dy * height };
          // Portrait and landscape are the same physical card, so both go in
          // the pool and the matcher decides which way round it is.
          for (const portrait of [true, false]) {
            const w = portrait ? cardShort : longSide;
            const h = portrait ? longSide : cardShort;
            const quad = rectQuad(centre, w, h, radians);
            if (!withinFrame(quad, width, height)) {
              continue;
            }
            const support = perimeterSupport(quad, gx, gy, width, height, opts.samplesPerEdge);
            scored.push({
              quad,
              aspect: Math.max(w, h) / Math.min(w, h),
              areaFraction: (w * h) / (width * height),
              rectangularity: 1,
              score: support / meanEnergy,
            });
          }
        }
      }
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const kept: CardCandidate[] = [];
  for (const candidate of scored) {
    if (kept.some((other) => quadIou(candidate.quad, other.quad) > 0.5)) {
      continue;
    }
    kept.push({
      ...candidate,
      quad: candidate.quad.map((p) => ({ x: p.x / scale, y: p.y / scale })) as unknown as Quad,
    });
    if (kept.length >= opts.maxCandidates) {
      break;
    }
  }
  return kept;
}

function rectQuad(centre: Point, w: number, h: number, radians: number): Quad {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const corners: Point[] = [
    { x: -w / 2, y: -h / 2 },
    { x: w / 2, y: -h / 2 },
    { x: w / 2, y: h / 2 },
    { x: -w / 2, y: h / 2 },
  ];
  return corners.map((p) => ({
    x: centre.x + p.x * cos - p.y * sin,
    y: centre.y + p.x * sin + p.y * cos,
  })) as unknown as Quad;
}

function withinFrame(quad: Quad, width: number, height: number): boolean {
  return quad.every((p) => p.x >= -2 && p.y >= -2 && p.x <= width + 2 && p.y <= height + 2);
}

/**
 * Separate horizontal and vertical Sobel responses, keeping their sign.
 *
 * @returns The two gradient components, one value per pixel.
 */
function signedGradients(image: GrayImage): { gx: Float32Array; gy: Float32Array } {
  const { data, width: w, height: h } = image;
  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const tl = data[i - w - 1];
      const tc = data[i - w];
      const tr = data[i - w + 1];
      const ml = data[i - 1];
      const mr = data[i + 1];
      const bl = data[i + w - 1];
      const bc = data[i + w];
      const br = data[i + w + 1];
      gx[i] = tr + 2 * mr + br - (tl + 2 * ml + bl);
      gy[i] = bl + 2 * bc + br - (tl + 2 * tc + tr);
    }
  }
  return { gx, gy };
}

function averageMagnitude(gx: Float32Array, gy: Float32Array): number {
  let total = 0;
  for (let i = 0; i < gx.length; i++) {
    total += Math.abs(gx[i]) + Math.abs(gy[i]);
  }
  return total / gx.length;
}

/**
 * Average edge energy along a rectangle's perimeter, counting only the
 * gradient component perpendicular to each side.
 *
 * The projection is what makes this discriminating. Card art is full of strong
 * edges, and a plain magnitude sum would happily reward a rectangle laid over a
 * busy illustration. Only a real border produces gradients that run across the
 * line being tested.
 *
 * @returns Mean perpendicular gradient magnitude over all samples.
 */
function perimeterSupport(
  quad: Quad,
  gx: Float32Array,
  gy: Float32Array,
  width: number,
  height: number,
  samplesPerEdge: number,
): number {
  let total = 0;
  let count = 0;

  for (let edge = 0; edge < 4; edge++) {
    const a = quad[edge];
    const b = quad[(edge + 1) % 4];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const length = Math.hypot(ex, ey);
    if (length < 1) {
      continue;
    }
    // Unit normal of this edge; the gradient is projected onto it.
    const nx = -ey / length;
    const ny = ex / length;

    for (let s = 0; s < samplesPerEdge; s++) {
      const t = (s + 0.5) / samplesPerEdge;
      const px = a.x + ex * t;
      const py = a.y + ey * t;
      const x = Math.round(px);
      const y = Math.round(py);
      if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) {
        continue;
      }
      // Take the strongest response within a pixel either side, so a border
      // that sits slightly off the hypothesised line still counts.
      let best = 0;
      for (let offset = -1; offset <= 1; offset++) {
        const sx = Math.round(px + nx * offset);
        const sy = Math.round(py + ny * offset);
        if (sx < 1 || sy < 1 || sx >= width - 1 || sy >= height - 1) {
          continue;
        }
        const i = sy * width + sx;
        const projected = Math.abs(gx[i] * nx + gy[i] * ny);
        if (projected > best) {
          best = projected;
        }
      }
      total += best;
      count++;
    }
  }

  return count === 0 ? 0 : total / count;
}
