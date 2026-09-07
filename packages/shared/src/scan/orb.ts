/**
 * ORB feature verification: the pipeline's precision stage, confirming a
 * geometrically consistent match beyond the embedding's appearance ranking.
 * OpenCV is injected structurally so this package doesn't depend on the
 * 10 MB WASM build.
 */
import { artWindowRect } from "./art-window";
import type { RgbaImage } from "./types";

interface OrbMat {
  data: { set: (values: ArrayLike<number>) => void } & Uint8Array;
  rows: number;
  roi: (rect: unknown) => OrbMat;
  setTo: (value: unknown) => void;
  empty: () => boolean;
  delete: () => void;
}

interface OrbKeypointVector {
  get: (index: number) => { pt: { x: number; y: number } };
  delete: () => void;
}

interface OrbMatchPair {
  size: () => number;
  get: (index: number) => { distance: number; queryIdx: number; trainIdx: number };
  delete: () => void;
}

/** The slice of OpenCV that feature verification needs. */
export interface OrbCvLike {
  Mat: (new (rows?: number, cols?: number, type?: number) => OrbMat) & {
    zeros: (rows: number, cols: number, type: number) => OrbMat;
  };
  ORB: new (maxFeatures: number) => {
    detectAndCompute: (
      image: OrbMat,
      mask: OrbMat,
      keypoints: OrbKeypointVector,
      descriptors: OrbMat,
    ) => void;
    delete: () => void;
  };
  KeyPointVector: new () => OrbKeypointVector;
  BFMatcher: new (
    norm: number,
    crossCheck: boolean,
  ) => {
    knnMatch: (query: OrbMat, train: OrbMat, out: unknown, k: number) => void;
    delete: () => void;
  };
  DMatchVectorVector: new () => {
    size: () => number;
    get: (index: number) => OrbMatchPair;
    delete: () => void;
  };
  Rect: new (x: number, y: number, width: number, height: number) => unknown;
  Scalar: new (value: number) => unknown;
  matFromArray: (rows: number, cols: number, type: number, values: number[]) => OrbMat;
  findHomography: (
    source: OrbMat,
    destination: OrbMat,
    method: number,
    threshold: number,
    mask: OrbMat,
  ) => OrbMat;
  cvtColor: (src: OrbMat, dst: OrbMat, code: number) => void;
  equalizeHist: (src: OrbMat, dst: OrbMat) => void;
  CV_8UC4: number;
  CV_8UC1: number;
  CV_32FC2: number;
  COLOR_RGBA2GRAY: number;
  NORM_HAMMING: number;
  RANSAC: number;
}

export interface OrbVerdict {
  matched: number;
  inliers: number;
  ratio: number;
}

export interface OrbFeatures {
  keypoints: OrbKeypointVector;
  descriptors: OrbMat;
}

/**
 * With `artOnly`, features are only detected inside the art window: card
 * frames are pixel-identical across the catalogue, so unmasked frame
 * keypoints can support a homography against the wrong card.
 */
export function describeOrb(
  cv: OrbCvLike,
  image: RgbaImage,
  maxFeatures = 700,
  artOnly = false,
): OrbFeatures {
  const mat = new cv.Mat(image.height, image.width, cv.CV_8UC4);
  mat.data.set(image.data);
  const gray = new cv.Mat();
  cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
  // Mild equalisation: a photo through plastic loses local contrast that the
  // reference render still has, and ORB keys off exactly that.
  cv.equalizeHist(gray, gray);

  const orb = new cv.ORB(maxFeatures);
  const keypoints = new cv.KeyPointVector();
  const descriptors = new cv.Mat();
  const mask = artOnly ? cv.Mat.zeros(image.height, image.width, cv.CV_8UC1) : new cv.Mat();
  if (artOnly) {
    const rect = artWindowRect(image.width, image.height);
    const view = mask.roi(new cv.Rect(rect.x, rect.y, rect.width, rect.height));
    view.setTo(new cv.Scalar(255));
    view.delete();
  }
  orb.detectAndCompute(gray, mask, keypoints, descriptors);

  mat.delete();
  gray.delete();
  mask.delete();
  orb.delete();
  return { keypoints, descriptors };
}

export function releaseOrb(features: OrbFeatures): void {
  features.keypoints.delete();
  features.descriptors.delete();
}

export function verifyOrb(cv: OrbCvLike, query: OrbFeatures, reference: OrbFeatures): OrbVerdict {
  if (query.descriptors.rows < 8 || reference.descriptors.rows < 8) {
    return { matched: 0, inliers: 0, ratio: 0 };
  }

  const matcher = new cv.BFMatcher(cv.NORM_HAMMING, false);
  const knn = new cv.DMatchVectorVector();
  matcher.knnMatch(query.descriptors, reference.descriptors, knn, 2);

  const queryPoints: number[] = [];
  const referencePoints: number[] = [];
  for (let i = 0; i < knn.size(); i++) {
    const pair = knn.get(i);
    if (pair.size() < 2) {
      pair.delete();
      continue;
    }
    const a = pair.get(0);
    const b = pair.get(1);
    // Lowe's ratio test: keep only correspondences clearly better than the
    // next-best match, discarding repetitive frame elements every card shares.
    if (a.distance < 0.75 * b.distance) {
      const qp = query.keypoints.get(a.queryIdx).pt;
      const rp = reference.keypoints.get(a.trainIdx).pt;
      queryPoints.push(qp.x, qp.y);
      referencePoints.push(rp.x, rp.y);
    }
    pair.delete();
  }
  knn.delete();
  matcher.delete();

  const matched = queryPoints.length / 2;
  if (matched < 8) {
    return { matched, inliers: 0, ratio: 0 };
  }

  const srcMat = cv.matFromArray(matched, 1, cv.CV_32FC2, queryPoints);
  const dstMat = cv.matFromArray(matched, 1, cv.CV_32FC2, referencePoints);
  const inlierMask = new cv.Mat();
  const homography = cv.findHomography(srcMat, dstMat, cv.RANSAC, 5, inlierMask);

  let inliers = 0;
  if (!homography.empty()) {
    for (let i = 0; i < inlierMask.rows; i++) {
      if (inlierMask.data[i] !== 0) {
        inliers++;
      }
    }
  }

  srcMat.delete();
  dstMat.delete();
  inlierMask.delete();
  homography.delete();

  return { matched, inliers, ratio: matched === 0 ? 0 : inliers / matched };
}
