import { WellKnown } from "@openrift/shared";
import type { EmbedBank } from "@openrift/shared/scan";
import { decodeEmbedBank } from "@openrift/shared/scan";

import { scanAssetError } from "@/lib/scan-asset-hint";

export interface CardLabel {
  name: string;
  code: string;
  language: string;
  /** cards.type — selects the measured text band for printing disambiguation. */
  type?: string;
  /**
   * Serialized marker set ("promo", "" for none) — gates the stamp stage of
   * printing disambiguation. Null (or absent, in labels predating the field)
   * when unknown or when the printings sharing this render disagree.
   */
  markers?: string | null;
}

export interface LoadedScanBank {
  bank: EmbedBank;
  /** Artwork identity per key; printings of one artwork share it. */
  artKeys: Map<string, string>;
  labels: Record<string, CardLabel>;
  bytes: number;
  /**
   * The bank was built in the canonical frame (landscape references rotated
   * 90 degrees left). Guide-mode sessions may then use the pair-only rotation
   * search; native banks must keep the full search.
   */
  canonical: boolean;
}

let cached: Promise<LoadedScanBank> | null = null;

/**
 * Fetch the precomputed embedding bank and its label table.
 *
 * Both files are published under `media/scan` by the bank rebuild job and are
 * not committed, so a media directory without them leaves the scan page
 * unavailable. Matching happens entirely on the device: the whole catalogue's
 * embeddings are about 2.3 MB, far cheaper to send once than a round trip per
 * frame.
 *
 * @returns The decoded bank, cached for the lifetime of the page.
 */
export async function loadScanBank(bankUrl: string, labelsUrl: string): Promise<LoadedScanBank> {
  cached ??= (async () => {
    const [bankResponse, labelResponse] = await Promise.all([fetch(bankUrl), fetch(labelsUrl)]);
    if (!bankResponse.ok) {
      throw new Error(scanAssetError("the scan bank", bankUrl));
    }
    const buffer = await bankResponse.arrayBuffer();
    const labels = labelResponse.ok
      ? ((await labelResponse.json()) as Record<string, CardLabel>)
      : {};
    const { bank, artKeys, canonical } = decodeEmbedBank(buffer);
    return { bank, artKeys, labels, bytes: buffer.byteLength, canonical };
  })();
  try {
    return await cached;
  } catch (error) {
    // A failed download must not poison the page until reload: clear the slot
    // so the next mount retries.
    cached = null;
    throw error;
  }
}

/**
 * Human-readable name for a matched key.
 *
 * @returns The card name and printing code, or a short key when unlabelled.
 */
export function describeKey(labels: Record<string, CardLabel>, key: string): string {
  const label = labels[key];
  return label ? `${label.name} (${label.code} ${label.language})` : `unknown ${key.slice(0, 8)}`;
}

/**
 * Whether a matched key's artwork is stored landscape (Battlefields), so a
 * thumbnail can rotate it into the portrait frame the way the rest of the app
 * does. The scan surfaces only have bank labels, not catalogue printings, so
 * the card type on the label is the orientation source here.
 *
 * @returns True for a Battlefield key, false for everything else and for keys
 * with no label.
 */
export function isLandscapeKey(labels: Record<string, CardLabel>, key: string): boolean {
  return labels[key]?.type === WellKnown.cardType.BATTLEFIELD;
}
