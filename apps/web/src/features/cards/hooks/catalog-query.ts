import { queryOptions } from "@tanstack/react-query";

import {
  enrichCatalog,
  fetchCatalog,
  fetchCatalogFromEdge,
  normalizeCatalogLangs,
} from "@/features/cards/lib/catalog-query";
import { queryKeys } from "@/lib/query-keys";
import { useDisplayStore } from "@/stores/display-store";

// Exported for tests; not part of the module's real surface.
export function primaryCatalogLanguages(): string[] | null {
  let urlLanguages: string[] = [];
  try {
    const raw = new URLSearchParams(globalThis.location.search).get("languages");
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        urlLanguages = parsed.filter((entry): entry is string => typeof entry === "string");
      }
    }
  } catch {
    // Malformed param: contributes nothing, the router's search validation owns erroring.
  }
  // /promos/<language> may render a language outside the user's preferences.
  const promosLanguage = /^\/promos\/(?<lang>[A-Za-z]{2})(?:\/|$)/u.exec(
    globalThis.location.pathname,
  )?.groups?.lang;
  if (promosLanguage !== undefined) {
    urlLanguages.push(promosLanguage);
  }
  const base =
    urlLanguages.length > 0 ? urlLanguages : (useDisplayStore.getState().languages ?? []);
  const merged = normalizeCatalogLangs(base);
  return merged.length > 0 ? merged : null;
}

export const catalogQueryOptions = queryOptions({
  queryKey: queryKeys.catalog.all,
  queryFn: () =>
    globalThis.window === undefined
      ? fetchCatalog()
      : fetchCatalogFromEdge(primaryCatalogLanguages()),
  staleTime: 5 * 60 * 1000, // 5 minutes
  refetchOnWindowFocus: false,
  select: enrichCatalog,
  retry: 1,
  retryDelay: 500,
});
