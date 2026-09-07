import type { StandardArtFallback } from "@openrift/shared/standard";
import { findStandardArtFallback } from "@openrift/shared/standard";
import type { Printing } from "@openrift/shared/types/catalog";
import { useQuery } from "@tanstack/react-query";

import { catalogQueryOptions } from "@/hooks/catalog-query";

export type GetStandardArtFallback = (printing: Printing) => StandardArtFallback | null;

// Cached per candidates-array identity: stable per catalog fetch, so entries
// age out with their key when a new catalog produces new arrays.
const fallbackCache = new WeakMap<readonly Printing[], Map<string, StandardArtFallback | null>>();

function cachedFallback(printing: Printing, candidates: Printing[]): StandardArtFallback | null {
  let byPrinting = fallbackCache.get(candidates);
  if (!byPrinting) {
    byPrinting = new Map();
    fallbackCache.set(candidates, byPrinting);
  }
  // Stored values are StandardArtFallback | null, never undefined, so a
  // plain get() distinguishes "cached null" from "not cached yet".
  const cached = byPrinting.get(printing.id);
  if (cached !== undefined) {
    return cached;
  }
  const result = findStandardArtFallback(printing, candidates);
  byPrinting.set(printing.id, result);
  return result;
}

/** `enabled: false`: reads the catalog only if another surface already fetched it. */
export function useStandardArtFallback(): GetStandardArtFallback {
  "use memo";
  const { data } = useQuery({ ...catalogQueryOptions, enabled: false });
  const printingsByCardId = data?.printingsByCardId;
  return function getStandardArtFallback(printing: Printing): StandardArtFallback | null {
    const candidates = printingsByCardId?.get(printing.cardId);
    return candidates ? cachedFallback(printing, candidates) : null;
  };
}
