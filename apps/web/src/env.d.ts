declare const __COMMIT_HASH__: string;

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
declare var __OPENRIFT_CONFIG__: { sentryDsn?: string } | undefined;

declare module "*.md?raw" {
  const content: string;
  export default content;
}
