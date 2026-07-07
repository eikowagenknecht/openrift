declare const __COMMIT_HASH__: string;
/**
 * Dev-only origin for Electric shape requests (the vite dev API proxy target,
 * e.g. "http://localhost:3000"). Empty string in production builds, meaning
 * shapes stay same-origin. See lib/electric-origin.ts for why.
 */
declare const __ELECTRIC_SHAPE_ORIGIN__: string;

interface ImportMetaEnv {
  /** Comma-separated hostname suffixes that identify preview deployments (e.g. ".workers.dev") */
  readonly VITE_PREVIEW_HOSTS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Runtime config inlined by the SSR shell from web-scoped site_settings.
 * Available before hydration so `initSentry()` can read the DSN at script-load time.
 */
// oxlint-disable-next-line no-var, vars-on-top -- `declare var` is the documented way to type a `globalThis` property
declare var __OPENRIFT_CONFIG__: { sentryDsn?: string; appEnv?: string } | undefined;

declare module "*.md?raw" {
  const content: string;
  export default content;
}
