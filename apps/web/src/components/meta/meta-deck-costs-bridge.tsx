import { useEffect } from "react";

import { useMetaDeckCosts } from "@/hooks/use-meta-deck-costs";
import type { MetaDeckCost } from "@/lib/meta-deck-collection";
import type { MetaDateRange } from "@/lib/meta-scope";

/**
 * Prices the archive, and compares it against the reader's collection when
 * asked, only ever on the client: the copies live query has no server snapshot,
 * and the catalog it needs to match printings back to cards is a payload the
 * page otherwise never pulls. Mount it under `useHydrated` and a Suspense
 * boundary.
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
