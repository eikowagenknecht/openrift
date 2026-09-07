import type { CardStatLabels } from "@openrift/shared/card-stat-line";
import { labelMap } from "@openrift/shared/utils";

import type { Repos } from "../../../deps.js";
import type { CardLookupIndex } from "../../catalog/services/card-lookup-index.js";
import { createCardLookupIndexLoader } from "../../catalog/services/card-lookup-index.js";
import { createContentAddressedCache } from "../../catalog/services/catalog-assembly.js";

export interface ChatCardIndex {
  index: CardLookupIndex;
  labels: CardStatLabels;
}

/**
 * Labels get their own memo because they invalidate on a different probe
 * than the shared card index (a renamed type label changes no card).
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
