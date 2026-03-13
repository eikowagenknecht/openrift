// oxlint-disable-next-line import/no-nodejs-modules -- server-side file needs filesystem access
import { existsSync } from "node:fs";
// oxlint-disable-next-line import/no-nodejs-modules -- server-side file needs filesystem access
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
// oxlint-disable-next-line import/no-nodejs-modules -- server-side file needs filesystem access
import { dirname, extname, join } from "node:path";

import type { Database } from "@openrift/shared/db";
import type { Kysely } from "kysely";
import sharp from "sharp";

function findProjectRoot(): string {
  let dir = import.meta.dir;
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, "bun.lock"))) {
      return dir;
    }
    dir = dirname(dir);
  }
  throw new Error("Could not find project root (no bun.lock found)");
}

export const CARD_IMAGES_DIR = join(findProjectRoot(), "card-images");

const SIZES = [
  { suffix: "300w", width: 300, quality: 85 },
  { suffix: "400w", width: 400, quality: 85 },
  { suffix: "full", width: null, quality: 85 },
] as const;

interface RehostProgress {
  total: number;
  rehosted: number;
  skipped: number;
  failed: number;
  errors: string[];
}

/**
 * Convert a printing ID to a filesystem-safe filename base.
 *
 * Printing ID format: `{source_id}:{art_variant}:{signed|}:{promo|}:{finish}`
 * File format:        `{source_id}-{art_variant}-{y|n}-{y|n}-{finish}`
 * @returns The filesystem-safe filename base
 */
export function printingIdToFileBase(printingId: string): string {
  const [sourceId, artVariant, signed, promo, finish] = printingId.split(":");
  return `${sourceId}-${artVariant}-${signed ? "y" : "n"}-${promo ? "y" : "n"}-${finish}`;
}

function guessExtension(contentType: string | null, url: string): string {
  if (contentType?.includes("png")) {
    return ".png";
  }
  if (contentType?.includes("jpeg") || contentType?.includes("jpg")) {
    return ".jpg";
  }
  if (contentType?.includes("webp")) {
    return ".webp";
  }
  if (contentType?.includes("avif")) {
    return ".avif";
  }
  const ext = extname(new URL(url).pathname).toLowerCase();
  return ext || ".png";
}

export async function downloadImage(url: string): Promise<{ buffer: Buffer; ext: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed (${res.status}): ${url}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const ext = guessExtension(res.headers.get("content-type"), url);
  return { buffer, ext };
}

async function generateWebpVariants(
  buffer: Buffer,
  outputDir: string,
  fileBase: string,
): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  for (const size of SIZES) {
    let pipeline = sharp(buffer);
    if (size.width !== null) {
      pipeline = pipeline.resize(size.width, null, { withoutEnlargement: true });
    }
    const webpBuffer = await pipeline.webp({ quality: size.quality }).toBuffer();
    await writeFile(join(outputDir, `${fileBase}-${size.suffix}.webp`), webpBuffer);
  }
}

export async function processAndSave(
  buffer: Buffer,
  originalExt: string,
  outputDir: string,
  fileBase: string,
): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, `${fileBase}-orig${originalExt}`), buffer);
  await generateWebpVariants(buffer, outputDir, fileBase);
}

/**
 * Delete all rehosted files for a given rehosted_url path prefix.
 * Removes orig, 300w, 400w, full variants.
 */
export async function deleteRehostFiles(rehostedUrl: string): Promise<void> {
  const dir = join(CARD_IMAGES_DIR, rehostedUrl.replace(/^\/card-images\//, ""));
  const parentDir = dirname(dir);
  const base = dir.split("/").pop() as string;

  let files: string[];
  try {
    files = await readdir(parentDir);
  } catch {
    return; // directory doesn't exist
  }

  for (const file of files) {
    if (file.startsWith(`${base}-`)) {
      // oxlint-disable-next-line no-empty-function -- swallow missing-file errors
      await unlink(join(parentDir, file)).catch(() => {});
    }
  }
}

/**
 * Rename all rehosted files from one base to another.
 * Handles orig, 300w, 400w, full variants.
 */
export async function renameRehostFiles(
  oldRehostedUrl: string,
  newRehostedUrl: string,
): Promise<void> {
  const oldDir = join(CARD_IMAGES_DIR, oldRehostedUrl.replace(/^\/card-images\//, ""));
  const newDir = join(CARD_IMAGES_DIR, newRehostedUrl.replace(/^\/card-images\//, ""));
  const parentDir = dirname(oldDir);
  const oldBase = oldDir.split("/").pop() as string;
  const newBase = newDir.split("/").pop() as string;

  let files: string[];
  try {
    files = await readdir(parentDir);
  } catch {
    return;
  }

  for (const file of files) {
    if (file.startsWith(`${oldBase}-`)) {
      const suffix = file.slice(oldBase.length);
      // oxlint-disable-next-line no-empty-function -- swallow missing-file errors
      await rename(join(parentDir, file), join(parentDir, `${newBase}${suffix}`)).catch(() => {});
    }
  }
}

const BATCH_SIZE = 10;

export async function rehostImages(db: Kysely<Database>): Promise<RehostProgress> {
  // Find active front images that haven't been rehosted yet
  const images = await db
    .selectFrom("printing_images as pi")
    .innerJoin("printings as p", "p.id", "pi.printing_id")
    .innerJoin("sets as s", "s.id", "p.set_id")
    .select(["pi.id as image_id", "pi.printing_id", "pi.original_url", "s.slug as set_slug"])
    .where("pi.is_active", "=", true)
    .where("pi.face", "=", "front")
    .where("pi.rehosted_url", "is", null)
    .where("pi.original_url", "is not", null)
    .limit(BATCH_SIZE)
    .execute();

  const progress: RehostProgress = {
    total: images.length,
    rehosted: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  for (const img of images) {
    if (!img.original_url) {
      progress.skipped++;
      continue;
    }

    try {
      const { buffer, ext } = await downloadImage(img.original_url);
      const fileBase = printingIdToFileBase(img.printing_id);
      const outputDir = join(CARD_IMAGES_DIR, img.set_slug);

      await processAndSave(buffer, ext, outputDir, fileBase);

      const selfHostedPath = `/card-images/${img.set_slug}/${fileBase}`;

      await db
        .updateTable("printing_images")
        .set({ rehosted_url: selfHostedPath, updated_at: new Date() })
        .where("id", "=", img.image_id)
        .execute();

      progress.rehosted++;
    } catch (error) {
      progress.failed++;
      const message = error instanceof Error ? error.message : String(error);
      progress.errors.push(`${img.printing_id}: ${message}`);
      console.error(`[rehost] Failed for ${img.printing_id}:`, message);
    }
  }

  return progress;
}

interface RegenerateProgress {
  total: number;
  regenerated: number;
  failed: number;
  errors: string[];
}

export async function regenerateImages(
  offset: number,
): Promise<RegenerateProgress & { hasMore: boolean; totalFiles: number }> {
  const progress: RegenerateProgress & { hasMore: boolean; totalFiles: number } = {
    total: 0,
    regenerated: 0,
    failed: 0,
    errors: [],
    hasMore: false,
    totalFiles: 0,
  };

  // Collect all orig files across all sets
  const allOrigFiles: { setDir: string; setId: string; file: string }[] = [];
  try {
    const entries = await readdir(CARD_IMAGES_DIR, { withFileTypes: true });
    const setDirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    for (const setId of setDirs) {
      const setDir = join(CARD_IMAGES_DIR, setId);
      const files = await readdir(setDir);
      for (const file of files) {
        if (file.includes("-orig.")) {
          allOrigFiles.push({ setDir, setId, file });
        }
      }
    }
  } catch {
    return progress;
  }

  progress.totalFiles = allOrigFiles.length;
  const batch = allOrigFiles.slice(offset, offset + BATCH_SIZE);
  progress.total = batch.length;
  progress.hasMore = offset + BATCH_SIZE < allOrigFiles.length;

  for (const { setDir, setId, file } of batch) {
    const fileBase = file.replace(/-orig\.[^.]+$/, "");
    try {
      const buffer = await readFile(join(setDir, file));
      await generateWebpVariants(buffer, setDir, fileBase);
      progress.regenerated++;
    } catch (error) {
      progress.failed++;
      const message = error instanceof Error ? error.message : String(error);
      progress.errors.push(`${setId}/${file}: ${message}`);
      console.error(`[regenerate] Failed for ${setId}/${file}:`, message);
    }
  }

  return progress;
}

interface SetImageStats {
  setId: string;
  setName: string;
  total: number;
  rehosted: number;
  external: number;
}

interface DiskStats {
  totalBytes: number;
  sets: { setId: string; bytes: number; fileCount: number }[];
}

async function getDiskStats(): Promise<DiskStats> {
  const sets: DiskStats["sets"] = [];
  let totalBytes = 0;

  try {
    const entries = await readdir(CARD_IMAGES_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const setDir = join(CARD_IMAGES_DIR, entry.name);
      const files = await readdir(setDir);
      let setBytes = 0;
      for (const file of files) {
        const info = await stat(join(setDir, file));
        setBytes += info.size;
      }
      sets.push({ setId: entry.name, bytes: setBytes, fileCount: files.length });
      totalBytes += setBytes;
    }
  } catch {
    // Directory doesn't exist yet — no disk stats
  }

  return { totalBytes, sets };
}

export async function getRehostStatus(db: Kysely<Database>): Promise<{
  total: number;
  rehosted: number;
  external: number;
  sets: SetImageStats[];
  disk: DiskStats;
}> {
  const [perSet, disk] = await Promise.all([
    db
      .selectFrom("printings")
      .innerJoin("sets", "sets.id", "printings.set_id")
      .leftJoin("printing_images as pi", (jb) =>
        jb
          .onRef("pi.printing_id", "=", "printings.id")
          .on("pi.face", "=", "front")
          .on("pi.is_active", "=", true),
      )
      .select([
        "sets.slug as setId",
        "sets.name as setName",
        ({ fn }) => fn.countAll<number>().as("total"),
        ({ fn }) =>
          fn.count<number>("pi.id").filterWhere("pi.rehosted_url", "is not", null).as("rehosted"),
      ])
      .groupBy(["sets.slug", "sets.name"])
      .orderBy("sets.name")
      .execute(),
    getDiskStats(),
  ]);

  let total = 0;
  let rehosted = 0;
  const sets = perSet.map((row) => {
    const t = Number(row.total);
    const r = Number(row.rehosted);
    total += t;
    rehosted += r;
    return { setId: row.setId, setName: row.setName, total: t, rehosted: r, external: t - r };
  });

  return { total, rehosted, external: total - rehosted, sets, disk };
}
