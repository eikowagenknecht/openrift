import { useQuery } from "@tanstack/react-query";

import { collectionsQueryOptions } from "@/features/collections/lib/collections-query";
import type { ResolvedTradeAddTarget } from "@/features/groups/lib/trade-add-target";
import { resolveTradeAddTarget } from "@/features/groups/lib/trade-add-target";
import { useTradeAddTargetStore } from "@/features/groups/stores/trade-add-target-store";
import { useRequiredUserId } from "@/lib/auth-session";

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
