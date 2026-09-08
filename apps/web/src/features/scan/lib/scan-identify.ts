import type { CardLabels } from "@openrift/shared/scan/labels";

import { describeKey, isLandscapeKey } from "@/features/scan/lib/scan-bank";

export interface IdentifyCandidate {
  key: string;
  artKey: string;
  label: string;
  landscape: boolean;
}

export function toIdentifyCandidates(
  labels: CardLabels,
  candidates: readonly { key: string; artKey: string }[],
): IdentifyCandidate[] {
  return candidates.map((candidate) => ({
    key: candidate.key,
    artKey: candidate.artKey,
    label: describeKey(labels, candidate.key),
    landscape: isLandscapeKey(labels, candidate.key),
  }));
}
