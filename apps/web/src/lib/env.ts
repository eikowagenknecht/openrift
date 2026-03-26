/**
 * Centralized environment access.
 *
 * Vite exposes `import.meta.env.*` at compile-time. TanStack Start (via Vinxi)
 * will use a different mechanism on the server. Centralizing access here makes
 * it trivial to swap the source later without hunting through the codebase.
 */

/** true when running the production build. */
export const PROD = import.meta.env.PROD;

/** Comma-separated hostname suffixes that identify preview deployments. */
export const PREVIEW_HOSTS = import.meta.env.VITE_PREVIEW_HOSTS ?? "";

/** Short git commit hash injected at build time. */
export const COMMIT_HASH: string = __COMMIT_HASH__;
