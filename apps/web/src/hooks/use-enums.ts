import type { DeckZone, EnumOrders } from "@openrift/shared";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";

interface EnumRow {
  slug: string;
  label: string;
  sortOrder: number;
}

/** Label lookup maps for enums that need display labels in the UI. */
export interface EnumLabels {
  finishes: Record<string, string>;
  rarities: Record<string, string>;
  domains: Record<string, string>;
  cardTypes: Record<string, string>;
  superTypes: Record<string, string>;
  artVariants: Record<string, string>;
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
function sorted(rows: EnumRow[]): EnumRow[] {
  return rows.toSorted((a, b) => a.sortOrder - b.sortOrder);
}

function slugs(rows: EnumRow[]): string[] {
  return sorted(rows).map((row) => row.slug);
}

function labelMap(rows: EnumRow[]): Record<string, string> {
  return Object.fromEntries(sorted(rows).map((row) => [row.slug, row.label]));
}

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
  const s = sorted(zones);
  return {
    zoneOrder: s.map((zone) => zone.slug as DeckZone),
    zoneLabels: Object.fromEntries(s.map((zone) => [zone.slug, zone.label])) as Record<
      DeckZone,
      string
    >,
  };
}

/**
 * Returns DB-derived sort orders and display labels for all game-data enums.
 * Use this instead of hardcoded *_ORDER arrays and *_LABELS maps.
 *
 * @returns Sort orders and label maps derived from the /api/enums endpoint.
 */
export function useEnumOrders(): {
  orders: EnumOrders;
  labels: EnumLabels;
} {
  const { data } = useSuspenseQuery(enumsQueryOptions);
  const d = data as Record<string, EnumRow[]>;
  return {
    orders: {
      finishes: slugs(d.finishes ?? []),
      rarities: slugs(d.rarities ?? []),
      domains: slugs(d.domains ?? []),
      cardTypes: slugs(d.cardTypes ?? []),
      superTypes: slugs(d.superTypes ?? []),
      artVariants: slugs(d.artVariants ?? []),
    },
    labels: {
      finishes: labelMap(d.finishes ?? []),
      rarities: labelMap(d.rarities ?? []),
      domains: labelMap(d.domains ?? []),
      cardTypes: labelMap(d.cardTypes ?? []),
      superTypes: labelMap(d.superTypes ?? []),
      artVariants: labelMap(d.artVariants ?? []),
    },
  };
}
