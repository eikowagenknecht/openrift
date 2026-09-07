import { quadIou } from "./geometry";
import { boxBlurGray, downscaleGray } from "./image";
import type { CardCandidate, GrayImage, Point, Quad } from "./types";
import { CARD_ASPECT } from "./types";

export interface FitOptions {
  workingSize: number;
  scales: readonly number[];
  rotations: readonly number[];
  offsets: readonly number[];
  samplesPerEdge: number;
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
 * Fits a rectangle to edges: on a binder page, packed cards behind
 * plastic merge into one blob under any threshold.
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

function signedGradients(image: GrayImage): { gx: Float32Array; gy: Float32Array } {
  const { data, width: w, height: h } = image;
  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const tl = data[i - w - 1] ?? 0;
      const tc = data[i - w] ?? 0;
      const tr = data[i - w + 1] ?? 0;
      const ml = data[i - 1] ?? 0;
      const mr = data[i + 1] ?? 0;
      const bl = data[i + w - 1] ?? 0;
      const bc = data[i + w] ?? 0;
      const br = data[i + w + 1] ?? 0;
      gx[i] = tr + 2 * mr + br - (tl + 2 * ml + bl);
      gy[i] = bl + 2 * bc + br - (tl + 2 * tc + tr);
    }
  }
  return { gx, gy };
}

function averageMagnitude(gx: Float32Array, gy: Float32Array): number {
  let total = 0;
  for (let i = 0; i < gx.length; i++) {
    total += Math.abs(gx[i] ?? 0) + Math.abs(gy[i] ?? 0);
  }
  return total / gx.length;
}

/**
 * Averages only the gradient component perpendicular to each side: a plain
 * magnitude sum would reward a rectangle laid over busy card art, but only a
 * real border produces gradients that run across the line being tested.
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

  const edges: readonly (readonly [Point, Point])[] = [
    [quad[0], quad[1]],
    [quad[1], quad[2]],
    [quad[2], quad[3]],
    [quad[3], quad[0]],
  ];
  for (const [a, b] of edges) {
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const length = Math.hypot(ex, ey);
    if (length < 1) {
      continue;
    }
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
      let best = 0;
      for (let offset = -1; offset <= 1; offset++) {
        const sx = Math.round(px + nx * offset);
        const sy = Math.round(py + ny * offset);
        if (sx < 1 || sy < 1 || sx >= width - 1 || sy >= height - 1) {
          continue;
        }
        const i = sy * width + sx;
        const projected = Math.abs((gx[i] ?? 0) * nx + (gy[i] ?? 0) * ny);
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
