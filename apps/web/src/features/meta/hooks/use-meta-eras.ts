import { useSuspenseQuery } from "@tanstack/react-query";

import { publicSetListQueryOptions } from "@/features/cards/hooks/use-public-sets";
import type { MetaEra } from "@/features/meta/lib/meta-scope";
import { deriveSetEras } from "@/features/meta/lib/meta-scope";

/** Derived from the set list, not stored, so a new set opens its own era the day it releases. */
export function useMetaEras(): MetaEra[] {
  const { data } = useSuspenseQuery(publicSetListQueryOptions);
  return deriveSetEras(data.sets);
}
