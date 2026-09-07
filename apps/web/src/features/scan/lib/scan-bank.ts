import type { EmbedBank } from "@openrift/shared/scan/embed";
import { decodeEmbedBank } from "@openrift/shared/scan/embed-format";
import type { CardLabels } from "@openrift/shared/scan/labels";
import { WellKnown } from "@openrift/shared/well-known";

import { scanAssetError } from "@/features/scan/lib/scan-asset-hint";

export interface LoadedScanBank {
  bank: EmbedBank;
  artKeys: Map<string, string>;
  labels: CardLabels;
  bytes: number;
  canonical: boolean;
}

let cached: Promise<LoadedScanBank> | null = null;

/** media/scan/{bank,labels} are published by the bank rebuild job and are not committed. */
export async function loadScanBank(bankUrl: string, labelsUrl: string): Promise<LoadedScanBank> {
  cached ??= (async () => {
    const [bankResponse, labelResponse] = await Promise.all([fetch(bankUrl), fetch(labelsUrl)]);
    if (!bankResponse.ok) {
      throw new Error(scanAssetError("the scan bank", bankUrl));
    }
    const buffer = await bankResponse.arrayBuffer();
    const labels = labelResponse.ok ? ((await labelResponse.json()) as CardLabels) : {};
    const { bank, artKeys, canonical } = decodeEmbedBank(buffer);
    return { bank, artKeys, labels, bytes: buffer.byteLength, canonical };
  })();
  try {
    return await cached;
  } catch (error) {
    cached = null;
    throw error;
  }
}

export function describeKey(labels: CardLabels, key: string): string {
  const label = labels[key];
  return label ? `${label.name} (${label.code} ${label.language})` : `unknown ${key.slice(0, 8)}`;
}

/** Scan surfaces only have bank labels, not catalogue printings, so the label's type is the orientation source. */
export function isLandscapeKey(labels: CardLabels, key: string): boolean {
  return labels[key]?.type === WellKnown.cardType.BATTLEFIELD;
}
