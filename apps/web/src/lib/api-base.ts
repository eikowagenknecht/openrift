import { PREVIEW_HOSTS as RAW_PREVIEW_HOSTS } from "./env";

// Preview deployments (e.g. Cloudflare Workers) are detected by matching
// VITE_PREVIEW_HOSTS (comma-separated suffix patterns like ".workers.dev").
// The Workers script proxies /api/* to the backend, so all requests are
// same-origin — no cross-origin cookie issues on mobile browsers.
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
