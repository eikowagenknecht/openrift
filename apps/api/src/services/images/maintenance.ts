// oxlint-disable-next-line import/no-nodejs-modules -- server-side file needs filesystem access
import { join } from "node:path";

import type {
  BrokenImagesResponse,
  CleanupOrphanedResponse,
  ClearRehostedResponse,
  LowResImagesResponse,
  RehostStatusDiskStats,
  RehostStatusResponse,
} from "@openrift/shared";

import type { Io } from "../../io.js";
import type { printingImagesRepo } from "../../repositories/printing-images.js";
import { CARD_MEDIA_DIR } from "./paths.js";
import { isValidVariantSuffix, rehostFilesComplete } from "./variants.js";

type PrintingImagesRepo = ReturnType<typeof printingImagesRepo>;

const ORIG_FILE_RE = /^(?<base>.+)-orig\.[^.]+$/u;

export async function clearAllRehosted(
  io: Io,
  repo: PrintingImagesRepo,
): Promise<ClearRehostedResponse> {
  const cleared = await repo.clearAllRehostedUrls();

  // Delete all files in the media/cards directory
  try {
    const entries = await io.fs.readdir(CARD_MEDIA_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const prefixDir = join(CARD_MEDIA_DIR, entry.name);
      const files = await io.fs.readdir(prefixDir);
      for (const file of files) {
        await io.fs.unlink(join(prefixDir, file));
      }
    }
  } catch {
    // Directory doesn't exist — nothing to delete
  }

  return { cleared };
}

/**
 * Strip the variant suffix from a disk filename to get the rehostedUrl prefix.
 * @returns The `/media/cards/{prefix}/{base}` prefix without the variant suffix.
 */
function diskFileToPrefix(dirPrefix: string, file: string): string {
  // Match only the suffix after the LAST dash: `-<variant>.webp` or `-orig.<ext>`.
  // The `[^-.]+` class prevents the suffix from swallowing an internal dash
  // (e.g. `img-1-300w.webp` must become `img-1`, not `img`).
  return `/media/cards/${dirPrefix}/${file.replace(/-(?:orig\.[^.]+|[^-.]+\.webp)$/u, "")}`;
}

/**
 * Extract a human-readable resolution label from a card-image filename.
 * @returns The resolution label (e.g. "orig", "full", "400w", or "other").
 */
function resolveResolutionLabel(filename: string): string {
  if (filename.includes("-orig.")) {
    return "orig";
  }
  if (filename.endsWith("-full.webp")) {
    return "full";
  }
  if (filename.endsWith("-400w.webp")) {
    return "400w";
  }
  return "other";
}

/**
 * Scan the media/cards directory and return per-prefix stats + all file paths grouped by prefix.
 * @returns Disk stats and file listings per prefix directory.
 */
async function scanDisk(io: Io): Promise<{
  stats: RehostStatusDiskStats;
  filesByPrefix: { prefix: string; files: string[] }[];
}> {
  const sets: RehostStatusDiskStats["sets"] = [];
  const filesByPrefix: { prefix: string; files: string[] }[] = [];
  const resByResolution = new Map<string, { bytes: number; fileCount: number }>();
  let totalBytes = 0;

  try {
    const entries = await io.fs.readdir(CARD_MEDIA_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const prefixDir = join(CARD_MEDIA_DIR, entry.name);
      const files = await io.fs.readdir(prefixDir);
      let dirBytes = 0;
      for (const file of files) {
        const info = await io.fs.stat(join(prefixDir, file));
        dirBytes += info.size;
        const resolution = resolveResolutionLabel(file);
        const bucket = resByResolution.get(resolution) ?? { bytes: 0, fileCount: 0 };
        bucket.bytes += info.size;
        bucket.fileCount++;
        resByResolution.set(resolution, bucket);
      }
      sets.push({ setId: entry.name, bytes: dirBytes, fileCount: files.length });
      filesByPrefix.push({ prefix: entry.name, files });
      totalBytes += dirBytes;
    }
  } catch {
    // Directory doesn't exist yet
  }

  const byResolution = [...resByResolution.entries()]
    .map(([resolution, stats]) => ({ resolution, ...stats }))
    .toSorted((a, b) => b.bytes - a.bytes);

  return { stats: { totalBytes, byResolution, sets }, filesByPrefix };
}

export async function getRehostStatus(
  io: Io,
  repo: PrintingImagesRepo,
): Promise<RehostStatusResponse> {
  const [perSet, { stats: disk, filesByPrefix }, knownUrls] = await Promise.all([
    repo.rehostStatusBySet(),
    scanDisk(io),
    repo.allRehostedUrls(),
  ]);

  let total = 0;
  let rehosted = 0;
  const sets = perSet.map((row) => {
    const t = row.total;
    const r = row.rehosted;
    total += t;
    rehosted += r;
    return { setId: row.setId, setName: row.setName, total: t, rehosted: r, external: t - r };
  });

  // Count orphaned files: the DB doesn't know the base UUID, or the filename
  // uses a variant suffix that's no longer in the current SIZES config
  // (e.g. legacy `-300w.webp` stragglers after a resolution change). Also
  // add stale duplicate `-orig.*` archives — when multiple origs exist for
  // the same base (from an upstream format change), cleanup keeps the newest
  // so `(count - 1)` of them are orphans per base.
  const knownPrefixes = new Set(knownUrls);
  let orphanedFiles = 0;
  for (const { prefix, files } of filesByPrefix) {
    for (const file of files) {
      if (!isValidVariantSuffix(file) || !knownPrefixes.has(diskFileToPrefix(prefix, file))) {
        orphanedFiles++;
      }
    }
    const origCountByBase = new Map<string, number>();
    for (const file of files) {
      const match = ORIG_FILE_RE.exec(file);
      if (match) {
        origCountByBase.set(match[1], (origCountByBase.get(match[1]) ?? 0) + 1);
      }
    }
    for (const count of origCountByBase.values()) {
      if (count > 1) {
        orphanedFiles += count - 1;
      }
    }
  }

  return { total, rehosted, external: total - rehosted, orphanedFiles, sets, disk };
}

/**
 * Identify stale duplicate `{base}-orig.*` files in a directory — when more
 * than one orig archive exists for the same base (e.g. both `-orig.png` and
 * `-orig.webp`, left over when the upstream content type changed between
 * rehost runs), keep the newest by mtime and return the rest for deletion.
 * @returns Filenames that should be removed.
 */
async function findDuplicateOrigs(
  io: Io,
  prefixDir: string,
  files: string[],
): Promise<Set<string>> {
  const byBase = new Map<string, { file: string; mtime: number }[]>();
  for (const file of files) {
    const match = ORIG_FILE_RE.exec(file);
    if (!match) {
      continue;
    }
    const base = match[1];
    const info = await io.fs.stat(join(prefixDir, file));
    const mtime = info.mtime instanceof Date ? info.mtime.getTime() : 0;
    const list = byBase.get(base) ?? [];
    list.push({ file, mtime });
    byBase.set(base, list);
  }

  const stale = new Set<string>();
  for (const origs of byBase.values()) {
    if (origs.length <= 1) {
      continue;
    }
    origs.sort((a, b) => b.mtime - a.mtime); // newest first
    for (let i = 1; i < origs.length; i++) {
      stale.add(origs[i].file);
    }
  }
  return stale;
}

/**
 * Delete files in the media/cards directory that are no longer valid. A file
 * is considered orphaned if its base UUID has no matching rehostedUrl in the
 * DB, if its variant suffix is not in the current SIZES config (e.g. legacy
 * `-300w.webp` after a resolution change), or if it is a stale duplicate
 * `-orig.*` (another orig with a different extension exists and is newer).
 * This is the one place users can reach for to sweep stale files, so
 * regenerate no longer needs to touch them.
 * @returns Counts of scanned files, deleted files, and any errors.
 */
export async function cleanupOrphanedFiles(
  io: Io,
  repo: PrintingImagesRepo,
): Promise<CleanupOrphanedResponse> {
  const progress: CleanupOrphanedResponse = { scanned: 0, deleted: 0, errors: [] };

  const [knownUrls, { filesByPrefix }] = await Promise.all([repo.allRehostedUrls(), scanDisk(io)]);
  const knownPrefixes = new Set(knownUrls);

  for (const { prefix, files } of filesByPrefix) {
    const prefixDir = join(CARD_MEDIA_DIR, prefix);
    const staleDuplicateOrigs = await findDuplicateOrigs(io, prefixDir, files);

    for (const file of files) {
      progress.scanned++;
      const orphaned =
        !isValidVariantSuffix(file) ||
        !knownPrefixes.has(diskFileToPrefix(prefix, file)) ||
        staleDuplicateOrigs.has(file);
      if (orphaned) {
        try {
          await io.fs.unlink(join(prefixDir, file));
          progress.deleted++;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          progress.errors.push(`${prefix}/${file}: ${message}`);
        }
      }
    }
  }

  return progress;
}

/**
 * Find all rehosted card images with missing files on disk. An image is
 * considered broken if its `-orig.*` archive is missing OR any current
 * `-{SIZES.suffix}.webp` variant is missing. This also catches images left
 * over from earlier resolution changes where the orig was never preserved.
 * @returns The total rehosted count and the list of entries with missing files.
 */
export async function findBrokenImages(
  io: Io,
  repo: PrintingImagesRepo,
): Promise<BrokenImagesResponse> {
  const images = await repo.listAllRehostedWithContext();
  const broken: BrokenImagesResponse["broken"] = [];

  for (const img of images) {
    const relPath = img.rehostedUrl.replace(/^\/media\/cards\//u, "");
    const dir = join(CARD_MEDIA_DIR, relPath.split("/").slice(0, -1).join("/"));
    const fileBase = relPath.split("/").pop() as string;
    const complete = await rehostFilesComplete(io, dir, fileBase);
    if (!complete) {
      broken.push({
        imageId: img.imageId,
        rehostedUrl: img.rehostedUrl,
        originalUrl: img.originalUrl,
        cardSlug: img.cardSlug,
        cardName: img.cardName,
        printingShortCode: img.printingShortCode,
        setSlug: img.setSlug,
      });
    }
  }

  return { total: images.length, broken };
}

// Images whose source short edge is below this are flagged as low-res.
// The -full.webp variant is short-edge capped at 800; anything below 400
// means the source was genuinely small (below our grid thumbnail size).
const LOW_RES_SHORT_EDGE_THRESHOLD = 400;

/**
 * Find all rehosted card images whose source short edge is below a threshold.
 * Reads the `-full.webp` file (short-edge capped at 800) and checks its
 * shorter dimension — orientation-agnostic.
 * @returns The total rehosted count and the list of low-resolution entries.
 */
export async function findLowResImages(
  io: Io,
  repo: PrintingImagesRepo,
): Promise<LowResImagesResponse> {
  const images = await repo.listAllRehostedWithContext();
  const lowRes: LowResImagesResponse["lowRes"] = [];

  for (const img of images) {
    const relPath = img.rehostedUrl.replace(/^\/media\/cards\//u, "");
    const dir = join(CARD_MEDIA_DIR, relPath.split("/").slice(0, -1).join("/"));
    const fileBase = relPath.split("/").pop() as string;
    const fullPath = join(dir, `${fileBase}-full.webp`);

    try {
      const metadata = await io.sharp(await io.fs.readFile(fullPath)).metadata();
      const width = metadata.width ?? 0;
      const height = metadata.height ?? 0;
      const shortEdge = Math.min(width, height);
      if (shortEdge > 0 && shortEdge < LOW_RES_SHORT_EDGE_THRESHOLD) {
        lowRes.push({
          imageId: img.imageId,
          rehostedUrl: img.rehostedUrl,
          originalUrl: img.originalUrl,
          cardSlug: img.cardSlug,
          cardName: img.cardName,
          printingShortCode: img.printingShortCode,
          setSlug: img.setSlug,
          width,
          height,
        });
      }
    } catch {
      // File missing or unreadable — skip (handled by broken-images check)
    }
  }

  return { total: images.length, lowRes };
}

/**
 * Migrate files from old set-slug directory structure to UUID-prefix structure.
 * Moves files from `media/cards/{setSlug}/{uuid}-*` to `media/cards/{last2chars}/{uuid}-*`.
 * Only processes directories that are NOT 2-char hex prefixes (i.e., old set-slug dirs).
 * @returns Counts of scanned, moved, skipped, and failed files.
 */
export async function migrateImageDirectories(io: Io): Promise<{
  scanned: number;
  moved: number;
  skipped: number;
  failed: number;
  errors: string[];
}> {
  const progress = { scanned: 0, moved: 0, skipped: 0, failed: 0, errors: [] as string[] };

  let entries: { name: string; isDirectory: () => boolean }[];
  try {
    entries = await io.fs.readdir(CARD_MEDIA_DIR, { withFileTypes: true });
  } catch {
    return progress;
  }

  const isHexPrefix = (name: string) => /^[0-9a-f]{2}$/iu.test(name);
  const oldDirs = entries.filter((e) => e.isDirectory() && !isHexPrefix(e.name));

  for (const dir of oldDirs) {
    const oldDir = join(CARD_MEDIA_DIR, dir.name);
    let files: string[];
    try {
      files = await io.fs.readdir(oldDir);
    } catch {
      continue;
    }

    for (const file of files) {
      progress.scanned++;
      const uuidMatch = file.match(
        /^(?<uuid>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-/iu,
      );
      if (!uuidMatch) {
        progress.skipped++;
        continue;
      }

      const newPrefix = uuidMatch[1].slice(-2);
      const newDir = join(CARD_MEDIA_DIR, newPrefix);

      try {
        await io.fs.mkdir(newDir, { recursive: true });
        await io.fs.rename(join(oldDir, file), join(newDir, file));
        progress.moved++;
      } catch (error) {
        progress.failed++;
        const message = error instanceof Error ? error.message : String(error);
        progress.errors.push(`${dir.name}/${file}: ${message}`);
      }
    }
  }

  return progress;
}
