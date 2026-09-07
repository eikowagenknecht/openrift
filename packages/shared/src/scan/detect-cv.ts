import { canonicalizeQuad, refineQuad } from "./geometry";
import type { CardCandidate, GrayImage, Point, Quad } from "./types";
import { CARD_ASPECT } from "./types";

/** Typed structurally so this stays free of the OpenCV WASM import; the API server uses it too. */
export interface OpenCvLike {
  Mat: new (rows?: number, cols?: number, type?: number) => CvMat;
  MatVector: new () => CvMatVector;
  Size: new (width: number, height: number) => unknown;
  RotatedRect: { points: (rect: CvRotatedRect) => Point[] };
  CV_8UC1: number;
  COLOR_RGBA2GRAY: number;
  MORPH_RECT: number;
  MORPH_CLOSE: number;
  ADAPTIVE_THRESH_GAUSSIAN_C: number;
  THRESH_BINARY: number;
  THRESH_BINARY_INV: number;
  THRESH_OTSU: number;
  RETR_LIST: number;
  CHAIN_APPROX_SIMPLE: number;
  cvtColor: (src: CvMat, dst: CvMat, code: number) => void;
  resize: (src: CvMat, dst: CvMat, size: unknown) => void;
  medianBlur: (src: CvMat, dst: CvMat, ksize: number) => void;
  GaussianBlur: (src: CvMat, dst: CvMat, size: unknown, sigma: number) => void;
  adaptiveThreshold: (
    src: CvMat,
    dst: CvMat,
    maxValue: number,
    method: number,
    type: number,
    blockSize: number,
    c: number,
  ) => void;
  threshold: (src: CvMat, dst: CvMat, thresh: number, maxValue: number, type: number) => void;
  getStructuringElement: (shape: number, size: unknown) => CvMat;
  morphologyEx: (src: CvMat, dst: CvMat, op: number, kernel: CvMat) => void;
  findContours: (
    image: CvMat,
    contours: CvMatVector,
    hierarchy: CvMat,
    mode: number,
    method: number,
  ) => void;
  contourArea: (contour: CvMat) => number;
  minAreaRect: (contour: CvMat) => CvRotatedRect;
}

interface CvMat {
  rows: number;
  cols: number;
  data: Uint8Array;
  data32S: Int32Array;
  /** Frees the underlying WASM allocation. */
  delete: () => void;
}

interface CvMatVector {
  size: () => number;
  get: (index: number) => CvMat;
  /** Frees the underlying WASM allocation. */
  delete: () => void;
}

interface CvRotatedRect {
  center: { x: number; y: number };
  size: { width: number; height: number };
  angle: number;
}

export interface CvDetectOptions {
  workingSize: number;
  minAreaFraction: number;
  minFill: number;
  maxCandidates: number;
}

export const DEFAULT_CV_DETECT_OPTIONS: CvDetectOptions = {
  workingSize: 640,
  minAreaFraction: 0.015,
  minFill: 0.72,
  maxCandidates: 4,
};

/** Builds a binary image from grayscale; the caller owns and frees the result. */
type Recipe = (cv: OpenCvLike, gray: CvMat) => CvMat;

// No single threshold works on real footage: a card can be bright-on-dark or
// dark-on-light depending on the surface, sometimes within one clip.
const RECIPES: Recipe[] = [
  (cv, gray) => {
    const blurred = new cv.Mat();
    cv.medianBlur(gray, blurred, 5);
    const out = new cv.Mat();
    cv.adaptiveThreshold(
      blurred,
      out,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY,
      51,
      -8,
    );
    close(cv, out, 7);
    blurred.delete();
    return out;
  },
  (cv, gray) => {
    const blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(7, 7), 0);
    const out = new cv.Mat();
    cv.threshold(blurred, out, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
    close(cv, out, 7);
    blurred.delete();
    return out;
  },
  (cv, gray) => {
    const blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(7, 7), 0);
    const out = new cv.Mat();
    cv.threshold(blurred, out, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    close(cv, out, 7);
    blurred.delete();
    return out;
  },
];

function close(cv: OpenCvLike, mat: CvMat, size: number): void {
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(size, size));
  cv.morphologyEx(mat, mat, cv.MORPH_CLOSE, kernel);
  kernel.delete();
}

// Counterpart to fitCardRects: finds cards physically separate from their
// neighbours at any rotation, where a centre-anchored search is weakest.
export function detectCardsWithCv(
  cv: OpenCvLike,
  frame: GrayImage,
  options: Partial<CvDetectOptions> = {},
): CardCandidate[] {
  const opts = { ...DEFAULT_CV_DETECT_OPTIONS, ...options };
  const scale = Math.min(1, opts.workingSize / Math.max(frame.width, frame.height));
  const targetW = Math.round(frame.width * scale);
  const targetH = Math.round(frame.height * scale);

  const source = new cv.Mat(frame.height, frame.width, cv.CV_8UC1);
  source.data.set(frame.data);
  const work = new cv.Mat();
  cv.resize(source, work, new cv.Size(targetW, targetH));

  const frameArea = targetW * targetH;
  const centreX = targetW / 2;
  const centreY = targetH / 2;
  const halfDiagonal = Math.hypot(targetW, targetH) / 2;
  const targetAspect = 1 / CARD_ASPECT;
  const found: CardCandidate[] = [];

  for (const recipe of RECIPES) {
    const binary = recipe(cv, work);
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(binary, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const contourArea = cv.contourArea(contour);
      if (contourArea < frameArea * opts.minAreaFraction) {
        contour.delete();
        continue;
      }

      const rect = cv.minAreaRect(contour);
      const rectArea = rect.size.width * rect.size.height;
      if (rectArea <= 0) {
        contour.delete();
        continue;
      }
      const aspect =
        Math.max(rect.size.width, rect.size.height) /
        Math.max(1e-6, Math.min(rect.size.width, rect.size.height));
      if (aspect < 1.15 || aspect > 1.8) {
        contour.delete();
        continue;
      }
      const fill = contourArea / rectArea;
      if (fill < opts.minFill) {
        contour.delete();
        continue;
      }

      const contourPoints: Point[] = [];
      for (let p = 0; p + 1 < contour.data32S.length; p += 2) {
        contourPoints.push({ x: contour.data32S[p] ?? 0, y: contour.data32S[p + 1] ?? 0 });
      }
      const box = cv.RotatedRect.points(rect).map((p) => ({ x: p.x, y: p.y }));
      const rough = canonicalizeQuad(box as unknown as Quad);
      const refined = canonicalizeQuad(refineQuad(rough, contourPoints));

      const centreScore = Math.max(
        0,
        1 - Math.hypot(rect.center.x - centreX, rect.center.y - centreY) / halfDiagonal,
      );
      const areaFraction = rectArea / frameArea;
      const aspectScore = Math.exp(-(((aspect - targetAspect) / 0.45) ** 2));

      found.push({
        quad: refined.map((p) => ({ x: p.x / scale, y: p.y / scale })) as unknown as Quad,
        aspect,
        areaFraction,
        rectangularity: fill,
        score:
          centreScore ** 2 * aspectScore * fill * (0.4 + 0.6 * Math.min(1, areaFraction / 0.4)),
      });
      contour.delete();
    }

    binary.delete();
    contours.delete();
    hierarchy.delete();
  }

  source.delete();
  work.delete();

  return found.toSorted((a, b) => b.score - a.score).slice(0, opts.maxCandidates);
}
