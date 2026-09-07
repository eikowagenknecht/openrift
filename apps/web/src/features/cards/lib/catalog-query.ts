import { joinCatalogPrintings } from "@openrift/shared/catalog-join";
import type {
  CatalogResponse,
  CatalogResponsePrintingValue,
} from "@openrift/shared/types/api/catalog";
import type { DeckCatalogSubset } from "@openrift/shared/types/api/deck";
import type { Card, Printing } from "@openrift/shared/types/catalog";
import { context, propagation } from "@opentelemetry/api";
import type { QueryClient, UseSuspenseQueryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { consumeSeededCatalogVersion, versionFromEtag } from "@/features/cards/lib/catalog-version";
import type { GroupInfo } from "@/lib/card-group-types";
import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import { apiErrorFromResponse } from "@/lib/server-fns/api-error";
import { getApiUrl } from "@/lib/server-fns/api-url";
import { activeClientIp } from "@/lib/server-fns/client-ip-context";

// Fetched with a plain `fetch`, not the oRPC client, so the ETag can be read
// off the same Response as the body.

function serverCatalogFetchHeaders(): Record<string, string> {
  // No cookie: the catalog is public.
  const headers: Record<string, string> = {};
  propagation.inject(context.active(), headers);
  const clientIp = activeClientIp();
  if (clientIp !== undefined) {
    headers["x-real-ip"] = clientIp;
  }
  return headers;
}

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

// One serverCache entry holds both the catalog and its ETag so the token can
// never drift from the body it describes.
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

// Do not route this through a per-request `context.queryClient`: it dehydrates to
// HTML and would inline the full ~310 KB catalog.
export async function readCatalogFromServerCache(): Promise<CatalogResponse> {
  const { catalog } = await fetchCatalogWithVersion();
  return catalog;
}

export async function readCatalogVersionFromServerCache(): Promise<string | null> {
  const { version } = await fetchCatalogWithVersion();
  return version;
}

export const fetchCatalog = createServerFn({ method: "GET" }).handler(
  (): Promise<CatalogResponse> => readCatalogFromServerCache(),
);

// Goes through the Start server, not the edge, on purpose: the token must be
// fresh, and serverCache bounds origin load to one catalog fetch per minute.
const fetchCatalogVersion = createServerFn({ method: "GET" }).handler((): Promise<string | null> =>
  readCatalogVersionFromServerCache(),
);

const catalogPartsMeta = new WeakMap<
  CatalogResponse,
  { version: string | null; pendingTailLangs: readonly string[] | null }
>();

let lastCompleteCatalog: { version: string; data: CatalogResponse } | null = null;

export function normalizeCatalogLangs(langs: readonly string[]): string[] {
  return [...new Set(langs.map((lang) => lang.toUpperCase()))].sort();
}

// Shared by the client fetch and the /cards SSR head's preload link, which
// MUST byte-match it (params in this order, same encoding) or the browser
// downloads the catalog twice.
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

// Detects a full response served for a variant request (deploy skew: an
// older API ignores `langs`). Exported for tests, not real module surface.
export function hasPrintingsOutside(catalog: CatalogResponse, langs: readonly string[]): boolean {
  const wanted = new Set(langs);
  for (const printing of Object.values(catalog.printings)) {
    if (!wanted.has(printing.language.toUpperCase())) {
      return true;
    }
  }
  return false;
}

// Fetches /api/v1/catalog directly (bypasses the Start server) so Cloudflare edge-caches it.
// `?v=<ETag>` must change with the catalog or max-age + stale-while-revalidate serves a stale body.
export async function fetchCatalogFromEdge(langs: string[] | null): Promise<CatalogResponse> {
  const version = consumeSeededCatalogVersion() ?? (await fetchCatalogVersion().catch(() => null));
  // Returns the identical object on an unchanged version: the enrich memo depends on reference identity.
  if (version !== null && lastCompleteCatalog?.version === version) {
    return lastCompleteCatalog.data;
  }
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

let tailInFlight = false;

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

// Memoized: the enriched result's `Map` (`printingsByCardId`) is not
// serializable, defeating React Query's structural sharing across renders.
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
  const allPrintings = joinCatalogPrintings(catalog);

  const printingsById: Record<string, Printing> = {};
  for (const printing of allPrintings) {
    printingsById[printing.id] = printing;
  }

  return {
    allPrintings,
    cardsById: catalog.cards,
    printingsById,
    printingsByCardId: Map.groupBy(allPrintings, (p) => p.cardId),
    sets: catalog.sets,
  };
}

const enrichSubsetCache = new WeakMap<DeckCatalogSubset, UseCardsResult>();

export function enrichCatalogSubset(subset: DeckCatalogSubset): UseCardsResult {
  const cached = enrichSubsetCache.get(subset);
  if (cached) {
    return cached;
  }
  const printings: Record<string, CatalogResponsePrintingValue> = {};
  for (const { id, ...rest } of subset.printings) {
    printings[id] = rest;
  }
  const result = enrichCatalogInner({
    sets: subset.sets,
    cards: subset.cards,
    printings,
    totalCopies: 0,
    customTagAssignments: {},
  });
  enrichSubsetCache.set(subset, result);
  return result;
}

const NO_CATALOG: CatalogResponse = {
  sets: [],
  cards: {},
  printings: {},
  totalCopies: 0,
  customTagAssignments: {},
};

// A resolved stand-in so the unconditional useSuspenseQuery below never fetches or suspends.
export const noCatalogQueryOptions: UseSuspenseQueryOptions<
  CatalogResponse,
  Error,
  UseCardsResult
> = {
  queryKey: queryKeys.catalog.none,
  queryFn: () => NO_CATALOG,
  initialData: NO_CATALOG,
  staleTime: Infinity,
  select: enrichCatalog,
};
