// Preview deployments (e.g. Cloudflare Workers) are detected by matching
// VITE_PREVIEW_HOSTS (comma-separated suffix patterns like ".workers.dev").
// The Workers script proxies /api/* to the backend, so all requests are
// same-origin — no cross-origin cookie issues on mobile browsers.
const PREVIEW_HOSTS = (import.meta.env.VITE_PREVIEW_HOSTS ?? "").split(",").filter(Boolean);

export const IS_PREVIEW = PREVIEW_HOSTS.some((h) => location.hostname.endsWith(h));
