import type { DeckZone } from "@openrift/shared";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";

interface EnumRow {
  slug: string;
  label: string;
  sortOrder: number;
  isWellKnown: boolean;
}

export const enumsQueryOptions = queryOptions({
  queryKey: queryKeys.enums.all,
  queryFn: async () => {
    const res = await client.api.v1.enums.$get();
    assertOk(res);
    return await res.json();
  },
  staleTime: 5 * 60 * 1000,
  refetchOnWindowFocus: false,
});

/**
 * Returns deck zones sorted by their database sort_order.
 *
 * @returns Ordered array of DeckZone slugs and a label lookup map.
 */
export function useZoneOrder(): {
  zoneOrder: DeckZone[];
  zoneLabels: Record<DeckZone, string>;
} {
  const { data } = useSuspenseQuery(enumsQueryOptions);
  const zones = (data as Record<string, EnumRow[]>).deckZones ?? [];
  const sorted = zones.toSorted((a, b) => a.sortOrder - b.sortOrder);
  return {
    zoneOrder: sorted.map((zone) => zone.slug as DeckZone),
    zoneLabels: Object.fromEntries(sorted.map((zone) => [zone.slug, zone.label])) as Record<
      DeckZone,
      string
    >,
  };
}
