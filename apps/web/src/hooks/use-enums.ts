import type { DeckZone, EnumOrders } from "@openrift/shared";
import { useSuspenseQuery } from "@tanstack/react-query";

import { initQueryOptions } from "@/hooks/use-init";

interface EnumRow {
  slug: string;
  label: string;
  sortOrder: number;
}

interface DomainEnumRow extends EnumRow {
  color: string | null;
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
  const { data } = useSuspenseQuery(initQueryOptions);
  const zones = data.enums.deckZones ?? [];
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
 * Returns a code-to-name lookup map for languages from the /init endpoint.
 *
 * @returns A Record mapping language codes (e.g. "EN") to display names (e.g. "English").
 */
export function useLanguageLabels(): Record<string, string> {
  const { data } = useSuspenseQuery(initQueryOptions);
  return labelMap(data.enums.languages ?? []);
}

/**
 * Returns DB-derived sort orders and display labels for all game-data enums.
 * Use this instead of hardcoded *_ORDER arrays and *_LABELS maps.
 *
 * @returns Sort orders, label maps, and domain colors derived from the /api/init endpoint.
 */
export function useEnumOrders(): {
  orders: EnumOrders;
  labels: EnumLabels;
  domainColors: Record<string, string>;
} {
  const { data } = useSuspenseQuery(initQueryOptions);
  const d = data.enums as Record<string, EnumRow[]>;
  const domainRows = (d.domains ?? []) as DomainEnumRow[];
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
    domainColors: Object.fromEntries(
      domainRows
        .filter((row) => row.color !== null && row.color !== undefined)
        .map((row) => [row.slug, row.color as string]),
    ),
  };
}
