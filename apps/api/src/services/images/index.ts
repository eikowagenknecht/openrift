/**
 * Card-image pipeline. Split by concern:
 *
 * - `paths.ts` — media directory roots and the canonical rehosted URL
 * - `download.ts` — SSRF-guarded fetch of a user-supplied source URL
 * - `scan-analysis.ts` — pure pixel math over a greyscale scan (no IO)
 * - `variants.ts` — the on-disk orig + WebP variant pipeline
 * - `jobs.ts` — the rehost / regenerate / un-rehost batch runners
 * - `maintenance.ts` — disk audit: status, cleanup, broken and low-res finders
 *
 * This barrel is the entry point for the admin routes, which reach across
 * several of those. Narrow consumers (a single constant, a single helper)
 * import the module directly instead.
 */
export { downloadImage } from "./download.js";
export {
  REGENERATE_IMAGES_KIND,
  isRegenerateCheckpoint,
  rehostImageFile,
  rehostImages,
  rehostSingleImage,
  runRegenerateImagesJob,
  unrehostImages,
} from "./jobs.js";
export {
  cleanupOrphanedFiles,
  clearAllRehosted,
  findBrokenImages,
  findLowResImages,
  getRehostStatus,
  migrateImageDirectories,
} from "./maintenance.js";
export { CARD_MEDIA_DIR, imageRehostedUrl } from "./paths.js";
export { deleteRehostFiles, processAndSave, regenerateFromOrig } from "./variants.js";
