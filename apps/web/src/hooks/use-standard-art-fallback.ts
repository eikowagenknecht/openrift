import type { Printing, StandardArtFallback } from "@openrift/shared";
import { findStandardArtFallback } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";

import { catalogQueryOptions } from "@/lib/catalog-query";

export type GetStandardArtFallback = (printing: Printing) => StandardArtFallback | null;

// findStandardArtFallback filters + sorts the card's sibling printings — pure
// in its inputs, but re-run for every visible cell on every grid render.
// Cache per candidates-array identity (stable per catalog fetch; a new
// catalog produces new arrays, so entries age out with their key).
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

/**
 * Resolves substitute artwork for imageless printings (same-language standard
 * printing, else the EN one) from the client-cached catalog.
 *
 * Reads the catalog from the query cache only (`enabled: false`): surfaces
 * that already load it (card browser, collections, decks, /promos) get
 * fallbacks for free, while surfaces that don't (e.g. /sets/$setSlug) degrade
 * to the drawn placeholder instead of pulling the ~310 KB catalog just for
 * this. The catalog is never dehydrated into SSR payloads, so the cache is
 * empty during SSR and the first client render alike — no hydration mismatch.
 *
 * @returns A resolver from a printing to its fallback art, or null when the
 * catalog isn't cached or no standard printing with an image exists.
 */
export function useStandardArtFallback(): GetStandardArtFallback {
  "use memo";
  const { data } = useQuery({ ...catalogQueryOptions, enabled: false });
  const printingsByCardId = data?.printingsByCardId;
  return function getStandardArtFallback(printing: Printing): StandardArtFallback | null {
    const candidates = printingsByCardId?.get(printing.cardId);
    return candidates ? cachedFallback(printing, candidates) : null;
  };
}
