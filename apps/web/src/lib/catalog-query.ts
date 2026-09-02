import type { Card, CatalogResponse, Printing } from "@openrift/shared";
import { joinCatalogPrintings } from "@openrift/shared";
import { context, propagation } from "@opentelemetry/api";
import type { QueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import type { GroupInfo } from "@/components/cards/card-grid-types";
import { consumeSeededCatalogVersion, versionFromEtag } from "@/lib/catalog-version";
import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import { apiErrorFromResponse } from "@/lib/server-fns/api-error";
import { getApiUrl } from "@/lib/server-fns/api-url";
import { activeClientIp } from "@/lib/server-fns/client-ip-context";
import { useDisplayStore } from "@/stores/display-store";

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
  sets: GroupInfo[];
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
  return serverCache.query({
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

// ── Language-split fetching (client only) ───────────────────────────────────
// The catalog is ~5MB of JSON, 92% of it printings, and ~65% of those are
// languages the user's grid never shows (the language filter auto-seeds to
// the preferred languages). The client therefore fetches the catalog in two
// parts: the primary variant (`?langs=EN,FR` — full core + only those
// printings) on the critical path, and the complement (`?exceptLangs=…`,
// printings only) lazily after first paint, merged into the same query entry
// (see `loadCatalogTail`). The SSR server path keeps the full catalog.

/**
 * Per-response bookkeeping for the split fetch: which languages the primary
 * variant covered (null once complete) and the version token it was fetched
 * under. Keyed by object identity so it never leaks onto the wire shape.
 */
const catalogPartsMeta = new WeakMap<
  CatalogResponse,
  { version: string | null; pendingTailLangs: readonly string[] | null }
>();

/** Refetch guard: the last complete catalog per version (see queryFn). */
let lastCompleteCatalog: { version: string; data: CatalogResponse } | null = null;

/**
 * Normalizes a language list for the catalog URL: uppercase, deduped, sorted,
 * so equal selections always produce the same edge-cache key.
 * @returns The normalized codes.
 */
export function normalizeCatalogLangs(langs: readonly string[]): string[] {
  return [...new Set(langs.map((lang) => lang.toUpperCase()))].sort();
}

/**
 * Builds the catalog fetch URL. Shared by the client fetch and the /cards SSR
 * head's preload link, which MUST byte-match it (params in this order, same
 * encoding) or the browser downloads the catalog twice.
 * @returns The URL (relative when `origin` is empty).
 */
export function catalogFetchUrl(
  origin: string,
  version: string | null,
  langs?: { langs: readonly string[] } | { exceptLangs: readonly string[] },
): string {
  const params = new URLSearchParams();
  if (version !== null) {
    params.set("v", version);
  }
  if (langs !== undefined) {
    if ("langs" in langs) {
      params.set("langs", langs.langs.join(","));
    } else {
      params.set("exceptLangs", langs.exceptLangs.join(","));
    }
  }
  const search = params.toString();
  const base = `${origin}/api/v1/catalog`;
  return search === "" ? base : `${base}?${search}`;
}

/**
 * The languages worth fetching on the critical path. The URL's `languages`
 * filter wins when present (it is what the grid renders, and the /cards SSR
 * head builds its catalog preload from the same request URL, so the two URLs
 * byte-match — see the head in routes/_app/cards.tsx); the persisted
 * preference is the fallback (it seeds that filter and drives every other
 * surface's sort). Normalized via {@link normalizeCatalogLangs} so equal
 * selections produce one edge-cache URL. Everything not covered arrives via
 * the lazy tail (`loadCatalogTail`).
 * Exported for tests; not part of the module's real surface.
 * @returns The normalized language codes, or null when unknown (fetch full).
 */
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
    // Malformed languages param: the router's search validation owns erroring;
    // here it just contributes nothing to the primary set.
  }
  // /promos/<language> renders a route-chosen language that may not be in the
  // user's preferences; make sure a direct visit covers it on the first fetch.
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

/**
 * Detects a full response served for a variant request (deploy skew: an older
 * API ignores `langs`). One early-exiting scan; typically the first printing
 * decides.
 * Exported for tests; not part of the module's real surface.
 * @returns Whether any printing falls outside the requested languages.
 */
export function hasPrintingsOutside(catalog: CatalogResponse, langs: readonly string[]): boolean {
  const wanted = new Set(langs);
  for (const printing of Object.values(catalog.printings)) {
    if (!wanted.has(printing.language.toUpperCase())) {
      return true;
    }
  }
  return false;
}

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
  // Same version, tail already merged: hand back the identical object so the
  // enrich memo and every consumer keep reference identity across refetches.
  if (version !== null && lastCompleteCatalog?.version === version) {
    return lastCompleteCatalog.data;
  }
  const langs = primaryCatalogLanguages();
  const url = catalogFetchUrl(
    globalThis.location.origin,
    version,
    langs === null ? undefined : { langs },
  );
  const res = await fetchCatalogResponse(url);
  const catalog = (await res.json()) as CatalogResponse;
  const pendingTailLangs = langs !== null && !hasPrintingsOutside(catalog, langs) ? langs : null;
  catalogPartsMeta.set(catalog, { version, pendingTailLangs });
  if (version !== null && pendingTailLangs === null) {
    lastCompleteCatalog = { version, data: catalog };
  }
  return catalog;
}

/** Dedupes concurrent tail fetches across the hook's many consumers. */
let tailInFlight = false;

/**
 * Fetches the languages the primary catalog variant left out (printings only)
 * and merges them into the cached query entry. Scheduled from `useCards` at
 * idle after first paint; no-ops when the catalog is already complete. The
 * merge produces a new response object, so the enrich memo re-runs once and
 * every consumer re-renders with the full printing set.
 * @returns Resolves when the tail is merged (or found unnecessary).
 */
export async function loadCatalogTail(queryClient: QueryClient): Promise<void> {
  const current = queryClient.getQueryData<CatalogResponse>(queryKeys.catalog.all);
  if (current === undefined) {
    return;
  }
  const meta = catalogPartsMeta.get(current);
  const pending = meta?.pendingTailLangs;
  if (!meta || !pending || pending.length === 0 || tailInFlight) {
    return;
  }
  tailInFlight = true;
  try {
    const url = catalogFetchUrl(globalThis.location.origin, meta.version, {
      exceptLangs: pending,
    });
    const tailResponse = await fetchCatalogResponse(url);
    const tail = (await tailResponse.json()) as CatalogResponse;
    // The catalog rolled under us (a refetch replaced the entry): the newer
    // primary schedules its own tail, so this one just stands down.
    if (queryClient.getQueryData<CatalogResponse>(queryKeys.catalog.all) !== current) {
      return;
    }
    const merged: CatalogResponse = {
      ...current,
      printings: { ...current.printings, ...tail.printings },
    };
    catalogPartsMeta.set(merged, { version: meta.version, pendingTailLangs: null });
    if (meta.version !== null) {
      lastCompleteCatalog = { version: meta.version, data: merged };
    }
    queryClient.setQueryData(queryKeys.catalog.all, merged);
  } finally {
    tailInFlight = false;
  }
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
  // `canonicalRank` rides through from the API on each row: the server-computed
  // sort key from the `printings_ordered` view. Consumers that need
  // user-language-aware order layer on top via `sortByLanguageAndCanonicalRank`.
  const allPrintings = joinCatalogPrintings(catalog);

  const printingsById: Record<string, Printing> = {};
  for (const printing of allPrintings) {
    printingsById[printing.id] = printing;
  }

  return {
    allPrintings,
    // Cards are already in the right shape — identity lives in the map key.
    cardsById: catalog.cards,
    printingsById,
    printingsByCardId: Map.groupBy(allPrintings, (p) => p.cardId),
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
