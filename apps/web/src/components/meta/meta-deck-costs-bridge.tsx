import { useEffect } from "react";

import { useMetaDeckCosts } from "@/hooks/use-meta-deck-costs";
import type { MetaDeckCost } from "@/lib/meta-deck-collection";
import type { MetaDateRange } from "@/lib/meta-scope";

/**
 * Client-only: the copies live query has no server snapshot, and the catalog
 * needed to match printings to cards is not otherwise loaded on this page.
 * Mount under `useHydrated` and a Suspense boundary.
 */
export function MetaDeckCostsBridge({
  includeSideboard,
  withCollection,
  range,
  onChange,
}: {
  includeSideboard: boolean;
  withCollection: boolean;
  range?: MetaDateRange;
  onChange: (value: ReadonlyMap<string, MetaDeckCost> | undefined) => void;
}) {
  const costs = useMetaDeckCosts(includeSideboard, { withCollection, range });
  useEffect(() => {
    onChange(costs);
  }, [costs, onChange]);
  return null;
}
