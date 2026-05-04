import type { DeckZone, EnumOrders } from "@openrift/shared";
import { useSuspenseQuery } from "@tanstack/react-query";

import { initQueryOptions } from "@/hooks/use-init";

interface EnumRow {
  slug: string;
  label: string;
  sortOrder: number;
}

interface ColoredEnumRow extends EnumRow {
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
 * Returns ordered language rows from the /init endpoint, shaped as
 * `{ code, name }` for UI components that need both the identifier and label.
 *
 * @returns An ordered array of `{ code, name }` language entries.
 */
export function useLanguageList(): { code: string; name: string }[] {
  const { data } = useSuspenseQuery(initQueryOptions);
  return sorted(data.enums.languages ?? []).map((row) => ({ code: row.slug, name: row.label }));
}

export interface MarkerListEntry {
  slug: string;
  label: string;
  description: string | null;
}

/**
 * Returns ordered marker rows from the /init endpoint, including descriptions.
 *
 * @returns An ordered array of `{ slug, label, description }` marker entries.
 */
export function useMarkerList(): MarkerListEntry[] {
  const { data } = useSuspenseQuery(initQueryOptions);
  const rows = (data.enums.markers ?? []).toSorted((a, b) => a.sortOrder - b.sortOrder);
  return rows.map((row) => ({ slug: row.slug, label: row.label, description: row.description }));
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
  rarityColors: Record<string, string>;
} {
  const { data } = useSuspenseQuery(initQueryOptions);
  const d = data.enums as Record<string, EnumRow[]>;
  const domainRows = (d.domains ?? []) as ColoredEnumRow[];
  const rarityRows = (d.rarities ?? []) as ColoredEnumRow[];
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
    rarityColors: Object.fromEntries(
      rarityRows
        .filter((row) => row.color !== null && row.color !== undefined)
        .map((row) => [row.slug, row.color as string]),
    ),
  };
}
