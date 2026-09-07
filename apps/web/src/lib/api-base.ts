import { PREVIEW_HOSTS as RAW_PREVIEW_HOSTS } from "./env";

const PREVIEW_HOSTS = RAW_PREVIEW_HOSTS.split(",").filter(Boolean);

export function isPreview(): boolean {
  if (globalThis.window === undefined) {
    return false;
  }
  return PREVIEW_HOSTS.some((h) => location.hostname.endsWith(h));
}
