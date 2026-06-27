// The deployment environment, shared by the API, the SSR server, and the
// browser client so all three report the same value to Sentry (and anywhere
// else env-specific behavior is needed). Kept dependency-free so the SSR
// bootstrap (instrument.server.mjs) and the client bundle can import it
// without dragging in the rest of @openrift/shared.

/** The valid deployment environments, in increasing order of "realness". */
export const APP_ENVS = ["development", "preview", "production"] as const;

/** A validated deployment environment. */
export type AppEnv = (typeof APP_ENVS)[number];

/**
 * Normalize an arbitrary `APP_ENV` value (env var, untrusted runtime config)
 * to a known {@link AppEnv}. Anything unrecognized — including `undefined` —
 * falls back to `"development"`, the safest default (local-dev behavior, no
 * production-only side effects).
 *
 * @returns The matching {@link AppEnv}, or `"development"` when unrecognized.
 */
export function parseAppEnv(value: string | undefined): AppEnv {
  return (APP_ENVS as readonly string[]).includes(value ?? "") ? (value as AppEnv) : "development";
}
