import { DEFAULT_DOMAIN_COLORS } from "@openrift/shared";
import { useSuspenseQuery } from "@tanstack/react-query";

import { initQueryOptions } from "@/hooks/use-init";

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
