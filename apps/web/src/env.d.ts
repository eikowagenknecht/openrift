declare const __COMMIT_HASH__: string;

interface ImportMetaEnv {
  /** Comma-separated hostname suffixes that identify preview deployments (e.g. ".workers.dev") */
  readonly VITE_PREVIEW_HOSTS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.md?raw" {
  const content: string;
  export default content;
}
