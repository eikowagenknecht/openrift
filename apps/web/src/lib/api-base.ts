import { PREVIEW_HOSTS as RAW_PREVIEW_HOSTS } from "./env";

/**
 * Preview deployments are detected by matching VITE_PREVIEW_HOSTS
 * (comma-separated suffix patterns like ".preview.openrift.app").
 */
const PREVIEW_HOSTS = RAW_PREVIEW_HOSTS.split(",").filter(Boolean);

/**
 * SSR-safe: only evaluates `location` in the browser.
 * @returns Whether the current host is a preview deployment.
 */
export function isPreview(): boolean {
  if (globalThis.window === undefined) {
    return false;
  }
  return PREVIEW_HOSTS.some((h) => location.hostname.endsWith(h));
}
