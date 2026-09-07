// The deployment environment, shared by the API, the SSR server, and the
// browser client so all three report the same value to Sentry (and anywhere
// else env-specific behavior is needed). Kept dependency-free so the SSR
// bootstrap (instrument.server.mjs) and the client bundle can import it
// without dragging in the rest of @openrift/shared.

export const APP_ENVS = ["development", "preview", "production"] as const;

export type AppEnv = (typeof APP_ENVS)[number];

/** Falls back to `"development"` for any unrecognized or missing value. */
export function parseAppEnv(value: string | undefined): AppEnv {
  return (APP_ENVS as readonly string[]).includes(value ?? "") ? (value as AppEnv) : "development";
}
