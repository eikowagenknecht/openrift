import { useQuery } from "@tanstack/react-query";

import { useRequiredUserId } from "@/lib/auth-session";
import { collectionsQueryOptions } from "@/lib/collections-query";
import type { ResolvedTradeAddTarget } from "@/lib/trade-add-target";
import { resolveTradeAddTarget } from "@/lib/trade-add-target";
import { useTradeAddTargetStore } from "@/stores/trade-add-target-store";

/**
 * Where the Trades page's one-press add files incoming copies: the collection
 * the viewer last picked, or the inbox until they pick one. A plain (non
 * suspense) collections query, so a row renders its label straight away and
 * corrects it once the collections arrive.
 * @returns The resolved target and its button label.
 */
export function useTradeAddTarget(): ResolvedTradeAddTarget {
  const userId = useRequiredUserId();
  const remembered = useTradeAddTargetStore((state) => state.target);
  const { data: collections } = useQuery(collectionsQueryOptions(userId));
  return resolveTradeAddTarget(remembered, collections);
}
