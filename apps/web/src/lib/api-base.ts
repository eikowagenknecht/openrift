// Preview deployments (e.g. Cloudflare Workers) have no backend — fall back
// to a shared API via VITE_API_FALLBACK_URL when the hostname matches
// VITE_PREVIEW_HOSTS (comma-separated suffix patterns like ".workers.dev").
const PREVIEW_HOSTS = (import.meta.env.VITE_PREVIEW_HOSTS ?? "").split(",").filter(Boolean);
const API_FALLBACK = import.meta.env.VITE_API_FALLBACK_URL ?? "";

export const IS_PREVIEW = PREVIEW_HOSTS.some((h) => location.hostname.endsWith(h));

export const API_BASE = IS_PREVIEW ? API_FALLBACK : "";
