/* oxlint-disable import/no-nodejs-modules -- standalone CLI tooling, never bundled */
/**
 * Write everything the admin scan page fetches at runtime.
 *
 * Three files land in `apps/web/public/`, all gitignored and generated rather
 * than committed (the encoder model is never checked into git by decision):
 *
 * - `scan-embed-bank.bin` — the fp16 embedding bank with artwork keys baked in
 * - `scan-labels.json`    — key → name/code/language, so matches can be named
 * - `scan-encoder.onnx`   — the MobileCLIP-S0 vision tower for onnxruntime-web
 *
 * Regenerate whenever the catalogue or the embedding preprocessing changes:
 *
 *   bun scripts/scan/export-index.ts [--force-bank]
 */
import fs from "node:fs";
import path from "node:path";

import { encodeEmbedBank } from "../../packages/shared/src/scan/index.js";
import { loadCatalog } from "./catalog";
import { CANONICAL_BANK, MODEL_FILE, loadEmbedBank } from "./embed-bank";
import { REPO_ROOT } from "./lib";

const BANK_OUTPUT = path.join(REPO_ROOT, "apps/web/public/scan-embed-bank.bin");
const LABELS_OUTPUT = path.join(REPO_ROOT, "apps/web/public/scan-labels.json");
const MODEL_OUTPUT = path.join(REPO_ROOT, "apps/web/public/scan-encoder.onnx");
// OpenCV ships as a raw classic script, NOT through the bundler: vite's
// dep-optimized ESM wrapping of the emscripten UMD spins the main thread
// forever on evaluation, in every engine tested (WebKit, Chromium). The plain
// script is proven good on the same engines.
//
// Preferred source is the trimmed custom build (scripts/scan/build-opencv.sh):
// 3.4 MB split into glue + wasm instead of the 10.8 MB single-file npm dist.
// The wasm lands next to the glue with the same basename — the page's loader
// derives one URL from the other. Without the custom build the npm dist still
// works (single file, no wasm to copy).
const OPENCV_CUSTOM_DIR = path.join(REPO_ROOT, "data/image-recognition-test/models/opencv");
const OPENCV_CUSTOM_SOURCE = path.join(OPENCV_CUSTOM_DIR, "opencv.js");
const OPENCV_FALLBACK_SOURCE = path.join(
  REPO_ROOT,
  "node_modules/@techstark/opencv-js/dist/opencv.js",
);
const OPENCV_OUTPUT = path.join(REPO_ROOT, "apps/web/public/scan-opencv.js");
const OPENCV_WASM_OUTPUT = path.join(REPO_ROOT, "apps/web/public/scan-opencv.wasm");

const catalog = loadCatalog();

const bank = await loadEmbedBank("card", process.argv.includes("--force-bank"));
const bankBuffer = encodeEmbedBank(bank, (key) => catalog.get(key)?.artKey ?? key, CANONICAL_BANK);
await fs.promises.mkdir(path.dirname(BANK_OUTPUT), { recursive: true });
await fs.promises.writeFile(BANK_OUTPUT, Buffer.from(bankBuffer));

// A small side table so the page can name what it matched without hitting the
// API. Only the fields the page displays.
const labels: Record<string, { name: string; code: string; language: string; type?: string }> = {};
for (const key of bank.keys) {
  const identity = catalog.get(key);
  if (identity) {
    labels[key] = {
      name: identity.name,
      code: identity.publicCode,
      language: identity.language,
      type: identity.cardType,
    };
  }
}
await fs.promises.writeFile(LABELS_OUTPUT, `${JSON.stringify(labels)}\n`);

await fs.promises.copyFile(MODEL_FILE, MODEL_OUTPUT);
const modelStat = await fs.promises.stat(MODEL_OUTPUT);

const customOpenCv = fs.existsSync(OPENCV_CUSTOM_SOURCE);
await fs.promises.copyFile(
  customOpenCv ? OPENCV_CUSTOM_SOURCE : OPENCV_FALLBACK_SOURCE,
  OPENCV_OUTPUT,
);
const opencvStat = await fs.promises.stat(OPENCV_OUTPUT);
let opencvBytes = opencvStat.size;
if (customOpenCv) {
  await fs.promises.copyFile(path.join(OPENCV_CUSTOM_DIR, "opencv_js.wasm"), OPENCV_WASM_OUTPUT);
  const wasmStat = await fs.promises.stat(OPENCV_WASM_OUTPUT);
  opencvBytes += wasmStat.size;
} else {
  // A stale wasm next to a single-file script would be dead weight; the
  // loader only fetches it when the glue asks.
  await fs.promises.rm(OPENCV_WASM_OUTPUT, { force: true });
}

process.stdout.write(
  `wrote ${(bankBuffer.byteLength / 1024 / 1024).toFixed(2)} MB to apps/web/public/scan-embed-bank.bin\n` +
    `wrote ${(modelStat.size / 1024 / 1024).toFixed(2)} MB to apps/web/public/scan-encoder.onnx\n` +
    `wrote ${(opencvBytes / 1024 / 1024).toFixed(2)} MB to apps/web/public/scan-opencv.js${customOpenCv ? " + scan-opencv.wasm (custom trimmed build)" : " (npm dist; run scripts/scan/build-opencv.sh for the trimmed build)"}\n` +
    `${bank.keys.length} bank entries, ${Object.keys(labels).length} labelled\n`,
);
