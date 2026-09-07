/* oxlint-disable import/no-nodejs-modules -- standalone CLI tooling, never bundled */
/**
 * Bun-side adapter for the shared embedding module (packages/shared/src/scan):
 * opens the ONNX vision encoder from https://huggingface.co/Xenova/mobileclip_s0
 * under onnxruntime-node and caches the reference bank on disk.
 */
import fs from "node:fs";
import path from "node:path";

import * as ort from "onnxruntime-node";

import type { CardEmbedder, EmbedBank, EmbedKind } from "../../packages/shared/src/scan/embed.js";
import {
  EMBED_DIM,
  EMBED_IMAGE_SIZE,
  normalizeEmbeddings,
  preprocessCardInto,
} from "../../packages/shared/src/scan/embed.js";
import { rotateRgbaCw } from "../../packages/shared/src/scan/image.js";
import { CACHE_DIR, DATA_DIR, listReferenceImages, loadImage, mapConcurrent } from "./lib";

const MODEL_DIR = path.join(DATA_DIR, "models/mobileclip-s0");
export const MODEL_FILE = process.env.SCAN_ENCODER ?? path.join(MODEL_DIR, "vision_model.onnx");
const MODEL_TAG = process.env.SCAN_ENCODER ? `-${path.basename(MODEL_FILE, ".onnx")}` : "";
export const EMBED_SIZE = Number(process.env.SCAN_EMBED_SIZE ?? EMBED_IMAGE_SIZE);
export const CANONICAL_BANK = process.env.SCAN_CANONICAL_BANK === "1";

const BUILD_BATCH = 8;

function cacheFile(kind: EmbedKind, extension: string): string {
  const sizeTag = EMBED_SIZE === EMBED_IMAGE_SIZE ? "" : `-${EMBED_SIZE}`;
  const canonTag = CANONICAL_BANK ? "-canon" : "";
  return path.join(
    CACHE_DIR,
    `embed-bank-${kind}${MODEL_TAG}${sizeTag}${canonTag}-v1.${extension}`,
  );
}

let sessionPromise: Promise<ort.InferenceSession> | null = null;

function encoder(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    if (!fs.existsSync(MODEL_FILE)) {
      throw new Error(
        `missing ${MODEL_FILE}; fetch vision_model.onnx and preprocessor_config.json from https://huggingface.co/Xenova/mobileclip_s0`,
      );
    }
    sessionPromise = ort.InferenceSession.create(MODEL_FILE);
  }
  return sessionPromise;
}

export const nodeEmbedder: CardEmbedder = async (pixels, count) => {
  const session = await encoder();
  // The staging tensor is sized for a full batch; a short final chunk must be
  // handed over trimmed or the shape and the data length disagree.
  const slice = pixels.subarray(0, count * 3 * EMBED_SIZE * EMBED_SIZE);
  const output = await session.run({
    pixel_values: new ort.Tensor("float32", slice, [count, 3, EMBED_SIZE, EMBED_SIZE]),
  });
  return output.image_embeds.data as Float32Array;
};

export async function loadEmbedBank(kind: EmbedKind, force = false): Promise<EmbedBank> {
  const meta = cacheFile(kind, "json");
  const binary = cacheFile(kind, "bin");
  if (!force && fs.existsSync(meta) && fs.existsSync(binary)) {
    const parsed = JSON.parse(fs.readFileSync(meta, "utf-8")) as { keys: string[]; dim: number };
    const raw = fs.readFileSync(binary);
    const vectors = new Float32Array(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
    );
    if (vectors.length === parsed.keys.length * parsed.dim) {
      return { keys: parsed.keys, vectors };
    }
  }

  const refs = listReferenceImages();
  const chunks: Float32Array[][] = [];
  const input = new Float32Array(BUILD_BATCH * 3 * EMBED_SIZE * EMBED_SIZE);
  for (let start = 0; start < refs.length; start += BUILD_BATCH) {
    const chunk = refs.slice(start, start + BUILD_BATCH);
    const images = await mapConcurrent(chunk, 4, (ref) => loadImage(ref.file));
    for (const [slot, image] of images.entries()) {
      // 90 degrees left = three clockwise quarter turns; matches the
      // trainer's Image.Transpose.ROTATE_90.
      const oriented =
        CANONICAL_BANK && image.width > image.height
          ? rotateRgbaCw(rotateRgbaCw(rotateRgbaCw(image)))
          : image;
      preprocessCardInto(oriented, kind, input, slot, EMBED_SIZE);
    }
    chunks.push(normalizeEmbeddings(await nodeEmbedder(input, chunk.length), chunk.length));
  }
  const flat = chunks.flat();
  const dim = flat[0]?.length ?? EMBED_DIM;
  const vectors = new Float32Array(refs.length * dim);
  for (const [i, vector] of flat.entries()) {
    vectors.set(vector, i * dim);
  }

  const keys = refs.map((ref) => ref.key);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(meta, JSON.stringify({ keys, dim }));
  fs.writeFileSync(binary, Buffer.from(vectors.buffer, 0, vectors.byteLength));
  return { keys, vectors };
}
