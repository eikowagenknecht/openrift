/**
 * Failure message for the scanner's downloadable assets.
 *
 * Every asset comes from one place, the serving manifest, which names
 * content-hashed files under `media/scan` (`routes/public/scan.ts`). Dev and
 * production resolve them identically, so a download failure always means the
 * same thing: the manifest names a generation the media directory does not
 * have.
 *
 * That is not hypothetical. Restoring the local database from a production
 * dump carries production's `scan_index` row, which names a bank generation
 * that only exists in production's media directory, and the manifest then
 * points at a file the local server cannot serve.
 */

/**
 * Compose the download-failure message for a named scanner asset.
 *
 * @returns The message, carrying the URL and how to put the file back.
 */
export function scanAssetError(what: string, url: string): string {
  return `could not load ${what} from ${url} (the manifest names a generation that is missing from media/scan, so rebuild the bank from /admin/scan or copy it from production)`;
}
