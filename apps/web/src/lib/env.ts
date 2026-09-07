/**
 * Client-safe environment access. Only `VITE_*`-prefixed vars are included
 * in the client bundle. Server-only vars go through `process.env.*` in
 * server functions.
 */

export const PROD = import.meta.env.PROD;

/** Comma-separated hostname suffixes. */
export const PREVIEW_HOSTS = import.meta.env.VITE_PREVIEW_HOSTS ?? "";

export const COMMIT_HASH: string = __COMMIT_HASH__;
