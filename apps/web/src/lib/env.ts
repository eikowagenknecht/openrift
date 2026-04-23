/**
 * Centralized environment access (client-safe).
 *
 * Vite exposes `import.meta.env.*` at compile-time. Only `VITE_*`-prefixed vars
 * are included in the client bundle. This file is imported client-side, so it
 * must only reference `VITE_*` vars or Vite built-ins like `import.meta.env.PROD`.
 *
 * For server-only vars (e.g. `API_INTERNAL_URL`), use `process.env.*` directly
 * in server functions. Do not add them here.
 */

/** true when running the production build. */
export const PROD = import.meta.env.PROD;

/** Comma-separated hostname suffixes that identify preview deployments. */
export const PREVIEW_HOSTS = import.meta.env.VITE_PREVIEW_HOSTS ?? "";

/** Short git commit hash injected at build time. */
export const COMMIT_HASH: string = __COMMIT_HASH__;
