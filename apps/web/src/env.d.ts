interface ImportMetaEnv {
  /** Comma-separated hostname suffixes that identify preview deployments (e.g. ".workers.dev") */
  readonly VITE_PREVIEW_HOSTS?: string;
  /** Short git commit hash injected at build time. */
  readonly VITE_COMMIT_HASH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.md?raw" {
  const content: string;
  export default content;
}
