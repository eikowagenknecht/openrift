import type { GrayImage, RgbaImage } from "./types";

/** Convert packed RGBA to single-channel luma (ITU-R BT.601 weights). */
export function toGray(src: RgbaImage): GrayImage {
  const { data, width, height } = src;
  const out = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    const r = data[p] ?? 0;
    const g = data[p + 1] ?? 0;
    const b = data[p + 2] ?? 0;
    out[i] = (r * 77 + g * 150 + b * 29) >> 8;
  }
  return { data: out, width, height };
}

/**
 * Area-average downscale: every source pixel contributes to exactly one
 * destination bin, which avoids the aliasing nearest-neighbour would add.
 */
export function downscaleGray(src: GrayImage, dstW: number, dstH: number): GrayImage {
  if (dstW === src.width && dstH === src.height) {
    return { data: Uint8Array.from(src.data), width: dstW, height: dstH };
  }
  const sums = new Float64Array(dstW * dstH);
  const counts = new Uint32Array(dstW * dstH);
  const xMap = new Uint32Array(src.width);
  for (let x = 0; x < src.width; x++) {
    xMap[x] = Math.min(dstW - 1, Math.floor((x * dstW) / src.width));
  }
  for (let y = 0; y < src.height; y++) {
    const dy = Math.min(dstH - 1, Math.floor((y * dstH) / src.height));
    const srcRow = y * src.width;
    const dstRow = dy * dstW;
    for (let x = 0; x < src.width; x++) {
      const idx = dstRow + (xMap[x] ?? 0);
      sums[idx] = (sums[idx] ?? 0) + (src.data[srcRow + x] ?? 0);
      counts[idx] = (counts[idx] ?? 0) + 1;
    }
  }
  const out = new Uint8Array(dstW * dstH);
  for (let i = 0; i < out.length; i++) {
    const count = counts[i] ?? 0;
    out[i] = count === 0 ? 0 : Math.round((sums[i] ?? 0) / count);
  }
  return { data: out, width: dstW, height: dstH };
}

/** Separable box blur with running sums, so cost is independent of radius. */
export function boxBlurGray(src: GrayImage, radius: number): GrayImage {
  if (radius <= 0) {
    return { data: Uint8Array.from(src.data), width: src.width, height: src.height };
  }
  const { width: w, height: h } = src;
  const window = radius * 2 + 1;
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = (src.data[row] ?? 0) * (radius + 1);
    for (let x = 1; x <= radius; x++) {
      sum += src.data[row + Math.min(x, w - 1)] ?? 0;
    }
    for (let x = 0; x < w; x++) {
      tmp[row + x] = Math.round(sum / window);
      sum += src.data[row + Math.min(x + radius + 1, w - 1)] ?? 0;
      sum -= src.data[row + Math.max(x - radius, 0)] ?? 0;
    }
  }

  for (let x = 0; x < w; x++) {
    let sum = (tmp[x] ?? 0) * (radius + 1);
    for (let y = 1; y <= radius; y++) {
      sum += tmp[Math.min(y, h - 1) * w + x] ?? 0;
    }
    for (let y = 0; y < h; y++) {
      out[y * w + x] = Math.round(sum / window);
      sum += tmp[Math.min(y + radius + 1, h - 1) * w + x] ?? 0;
      sum -= tmp[Math.max(y - radius, 0) * w + x] ?? 0;
    }
  }

  return { data: out, width: w, height: h };
}

/** Variance of the Laplacian: higher means sharper, near-zero for a blurred frame. */
export function focusScore(src: GrayImage): number {
  const { data, width: w, height: h } = src;
  if (w < 3 || h < 3) {
    return 0;
  }
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap =
        4 * (data[i] ?? 0) -
        (data[i - 1] ?? 0) -
        (data[i + 1] ?? 0) -
        (data[i - w] ?? 0) -
        (data[i + w] ?? 0);
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export function rotateRgbaCw(src: RgbaImage): RgbaImage {
  const { width, height, data } = src;
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const target = height - 1 - y;
    for (let x = 0; x < width; x++) {
      const from = (y * width + x) * 4;
      const to = (x * height + target) * 4;
      out[to] = data[from] ?? 0;
      out[to + 1] = data[from + 1] ?? 0;
      out[to + 2] = data[from + 2] ?? 0;
      out[to + 3] = data[from + 3] ?? 0;
    }
  }
  return { data: out, width: height, height: width };
}
