import type { CardStatLabels } from "@openrift/shared";
import { labelMap } from "@openrift/shared";

import type { Repos } from "../deps.js";
import type { CardLookupIndex } from "./card-lookup-index.js";
import { createCardLookupIndexLoader } from "./card-lookup-index.js";
import { createContentAddressedCache } from "./catalog-assembly.js";

export interface ChatCardIndex {
  index: CardLookupIndex;
  labels: CardStatLabels;
}

/**
 * The chat lookup: the shared server-side card index plus the enum labels the
 * one-line answer renders.
 *
 * The index itself is {@link createCardLookupIndexLoader}'s, so a name that
 * resolves in deck-check resolves here too. Only the labels are chat's own,
 * which is why this keeps its own memo: they turn over on a different probe
 * (a renamed type label changes no card).
 *
 * @returns A zero-arg loader serving the memoized index and labels.
 */
export function createChatCardIndexLoader(repos: Repos): () => Promise<ChatCardIndex> {
  const loadIndex = createCardLookupIndexLoader(repos);
  const loadLabels = createContentAddressedCache(
    async () => {
      const enums = await repos.enums.all();
      return {
        cardTypes: labelMap(enums.cardTypes),
        superTypes: labelMap(enums.superTypes),
        domains: labelMap(enums.domains),
      };
    },
    () => repos.enums.contentVersion(),
  );

  return async () => {
    const [index, labels] = await Promise.all([loadIndex(), loadLabels()]);
    return { index, labels };
  };
}
