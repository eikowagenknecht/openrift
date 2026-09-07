// oxlint-disable-next-line import/no-nodejs-modules -- server-side file needs filesystem access
import { dirname, join } from "node:path";

import { ERROR_CODES } from "@openrift/shared/error-codes";

import { AppError } from "../../../../errors.js";
import type { Io } from "../../../../io.js";
import { downloadImage } from "./download.js";
import { CARD_MEDIA_DIR } from "./paths.js";
import { computeScanCropBox, computeScanLevels } from "./scan-analysis.js";

const SIZES = [
  { suffix: "120w", shortEdge: 120, quality: 75 },
  { suffix: "240w", shortEdge: 240, quality: 80 },
  { suffix: "400w", shortEdge: 400, quality: 80 },
  { suffix: "full", shortEdge: 800, quality: 85 },
] as const;

/** Whether a filename uses a currently-valid variant suffix (`-orig.{ext}` or `-{SIZES.suffix}.webp`). */
export function isValidVariantSuffix(file: string): boolean {
  if (/-orig\.[^.]+$/u.test(file)) {
    return true;
  }
  return SIZES.some((size) => file.endsWith(`-${size.suffix}.webp`));
}

export async function generateWebpVariants(
  io: Io,
  buffer: Buffer,
  outputDir: string,
  fileBase: string,
  rotation: number,
  /** True crops to the detected card box and applies auto-levels; false leaves the image untouched. */
  needsTrim: boolean,
  skipExisting = false,
): Promise<void> {
  await io.fs.mkdir(outputDir, { recursive: true });

  let existing = new Set<string>();
  if (skipExisting) {
    try {
      existing = new Set(await io.fs.readdir(outputDir));
    } catch {
      // directory unreadable, fall through to let sharp/writeFile errors surface
    }
    const allPresent = SIZES.every((size) => existing.has(`${fileBase}-${size.suffix}.webp`));
    if (allPresent) {
      return;
    }
  }

  let prepped = io.sharp(buffer);
  if (rotation !== 0) {
    prepped = prepped.rotate(rotation);
  }

  let preppedBuffer: Buffer;
  let preppedWidth: number;
  let preppedHeight: number;

  if (needsTrim) {
    // One greyscale decode of the rotated scan feeds both the projection
    // crop and the auto-levels measurement.
    const { data: grey, info: greyInfo } = await prepped
      .clone()
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    preppedWidth = greyInfo.width;
    preppedHeight = greyInfo.height;
    const box = computeScanCropBox(grey, greyInfo.width, greyInfo.height);
    const wasCropped = box !== null && (box.width < greyInfo.width || box.height < greyInfo.height);
    if (box && wasCropped && box.width > 4 && box.height > 4) {
      // Shave 2px off each side to absorb scanner halo and a slightly tilted edge.
      const shaved = {
        left: box.left + 2,
        top: box.top + 2,
        width: box.width - 4,
        height: box.height - 4,
      };
      prepped = prepped.extract(shaved);
      preppedWidth = shaved.width;
      preppedHeight = shaved.height;
    }
    const levels = computeScanLevels(
      grey,
      greyInfo.width,
      box ?? { left: 0, top: 0, width: greyInfo.width, height: greyInfo.height },
    );
    if (levels) {
      prepped = prepped.linear(levels.multiply, levels.offset);
    }
    preppedBuffer = await prepped.toBuffer();
  } else {
    const meta = await io.sharp(buffer).metadata();
    const rawWidth = meta.width ?? 0;
    const rawHeight = meta.height ?? 0;
    // 90° and 270° rotations swap width and height — measure orientation
    // post-rotation so short-edge capping stays orientation-aware after rotate.
    const swap = rotation === 90 || rotation === 270;
    preppedBuffer = await prepped.toBuffer();
    preppedWidth = swap ? rawHeight : rawWidth;
    preppedHeight = swap ? rawWidth : rawHeight;
  }

  const isLandscape = preppedWidth > preppedHeight;
  for (const size of SIZES) {
    const filename = `${fileBase}-${size.suffix}.webp`;
    if (skipExisting && existing.has(filename)) {
      continue;
    }
    const webpBuffer = await io
      .sharp(preppedBuffer)
      .resize(isLandscape ? null : size.shortEdge, isLandscape ? size.shortEdge : null, {
        withoutEnlargement: true,
      })
      .webp({ quality: size.quality })
      .toBuffer();
    await io.fs.writeFile(join(outputDir, filename), webpBuffer);
  }
}

/** A cheap "don't clobber" guard for `processAndSave`; use `rehostFilesComplete` for integrity checks. */
export async function rehostFilesExist(
  io: Io,
  outputDir: string,
  fileBase: string,
): Promise<boolean> {
  let files: string[];
  try {
    files = await io.fs.readdir(outputDir);
  } catch {
    return false;
  }
  return files.some((f) => f.startsWith(`${fileBase}-`));
}

/** Whether the `-orig.*` archive and every `-{SIZES.suffix}.webp` variant exist on disk. */
export async function rehostFilesComplete(
  io: Io,
  outputDir: string,
  fileBase: string,
): Promise<boolean> {
  let files: string[];
  try {
    files = await io.fs.readdir(outputDir);
  } catch {
    return false;
  }
  const hasOrig = files.some((f) => f.startsWith(`${fileBase}-orig.`));
  if (!hasOrig) {
    return false;
  }
  return SIZES.every((size) => files.includes(`${fileBase}-${size.suffix}.webp`));
}

/** Removes every `{fileBase}-orig.*` so a format change (e.g. png to webp) doesn't leave duplicates. */
async function sweepExistingOrig(io: Io, outputDir: string, fileBase: string): Promise<void> {
  let files: string[];
  try {
    files = await io.fs.readdir(outputDir);
  } catch {
    return;
  }
  for (const file of files) {
    if (file.startsWith(`${fileBase}-orig.`)) {
      // oxlint-disable-next-line no-empty-function -- swallow missing-file errors
      await io.fs.unlink(join(outputDir, file)).catch(() => {});
    }
  }
}

export async function processAndSave(
  io: Io,
  buffer: Buffer,
  originalExt: string,
  outputDir: string,
  fileBase: string,
  rotation: number,
  needsTrim: boolean,
  allowOverwrite = false,
): Promise<void> {
  if (!allowOverwrite && (await rehostFilesExist(io, outputDir, fileBase))) {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      `Rehost files already exist for ${fileBase} in ${outputDir}; use overwrite to regenerate`,
    );
  }
  await io.fs.mkdir(outputDir, { recursive: true });
  await sweepExistingOrig(io, outputDir, fileBase);
  await io.fs.writeFile(join(outputDir, `${fileBase}-orig${originalExt}`), buffer);
  await generateWebpVariants(io, buffer, outputDir, fileBase, rotation, needsTrim);
}

export async function deleteRehostFiles(io: Io, rehostedUrl: string): Promise<void> {
  const dir = join(CARD_MEDIA_DIR, rehostedUrl.replace(/^\/media\/cards\//u, ""));
  const parentDir = dirname(dir);
  const base = dir.split("/").pop() as string;

  let files: string[];
  try {
    files = await io.fs.readdir(parentDir);
  } catch {
    return; // directory doesn't exist
  }

  for (const file of files) {
    if (file.startsWith(`${base}-`)) {
      // oxlint-disable-next-line no-empty-function -- swallow missing-file errors
      await io.fs.unlink(join(parentDir, file)).catch(() => {});
    }
  }
}

/** Used by the rotate endpoint to rebuild variants after changing rotation. */
export async function regenerateFromOrig(
  io: Io,
  imageFileId: string,
  rotation: number,
  needsTrim: boolean,
  originalUrl: string | null,
): Promise<void> {
  const outputDir = join(CARD_MEDIA_DIR, imageFileId.slice(-2));
  let files: string[] = [];
  try {
    files = await io.fs.readdir(outputDir);
  } catch {
    // directory doesn't exist yet
  }

  const origFile = files.find((f) => f.startsWith(`${imageFileId}-orig.`));
  if (origFile) {
    const buffer = await io.fs.readFile(join(outputDir, origFile));
    await generateWebpVariants(io, buffer, outputDir, imageFileId, rotation, needsTrim);
    return;
  }

  if (!originalUrl) {
    throw new Error(`No orig file on disk and no originalUrl for image ${imageFileId}`);
  }
  const { buffer, ext } = await downloadImage(io, originalUrl);
  await processAndSave(io, buffer, ext, outputDir, imageFileId, rotation, needsTrim, true);
}
