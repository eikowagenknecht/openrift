// Share images are served with a long immutable cache keyed by URL, so the `?v=`
// version must change whenever the underlying content changes.

import type { ShareImageQuery } from "@openrift/shared";
import { shareImageQueryParams } from "@openrift/shared";

const API_BASE = "/api/v1";

function withParams(base: string, params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return base;
  }
  const query = entries.map(([key, value]) => `${key}=${value}`).join("&");
  return `${base}${base.includes("?") ? "&" : "?"}${query}`;
}

export function shareImageVersion(isoTimestamp: string | undefined): number {
  if (!isoTimestamp) {
    return 0;
  }
  const epochMs = new Date(isoTimestamp).getTime();
  return Number.isNaN(epochMs) ? 0 : epochMs;
}

export function listShareImageUrl(siteUrl: string, shareToken: string, version: number): string {
  return `${siteUrl}${API_BASE}/lists/share/${shareToken}/image.png?v=${version}`;
}

export type ShareImageOptions = Pick<ShareImageQuery, "size" | "aspect" | "qr">;

export function listOwnerImageUrl(
  siteUrl: string,
  listId: string,
  version: number,
  options: ShareImageOptions = {},
): string {
  return withParams(
    `${siteUrl}${API_BASE}/lists/${listId}/image.png?v=${version}`,
    shareImageQueryParams(options),
  );
}

export function collectionOwnerImageUrl(
  siteUrl: string,
  collectionId: string,
  options: ShareImageOptions = {},
): string {
  return withParams(
    `${siteUrl}${API_BASE}/collections/${collectionId}/image.png`,
    shareImageQueryParams(options),
  );
}

export type DeckImageOptions = ShareImageOptions;

export function deckShareImageUrl(
  siteUrl: string,
  shareToken: string,
  version: number,
  options: DeckImageOptions = {},
): string {
  return withParams(
    `${siteUrl}${API_BASE}/decks/share/${shareToken}/image.png?v=${version}`,
    shareImageQueryParams(options),
  );
}

export function deckOwnerImageUrl(
  siteUrl: string,
  deckId: string,
  options: DeckImageOptions = {},
): string {
  return withParams(
    `${siteUrl}${API_BASE}/decks/${deckId}/image.png`,
    shareImageQueryParams(options),
  );
}

export function deckImageFromCardsUrl(siteUrl: string, options: DeckImageOptions = {}): string {
  return withParams(`${siteUrl}${API_BASE}/decks/image`, shareImageQueryParams(options));
}

export function tierListShareImageUrl(
  siteUrl: string,
  shareToken: string,
  version: number,
  size?: "hq",
): string {
  const base = `${siteUrl}${API_BASE}/tier-lists/share/${shareToken}/image.png?v=${version}`;
  return size === "hq" ? `${base}&size=hq` : base;
}

export type TierListImageOptions = Pick<ShareImageQuery, "aspect" | "scale" | "qr">;

export function tierListOwnerImageUrl(
  siteUrl: string,
  id: string,
  options: TierListImageOptions = {},
): string {
  return withParams(
    `${siteUrl}${API_BASE}/tier-lists/${id}/image.png`,
    shareImageQueryParams(options),
  );
}

export function bundleShareImageUrl(
  siteUrl: string,
  shareToken: string,
  version: number | string,
  options: ShareImageOptions = {},
): string {
  return withParams(
    `${siteUrl}${API_BASE}/users/share/${shareToken}/image.png?v=${version}`,
    shareImageQueryParams(options),
  );
}

// Adding/removing copies does not advance `collections.updatedAt`, so callers pass a
// composite `updatedAt-copyCount` version to keep the cached og:image fresh.
export function collectionShareImageUrl(
  siteUrl: string,
  shareToken: string,
  version: number | string,
): string {
  return `${siteUrl}${API_BASE}/collections/share/${shareToken}/image.png?v=${version}`;
}

// Downloads via fetch + object URL, not `<a download>` on the image URL directly,
// so the chosen filename is honored regardless of cross-origin download-attribute quirks.
export async function downloadImageFromUrl(url: string, filename: string): Promise<void> {
  triggerBlobDownload(await fetchImageBlob(url), filename);
}

export async function fetchImageBlob(url: string): Promise<Blob> {
  return await readImageBlob(await fetch(url));
}

export async function fetchImageBlobFromPost(url: string, body: unknown): Promise<Blob> {
  return await readImageBlob(
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function readImageBlob(response: Response): Promise<Blob> {
  if (!response.ok) {
    throw new Error(`Image request failed: ${response.status}`);
  }
  return await response.blob();
}

export async function downloadImageFromPost(
  url: string,
  body: unknown,
  filename: string,
): Promise<void> {
  triggerBlobDownload(await fetchImageBlobFromPost(url, body), filename);
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}
