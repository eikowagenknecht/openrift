declare const __COMMIT_HASH__: string;

interface ImportMetaEnv {
  /** Comma-separated hostname suffixes that trigger the fallback API (e.g. ".workers.dev") */
  readonly VITE_PREVIEW_HOSTS?: string;
  /** API base URL for preview deployments without a backend (e.g. "https://preview.openrift.app") */
  readonly VITE_API_FALLBACK_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.md?raw" {
  const content: string;
  export default content;
}
