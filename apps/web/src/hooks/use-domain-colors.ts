import { useSuspenseQuery } from "@tanstack/react-query";

import { initQueryOptions } from "@/hooks/use-init";
import { DEFAULT_DOMAIN_COLORS } from "@/lib/domain";

/**
 * Returns a slug-to-hex-color map for all domains, derived from the /init endpoint.
 * Falls back to DEFAULT_DOMAIN_COLORS for any domain without a database color.
 *
 * @returns A Record mapping domain slugs to hex color strings.
 */
export function useDomainColors(): Record<string, string> {
  const { data } = useSuspenseQuery(initQueryOptions);
  const colors: Record<string, string> = { ...DEFAULT_DOMAIN_COLORS };
  for (const row of data.enums.domains ?? []) {
    if (row.color) {
      colors[row.slug] = row.color;
    }
  }
  return colors;
}
