import type { Card, CatalogResponse, Printing } from "@openrift/shared";
import { isReleasedIn, todayUtc } from "@openrift/shared";
import { context, propagation } from "@opentelemetry/api";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import type { SetInfo } from "@/components/cards/card-grid";
import { consumeSeededCatalogVersion, versionFromEtag } from "@/lib/catalog-version";
import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import { apiErrorFromResponse } from "@/lib/server-fns/api-error";
import { getApiUrl } from "@/lib/server-fns/api-url";
import { activeClientIp } from "@/lib/server-fns/client-ip-context";

// The catalog is the LCP-critical, edge-cached payload. It is fetched with a
// plain `fetch` (not the oRPC client) because the SSR cache needs the response
// ETag — its content version token — read off the same Response as the body, so
// the token can never drift from the body it describes.

/**
 * Server-side internal-fetch headers: forward the active W3C trace and the real
 * visitor IP exactly as the old `serverApiClient` did. No cookie — the catalog
 * is public.
 * @returns A plain header record for the internal catalog fetch.
 */
function serverCatalogFetchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  propagation.inject(context.active(), headers);
  const clientIp = activeClientIp();
  if (clientIp !== undefined) {
    headers["x-real-ip"] = clientIp;
  }
  return headers;
}

/**
 * Fetches the catalog URL and enforces the API error contract (a non-ok status
 * throws an {@link import("./server-fns/api-error").ApiError} carrying the
 * server message), matching the old `callApi` behavior.
 * @returns The raw ok Response (caller reads body + ETag).
 */
async function fetchCatalogResponse(
  url: string,
  headers?: Record<string, string>,
): Promise<Response> {
  const res = await fetch(url, headers ? { headers } : undefined);
  if (!res.ok) {
    throw await apiErrorFromResponse(res, "Couldn't load catalog", { method: "GET", url });
  }
  return res;
}

export interface UseCardsResult {
  allPrintings: Printing[];
  cardsById: Record<string, Card>;
  printingsById: Record<string, Printing>;
  printingsByCardId: Map<string, Printing[]>;
  sets: SetInfo[];
}

/**
 * Fetches the catalog from the API origin together with its version token
 * (the response's ETag, bare). One serverCache entry holds both so the token
 * can never drift from the body it describes.
 * @returns The catalog response and its version token from `serverCache`.
 */
function fetchCatalogWithVersion(): Promise<{
  catalog: CatalogResponse;
  version: string | null;
}> {
  return serverCache.fetchQuery({
    queryKey: ["server-cache", "catalog"],
    queryFn: async () => {
      const res = await fetchCatalogResponse(
        `${getApiUrl()}/api/v1/catalog`,
        serverCatalogFetchHeaders(),
      );
      return {
        catalog: (await res.json()) as CatalogResponse,
        version: versionFromEtag(res.headers.get("etag")),
      };
    },
  });
}

/**
 * Reads the full catalog from the standalone server-only QueryClient. Shared
 * across server functions that derive different slim payloads from the same
 * upstream `/api/v1/catalog` response, so 1 origin call serves N derivations.
 *
 * IMPORTANT: do not pass this through any per-request `context.queryClient` —
 * that QueryClient is dehydrated to HTML and would inline the full 310 KB
 * catalog. `serverCache` is never dehydrated.
 * @returns The catalog response held in `serverCache`.
 */
export async function readCatalogFromServerCache(): Promise<CatalogResponse> {
  const { catalog } = await fetchCatalogWithVersion();
  return catalog;
}

/**
 * Reads the catalog's current version token (its ETag) from the same
 * serverCache entry as {@link readCatalogFromServerCache}. SSR loaders ship
 * this to the client so the edge fetch can append `?v=` (see
 * `lib/catalog-version.ts` for why).
 * @returns The bare ETag of the cached catalog response, or null.
 */
export async function readCatalogVersionFromServerCache(): Promise<string | null> {
  const { version } = await fetchCatalogWithVersion();
  return version;
}

const fetchCatalog = createServerFn({ method: "GET" }).handler((): Promise<CatalogResponse> =>
  readCatalogFromServerCache(),
);

// Tiny origin round trip the browser uses to resolve the current version
// token when no SSR loader seeded one (client-side navigations, non-/cards
// surfaces). Goes through the Start server (not the edge) on purpose: the
// token must be fresh, and serverCache bounds origin load to one catalog
// fetch per minute.
const fetchCatalogVersion = createServerFn({ method: "GET" }).handler((): Promise<string | null> =>
  readCatalogVersionFromServerCache(),
);

// Client-side catalog fetch goes directly to /api/v1/catalog so Cloudflare
// can serve it from the edge cache. Routing through the Start server function
// would re-enter origin for every VU, which is exactly what we're avoiding.
// A plain same-origin fetch (the session cookie is sent automatically); a
// non-2xx surfaces the server's message via the shared error parser.
//
// The fetch is versioned: `?v=<ETag>` rolls the edge cache key whenever the
// catalog content changes, so a long max-age + stale-while-revalidate can
// never downgrade a fresh SSR shell to an older catalog. The token comes from
// the /cards SSR loader when one was seeded (no extra round trip on the
// LCP-critical first load), otherwise from the `fetchCatalogVersion` server
// fn. With no token at all, fall back to the unversioned URL — plain edge
// caching, no worse than before.
async function fetchCatalogFromEdge(): Promise<CatalogResponse> {
  // A failed token lookup must not fail the catalog fetch itself — degrade to
  // the unversioned URL instead.
  const version = consumeSeededCatalogVersion() ?? (await fetchCatalogVersion().catch(() => null));
  const base = `${globalThis.location.origin}/api/v1/catalog`;
  const url = version === null ? base : `${base}?v=${encodeURIComponent(version)}`;
  const res = await fetchCatalogResponse(url);
  return (await res.json()) as CatalogResponse;
}

// Memoize by input identity. React Query's structural sharing can't preserve
// reference equality across renders because the enriched result contains a
// non-serializable `Map` (`printingsByCardId`), so without this every render
// produces a fresh `data` reference — defeating all downstream memoization
// (React Compiler, useMemo, manual caches). Keyed by `catalog` so the cache
// invalidates naturally when the underlying fetch returns new data.
const enrichCache = new WeakMap<CatalogResponse, UseCardsResult>();

export function enrichCatalog(catalog: CatalogResponse): UseCardsResult {
  const cached = enrichCache.get(catalog);
  if (cached) {
    return cached;
  }
  const result = enrichCatalogInner(catalog);
  enrichCache.set(catalog, result);
  return result;
}

function enrichCatalogInner(catalog: CatalogResponse): UseCardsResult {
  const setsById = new Map(catalog.sets.map((s) => [s.id, s]));

  // Cards are already in the right shape — identity lives in the map key.
  const cardsById: Record<string, Card> = catalog.cards;

  // Join printings with their card and the parent set slug. The printing id
  // is restored on the object so consumers that iterate `allPrintings` (a
  // flat array without surrounding keys) still have an identifier.
  //
  // `canonicalRank` rides through from the API — each row carries the
  // server-computed sort key from the `printings_ordered` view. Consumers
  // that need user-language-aware order layer on top via
  // `sortByLanguageAndCanonicalRank`.
  // A set reaches each language on its own date, so `setReleased` is resolved
  // per printing language. One "today" for the whole join, so two printings of
  // the same set can't straddle a midnight that passes mid-enrich.
  const today = todayUtc();
  const allPrintings: Printing[] = [];
  const printingsById: Record<string, Printing> = {};
  for (const [id, value] of Object.entries(catalog.printings)) {
    const set = setsById.get(value.setId);
    const card = cardsById[value.cardId];
    if (set && card) {
      const printing: Printing = {
        ...value,
        id,
        setSlug: set.slug,
        setReleased: isReleasedIn(set.releases, value.language, today),
        card,
      };
      allPrintings.push(printing);
      printingsById[id] = printing;
    }
  }

  const printingsByCardId = Map.groupBy(allPrintings, (p) => p.cardId);

  return {
    allPrintings,
    cardsById,
    printingsById,
    printingsByCardId,
    sets: catalog.sets,
  };
}

export const catalogQueryOptions = queryOptions({
  queryKey: queryKeys.catalog.all,
  queryFn: () => (globalThis.window === undefined ? fetchCatalog() : fetchCatalogFromEdge()),
  staleTime: 5 * 60 * 1000, // 5 minutes
  refetchOnWindowFocus: false,
  select: enrichCatalog,
  // A catalog 500 means edge cache miss + origin failure — not the kind of
  // thing that self-heals in a few seconds. One quick retry covers transient
  // blips; beyond that, surface the error fallback instead of stalling on a
  // skeleton for the full exponential-backoff window.
  retry: 1,
  retryDelay: 500,
});
