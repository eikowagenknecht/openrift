// oxlint-disable-next-line import/no-nodejs-modules -- server-side file needs filesystem access
import { existsSync } from "node:fs";
// oxlint-disable-next-line import/no-nodejs-modules -- server-side file needs filesystem access
import { dirname, join } from "node:path";

export function imageRehostedUrl(imageId: string): string {
  return `/media/cards/${imageId.slice(-2)}/${imageId}`;
}

function findProjectRoot(): string {
  const start = import.meta.dirname;
  if (!start) {
    throw new Error("import.meta.dirname is not available");
  }
  for (let dir = start; dir !== dirname(dir); dir = dirname(dir)) {
    if (existsSync(join(dir, "bun.lock"))) {
      return dir;
    }
  }
  throw new Error("Could not find project root (no bun.lock found)");
}

export const MEDIA_DIR = join(findProjectRoot(), "media");
export const CARD_MEDIA_DIR = join(MEDIA_DIR, "cards");
