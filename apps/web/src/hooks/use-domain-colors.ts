import { useSuspenseQuery } from "@tanstack/react-query";

import { DEFAULT_DOMAIN_COLORS } from "@/lib/domain";

import { enumsQueryOptions } from "./use-enums";

interface DomainEnumRow {
  slug: string;
  color?: string | null;
}

/**
 * Returns a slug-to-hex-color map for all domains, derived from the /enums endpoint.
 * Falls back to DEFAULT_DOMAIN_COLORS for any domain without a database color.
 *
 * @returns A Record mapping domain slugs to hex color strings.
 */
export function useDomainColors(): Record<string, string> {
  const { data } = useSuspenseQuery(enumsQueryOptions);
  const domainRows = ((data as Record<string, DomainEnumRow[]>).domains ?? []) as DomainEnumRow[];
  const colors: Record<string, string> = { ...DEFAULT_DOMAIN_COLORS };
  for (const row of domainRows) {
    if (row.color) {
      colors[row.slug] = row.color;
    }
  }
  return colors;
}
