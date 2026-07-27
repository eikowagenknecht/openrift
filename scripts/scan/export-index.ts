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
import { MODEL_FILE, loadEmbedBank } from "./embed-bank";
import { REPO_ROOT } from "./lib";

const BANK_OUTPUT = path.join(REPO_ROOT, "apps/web/public/scan-embed-bank.bin");
const LABELS_OUTPUT = path.join(REPO_ROOT, "apps/web/public/scan-labels.json");
const MODEL_OUTPUT = path.join(REPO_ROOT, "apps/web/public/scan-encoder.onnx");
// OpenCV ships as a raw classic script, NOT through the bundler: vite's
// dep-optimized ESM wrapping of the 10.8 MB emscripten UMD spins the main
// thread forever on evaluation, in every engine tested (WebKit, Chromium).
// The plain script is proven good on the same engines.
const OPENCV_SOURCE = path.join(REPO_ROOT, "node_modules/@techstark/opencv-js/dist/opencv.js");
const OPENCV_OUTPUT = path.join(REPO_ROOT, "apps/web/public/scan-opencv.js");

const catalog = loadCatalog();

const bank = await loadEmbedBank("card", process.argv.includes("--force-bank"));
const bankBuffer = encodeEmbedBank(bank, (key) => catalog.get(key)?.artKey ?? key);
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

await fs.promises.copyFile(OPENCV_SOURCE, OPENCV_OUTPUT);
const opencvStat = await fs.promises.stat(OPENCV_OUTPUT);

process.stdout.write(
  `wrote ${(bankBuffer.byteLength / 1024 / 1024).toFixed(2)} MB to apps/web/public/scan-embed-bank.bin\n` +
    `wrote ${(modelStat.size / 1024 / 1024).toFixed(2)} MB to apps/web/public/scan-encoder.onnx\n` +
    `wrote ${(opencvStat.size / 1024 / 1024).toFixed(2)} MB to apps/web/public/scan-opencv.js\n` +
    `${bank.keys.length} bank entries, ${Object.keys(labels).length} labelled\n`,
);
