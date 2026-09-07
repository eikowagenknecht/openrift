import { applyHomography, computeHomography } from "./geometry";
import type { Quad, RgbaImage } from "./types";

/**
 * Rectify a detected card into an upright canonical image.
 *
 * The quad is expected in the order {@link canonicalizeQuad} produces, so its
 * first edge is a short side and the result always comes out portrait. Whether
 * the card is actually the right way up, or is a landscape battlefield, is left
 * to the matcher, which tests all four rotations at negligible cost.
 */
export function unwarpCard(
  frame: RgbaImage,
  quad: Quad,
  outWidth: number,
  outHeight: number,
  padding = 0,
): RgbaImage | null {
  const padX = outWidth * padding;
  const padY = outHeight * padding;
  const canonical: Quad = [
    { x: -padX, y: -padY },
    { x: outWidth + padX, y: -padY },
    { x: outWidth + padX, y: outHeight + padY },
    { x: -padX, y: outHeight + padY },
  ];
  const h = computeHomography(canonical, quad);
  if (!h) {
    return null;
  }

  const out = new Uint8ClampedArray(outWidth * outHeight * 4);
  const { data, width: fw, height: fh } = frame;

  for (let y = 0; y < outHeight; y++) {
    for (let x = 0; x < outWidth; x++) {
      // Sample at pixel centres so the mapping stays symmetric.
      const src = applyHomography(h, { x: x + 0.5, y: y + 0.5 });
      const di = (y * outWidth + x) * 4;

      const sx = src.x - 0.5;
      const sy = src.y - 0.5;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;

      const x0c = clamp(x0, 0, fw - 1);
      const x1c = clamp(x0 + 1, 0, fw - 1);
      const y0c = clamp(y0, 0, fh - 1);
      const y1c = clamp(y0 + 1, 0, fh - 1);

      const i00 = (y0c * fw + x0c) * 4;
      const i10 = (y0c * fw + x1c) * 4;
      const i01 = (y1c * fw + x0c) * 4;
      const i11 = (y1c * fw + x1c) * 4;

      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      for (let c = 0; c < 3; c++) {
        out[di + c] =
          (data[i00 + c] ?? 0) * w00 +
          (data[i10 + c] ?? 0) * w10 +
          (data[i01 + c] ?? 0) * w01 +
          (data[i11 + c] ?? 0) * w11;
      }
      out[di + 3] = 255;
    }
  }

  return { data: out, width: outWidth, height: outHeight };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
