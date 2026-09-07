// oxlint-disable-next-line import/no-nodejs-modules -- hashing is pure, not IO worth injecting
import { createHash } from "node:crypto";
// oxlint-disable-next-line import/no-nodejs-modules -- server-side path handling
import { join } from "node:path";

import type { Logger } from "@openrift/shared/logger";
import type { EmbedBank } from "@openrift/shared/scan/embed";
import {
  embedImageSizeOf,
  normalizeEmbeddings,
  preprocessCardInto,
} from "@openrift/shared/scan/embed";
import { EMBED_BANK_VERSION, encodeEmbedBank } from "@openrift/shared/scan/embed-format";
import { rotateRgbaCw } from "@openrift/shared/scan/image";
import type { CardLabels } from "@openrift/shared/scan/labels";
import type { RgbaImage } from "@openrift/shared/scan/types";

import type { Io } from "../../../io.js";
import type { ScanReferenceRow, catalogRepo } from "../../catalog/repositories/catalog.js";
import { CARD_MEDIA_DIR, MEDIA_DIR } from "../../catalog/services/images/paths.js";
import type { scanIndexRepo } from "../repositories/scan-index.js";

type CatalogRepo = ReturnType<typeof catalogRepo>;
type ScanIndexRepo = ReturnType<typeof scanIndexRepo>;

export const REBUILD_SCAN_BANK_KIND = "scan.rebuild_bank";

/** Where the scanner's served artifacts live (nginx serves /media/ as-is). */
const SCAN_MEDIA_DIR = join(MEDIA_DIR, "scan");

/** Renders embedded per encoder call; above this the gain flattens. */
const BUILD_BATCH = 8;

/**
 * Groups renders by artwork: language excluded, null variant collapses to "",
 * and an overnumbered print keys apart since it carries its own illustration.
 */
export function scanArtKey(
  row: Pick<ScanReferenceRow, "setSlug" | "name" | "artVariant" | "isOvernumbered">,
): string {
  return `${row.setSlug}|${row.name}|${row.artVariant ?? ""}|${row.isOvernumbered ? "over" : ""}`;
}

export interface ScanBankBuildResult {
  entryCount: number;
  skipped: number;
  bankHash: string;
  durationMs: number;
}

interface ScanBankDeps {
  repos: { catalog: CatalogRepo; scanIndex: ScanIndexRepo };
  io: Io;
  log: Logger;
  encoderFile: string;
}

/** Bank and query preprocessing must stay identical (flattened onto mid grey). */
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

/** The 400w derivative: used both as bank source and as ORB reference. */
function renderPath(imageId: string): string {
  return join(CARD_MEDIA_DIR, imageId.slice(-2), `${imageId}-400w.webp`);
}

/**
 * Renders are embedded in the canonical frame (landscape rotated 90° left),
 * which is how every encoder we serve is trained; changing that needs this builder changed with it.
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
  const labels: CardLabels = {};
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
    const imageEmbeds = output.image_embeds;
    if (imageEmbeds === undefined) {
      throw new Error("Scan embedding session returned no image_embeds output");
    }
    const embedded = normalizeEmbeddings(
      Float32Array.from(imageEmbeds.data as Float32Array),
      batch.length,
    );
    for (const [i, row] of batch.entries()) {
      const vector = embedded[i];
      if (vector === undefined) {
        continue;
      }
      keys.push(row.imageId);
      labels[row.imageId] = {
        name: row.name,
        code: row.publicCode,
        language: row.language,
        type: row.cardType,
        // Null when the render serves printings with differing marker sets:
        // such an image carries no stamp evidence for disambiguation.
        markers: row.markersMin === row.markersMax ? row.markersMin : null,
      };
      artKeys.set(row.imageId, scanArtKey(row));
      vectors.push(vector);
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
  // Always true: the browser reads this flag to gate its rotation search,
  // so it travels in the file even though this builder always sets it.
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

  // Keeps the previous generation's files: a client may hold its manifest mid-download.
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

export function bankFileName(hash: string): string {
  return `scan-bank-${hash}.bin`;
}

export function labelsFileName(hash: string): string {
  return `scan-labels-${hash}.json`;
}

/** Row width comes from the vectors, so other embedding dimensions pack unchanged. */
function concat(vectors: readonly Float32Array[]): Float32Array {
  const dim = vectors[0]?.length ?? 0;
  const out = new Float32Array(vectors.length * dim);
  for (const [i, vector] of vectors.entries()) {
    out.set(vector, i * dim);
  }
  return out;
}

/** The engine assets (encoder, opencv) are never touched. */
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
