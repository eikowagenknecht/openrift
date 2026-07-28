/* oxlint-disable import/no-nodejs-modules -- standalone CLI tooling, never bundled */
/**
 * Bun-side adapter for the shared embedding module.
 *
 * The ranking math, preprocessing and rotation handling live in
 * `packages/shared/src/scan/embed.ts`; this file only opens the ONNX encoder
 * under onnxruntime-node and caches the reference bank on disk.
 *
 * The encoder is the ONNX vision tower from https://huggingface.co/Xenova/mobileclip_s0,
 * fetched into `data/image-recognition-test/models/mobileclip-s0/` (gitignored):
 *
 *   curl -sSLO https://huggingface.co/Xenova/mobileclip_s0/resolve/main/onnx/vision_model.onnx
 *   curl -sSLO https://huggingface.co/Xenova/mobileclip_s0/resolve/main/preprocessor_config.json
 */
import fs from "node:fs";
import path from "node:path";

import * as ort from "onnxruntime-node";

import type { CardEmbedder, EmbedBank, EmbedKind } from "../../packages/shared/src/scan/index.js";
import {
  EMBED_DIM,
  EMBED_IMAGE_SIZE,
  normalizeEmbeddings,
  preprocessCardInto,
} from "../../packages/shared/src/scan/index.js";
import { CACHE_DIR, DATA_DIR, listReferenceImages, loadImage, mapConcurrent } from "./lib";

const MODEL_DIR = path.join(DATA_DIR, "models/mobileclip-s0");
/** Overridable via SCAN_ENCODER so quantized encoder candidates can run the
 * same bench; an override gets its own bank cache (bank and encoder must
 * always match). */
export const MODEL_FILE = process.env.SCAN_ENCODER ?? path.join(MODEL_DIR, "vision_model.onnx");
const MODEL_TAG = process.env.SCAN_ENCODER ? `-${path.basename(MODEL_FILE, ".onnx")}` : "";

/** References embedded per `session.run`. Above this the gain flattens and the staging tensor gets large. */
const BUILD_BATCH = 8;

function cacheFile(kind: EmbedKind, extension: string): string {
  return path.join(CACHE_DIR, `embed-bank-${kind}${MODEL_TAG}-v1.${extension}`);
}

let sessionPromise: Promise<ort.InferenceSession> | null = null;

/**
 * Open the vision encoder, once per process.
 *
 * @returns The shared inference session.
 */
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

/**
 * The injected encoder for Bun: one onnxruntime-node call per filled batch.
 *
 * @returns Raw, unnormalized `count * EMBED_DIM` output floats.
 */
export const nodeEmbedder: CardEmbedder = async (pixels, count) => {
  const session = await encoder();
  // The staging tensor is sized for a full batch; a short final chunk must be
  // handed over trimmed or the shape and the data length disagree.
  const slice = pixels.subarray(0, count * 3 * EMBED_IMAGE_SIZE * EMBED_IMAGE_SIZE);
  const output = await session.run({
    pixel_values: new ort.Tensor("float32", slice, [count, 3, EMBED_IMAGE_SIZE, EMBED_IMAGE_SIZE]),
  });
  return output.image_embeds.data as Float32Array;
};

/**
 * Load the reference embedding bank, building and caching it on first use.
 *
 * The vectors go to a raw binary sidecar rather than JSON, which keeps the
 * fp32 bank at its natural size instead of tripling it as text.
 *
 * @returns One embedding per local reference render, in its native orientation.
 */
export async function loadEmbedBank(kind: EmbedKind, force = false): Promise<EmbedBank> {
  const meta = cacheFile(kind, "json");
  const binary = cacheFile(kind, "bin");
  if (!force && fs.existsSync(meta) && fs.existsSync(binary)) {
    const parsed = JSON.parse(fs.readFileSync(meta, "utf-8")) as { keys: string[]; dim: number };
    if (parsed.dim === EMBED_DIM) {
      const raw = fs.readFileSync(binary);
      const vectors = new Float32Array(
        raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
      );
      if (vectors.length === parsed.keys.length * EMBED_DIM) {
        return { keys: parsed.keys, vectors };
      }
    }
  }

  const refs = listReferenceImages();
  const vectors = new Float32Array(refs.length * EMBED_DIM);
  const input = new Float32Array(BUILD_BATCH * 3 * EMBED_IMAGE_SIZE * EMBED_IMAGE_SIZE);
  for (let start = 0; start < refs.length; start += BUILD_BATCH) {
    const chunk = refs.slice(start, start + BUILD_BATCH);
    const images = await mapConcurrent(chunk, 4, (ref) => loadImage(ref.file));
    for (const [slot, image] of images.entries()) {
      preprocessCardInto(image, kind, input, slot);
    }
    const embedded = normalizeEmbeddings(await nodeEmbedder(input, chunk.length), chunk.length);
    for (const [slot, vector] of embedded.entries()) {
      vectors.set(vector, (start + slot) * EMBED_DIM);
    }
  }

  const keys = refs.map((ref) => ref.key);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(meta, JSON.stringify({ keys, dim: EMBED_DIM }));
  fs.writeFileSync(binary, Buffer.from(vectors.buffer, 0, vectors.byteLength));
  return { keys, vectors };
}
