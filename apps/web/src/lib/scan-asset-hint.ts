/**
 * A download failure always means the manifest names a generation the media
 * directory does not have (e.g. after restoring a DB dump from production,
 * whose `scan_index` row names a generation only production's media has).
 */
export function scanAssetError(what: string, url: string): string {
  return `could not load ${what} from ${url} (the manifest names a generation that is missing from media/scan, so rebuild the bank from /admin/scan or copy it from production)`;
}
