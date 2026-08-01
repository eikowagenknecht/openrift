// oxlint-disable-next-line import/no-nodejs-modules -- hashing is pure, not IO worth injecting
import { createHash } from "node:crypto";
// oxlint-disable-next-line import/no-nodejs-modules -- server-side path handling
import { join } from "node:path";

import type { Logger } from "@openrift/shared/logger";
import type { EmbedBank, RgbaImage } from "@openrift/shared/scan";
import {
  EMBED_BANK_VERSION,
  embedImageSizeOf,
  encodeEmbedBank,
  normalizeEmbeddings,
  preprocessCardInto,
  rotateRgbaCw,
} from "@openrift/shared/scan";

import type { Io } from "../io.js";
import type { ScanReferenceRow, catalogRepo } from "../repositories/catalog.js";
import type { scanIndexRepo } from "../repositories/scan-index.js";
import { CARD_MEDIA_DIR, MEDIA_DIR } from "./image-rehost.js";

type CatalogRepo = ReturnType<typeof catalogRepo>;
type ScanIndexRepo = ReturnType<typeof scanIndexRepo>;

/** Job-runs `kind` for the scanner bank rebuild. */
export const REBUILD_SCAN_BANK_KIND = "scan.rebuild_bank";

/** Where the scanner's served artifacts live (nginx serves /media/ as-is). */
const SCAN_MEDIA_DIR = join(MEDIA_DIR, "scan");

/** Renders embedded per encoder call; above this the gain flattens. */
const BUILD_BATCH = 8;

export interface ScanBankBuildResult {
  entryCount: number;
  /** Catalogued renders whose 400w file was missing or undecodable. */
  skipped: number;
  bankHash: string;
  durationMs: number;
}

interface ScanBankDeps {
  repos: { catalog: CatalogRepo; scanIndex: ScanIndexRepo };
  io: Io;
  log: Logger;
  /** Filename of the encoder under media/scan (config.scan.encoderFile). */
  encoderFile: string;
}

/**
 * Decode a render into the packed RGBA buffer the scan engine works on,
 * exactly like the dev bench does: flattened onto mid grey so the rounded
 * corners sit near the card's own average instead of injecting a hard edge no
 * photograph would show. Bank and query preprocessing must stay identical.
 *
 * @returns The decoded image.
 */
async function decodeRender(io: Io, file: string): Promise<RgbaImage> {
  const buffer = await io.fs.readFile(file);
  const { data, info } = await io
    .sharp(buffer)
    .flatten({ background: { r: 128, g: 128, b: 128 } })
    .raw()
    .toColourspace("srgb")
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true });
  return {
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
    width: info.width,
    height: info.height,
  };
}

/**
 * The disk path of a render's 400w derivative (the variant the scanner uses
 * both as bank source and as ORB reference).
 *
 * @returns The absolute file path.
 */
function renderPath(imageId: string): string {
  return join(CARD_MEDIA_DIR, imageId.slice(-2), `${imageId}-400w.webp`);
}

/**
 * Rebuild the scanner's embedding bank from every catalogued front render and
 * publish it as a new content-hashed generation under media/scan.
 *
 * The encoder is opened per run and released after: onnxruntime-node holds a
 * native session worth hundreds of megabytes, which has no business resident
 * in the API between rebuilds. The previous generation's files are kept (a
 * client may hold its manifest mid-download); anything older is pruned.
 *
 * Renders are embedded in the canonical frame (landscape rotated 90 degrees
 * left, the way players place battlefields), which is how every encoder we
 * serve is trained. Swapping in an encoder trained on the native frame would
 * degrade battlefield matching and needs this builder changed with it.
 *
 * @returns Counts and the new generation's hash for the job summary.
 */
export async function rebuildScanBank(deps: ScanBankDeps): Promise<ScanBankBuildResult> {
  const startedAt = Date.now();
  const { repos, io, log, encoderFile } = deps;

  const encoderPath = join(SCAN_MEDIA_DIR, encoderFile);
  await io.fs.stat(encoderPath).catch(() => {
    throw new Error(
      `scan encoder missing at ${encoderPath}; upload the engine's encoder file first`,
    );
  });

  const references = await repos.catalog.scanReferences();
  const previous = await repos.scanIndex.get();

  // onnxruntime-node is imported lazily so the API boots without touching the
  // native runtime; only the rebuild pays for it.
  const ort = await import("onnxruntime-node");
  const session = await ort.InferenceSession.create(encoderPath);
  // The encoder's input side comes from the model file itself, so a smaller
  // custom encoder ships by replacing the file — no config to keep in sync.
  const inputMeta = session.inputMetadata[0];
  const imageSize = embedImageSizeOf(inputMeta?.isTensor ? inputMeta.shape : undefined);

  const keys: string[] = [];
  const labels: Record<string, { name: string; code: string; language: string; type: string }> = {};
  const artKeys = new Map<string, string>();
  const vectors: Float32Array[] = [];
  let skipped = 0;
  let watermark: Date | null = null;

  const staging = new Float32Array(BUILD_BATCH * 3 * imageSize * imageSize);
  let batch: ScanReferenceRow[] = [];

  const flush = async (): Promise<void> => {
    if (batch.length === 0) {
      return;
    }
    const output = await session.run({
      pixel_values: new ort.Tensor(
        "float32",
        staging.subarray(0, batch.length * 3 * imageSize * imageSize),
        [batch.length, 3, imageSize, imageSize],
      ),
    });
    const embedded = normalizeEmbeddings(
      Float32Array.from(output.image_embeds.data as Float32Array),
      batch.length,
    );
    for (const [i, row] of batch.entries()) {
      keys.push(row.imageId);
      labels[row.imageId] = {
        name: row.name,
        code: row.publicCode,
        language: row.language,
        type: row.cardType,
      };
      // Language deliberately excluded, and null variants collapse to the
      // empty string to match the dev catalogue's artwork grouping exactly.
      artKeys.set(row.imageId, `${row.setSlug}|${row.name}|${row.artVariant ?? ""}`);
      vectors.push(embedded[i]);
      if (watermark === null || row.createdAt > watermark) {
        watermark = row.createdAt;
      }
    }
    batch = [];
  };

  for (const row of references) {
    let image: RgbaImage;
    try {
      image = await decodeRender(io, renderPath(row.imageId));
    } catch {
      skipped++;
      continue;
    }
    if (image.width > image.height) {
      // 90 degrees left = three clockwise quarter turns; matches the
      // trainer's Image.Transpose.ROTATE_90 and the bench's bank build.
      image = rotateRgbaCw(rotateRgbaCw(rotateRgbaCw(image)));
    }
    preprocessCardInto(image, "card", staging, batch.length, imageSize);
    batch.push(row);
    if (batch.length === BUILD_BATCH) {
      await flush();
    }
  }
  await flush();
  await session.release();

  if (keys.length === 0) {
    throw new Error("no catalogued renders were decodable; bank not written");
  }

  const bank: EmbedBank = {
    keys,
    vectors: concat(vectors),
  };
  // Banks are always built in the canonical frame, so the flag is constant
  // here. It still travels in the file: the format keeps it because v1 banks
  // decode as native, and the browser gates its guide-mode pair-only rotation
  // search on what the loaded bank reports rather than on a build-time
  // assumption.
  const bankBuffer = Buffer.from(encodeEmbedBank(bank, (key) => artKeys.get(key) ?? key, true));
  const labelsBuffer = Buffer.from(`${JSON.stringify(labels)}\n`);
  const bankHash = createHash("sha256")
    .update(bankBuffer)
    .update(labelsBuffer)
    .digest("hex")
    .slice(0, 16);

  await io.fs.mkdir(SCAN_MEDIA_DIR, { recursive: true });
  await io.fs.writeFile(join(SCAN_MEDIA_DIR, bankFileName(bankHash)), bankBuffer);
  await io.fs.writeFile(join(SCAN_MEDIA_DIR, labelsFileName(bankHash)), labelsBuffer);

  await repos.scanIndex.put({
    formatVersion: EMBED_BANK_VERSION,
    bankHash,
    entryCount: keys.length,
    encoderTag: encoderFile,
    watermark,
    builtAt: new Date(),
    durationMs: Date.now() - startedAt,
  });

  await pruneGenerations(io, log, [bankHash, previous?.bankHash]);

  const result = {
    entryCount: keys.length,
    skipped,
    bankHash,
    durationMs: Date.now() - startedAt,
  };
  log.info(result, "Scan bank rebuilt");
  return result;
}

/** @returns The served bank filename for a generation hash. */
export function bankFileName(hash: string): string {
  return `scan-bank-${hash}.bin`;
}

/** @returns The served labels filename for a generation hash. */
export function labelsFileName(hash: string): string {
  return `scan-labels-${hash}.json`;
}

/**
 * Concatenate per-image vectors into one bank buffer. The row width comes
 * from the vectors themselves, so encoders with other embedding dimensions
 * pack unchanged.
 *
 * @returns The packed vectors.
 */
function concat(vectors: readonly Float32Array[]): Float32Array {
  const dim = vectors[0]?.length ?? 0;
  const out = new Float32Array(vectors.length * dim);
  for (const [i, vector] of vectors.entries()) {
    out.set(vector, i * dim);
  }
  return out;
}

/**
 * Delete bank/labels generations other than the ones to keep. The engine
 * assets (encoder, opencv) are never touched.
 *
 * @returns Nothing; stale files are unlinked best-effort.
 */
async function pruneGenerations(
  io: Io,
  log: Logger,
  keepHashes: readonly (string | undefined)[],
): Promise<void> {
  const keep = new Set(
    keepHashes
      .filter((h): h is string => Boolean(h))
      .flatMap((h) => [bankFileName(h), labelsFileName(h)]),
  );
  let entries: string[];
  try {
    entries = await io.fs.readdir(SCAN_MEDIA_DIR);
  } catch {
    return;
  }
  for (const entry of entries) {
    const generational = entry.startsWith("scan-bank-") || entry.startsWith("scan-labels-");
    if (generational && !keep.has(entry)) {
      await io.fs.unlink(join(SCAN_MEDIA_DIR, entry)).catch((error: unknown) => {
        log.warn({ entry, error }, "Could not prune stale scan generation");
      });
    }
  }
}
