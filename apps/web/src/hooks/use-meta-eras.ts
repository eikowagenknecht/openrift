import { useSuspenseQuery } from "@tanstack/react-query";

import { publicSetListQueryOptions } from "@/hooks/use-public-sets";
import type { MetaEra } from "@/lib/meta-scope";
import { deriveSetEras } from "@/lib/meta-scope";

/**
 * The eras the scope bar offers, newest first. Derived from the set list rather
 * than stored, so a new set opens its own era the day it releases.
 */
export function useMetaEras(): MetaEra[] {
  const { data } = useSuspenseQuery(publicSetListQueryOptions);
  return deriveSetEras(data.sets);
}
