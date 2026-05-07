import type { CardDetailResponse, Printing } from "@openrift/shared";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import { fetchApi } from "@/lib/server-fns/fetch-api";

const fetchCardDetail = createServerFn({ method: "GET" })
  .inputValidator((input: string) => input)
  .handler(
    ({ data }): Promise<CardDetailResponse> =>
      serverCache.fetchQuery({
        queryKey: ["server-cache", "card-detail", data],
        queryFn: async () => {
          // 404 is legitimate (unknown slug) — map to NOT_FOUND without logging.
          const res = await fetchApi({
            errorTitle: "Couldn't load card",
            path: `/api/v1/cards/${encodeURIComponent(data)}`,
            acceptStatuses: [404],
          });
          if (res.status === 404) {
            throw new Error("NOT_FOUND");
          }
          return res.json() as Promise<CardDetailResponse>;
        },
      }),
  );

interface EnrichedCardDetail {
  card: CardDetailResponse["card"];
  printings: Printing[];
  sets: CardDetailResponse["sets"];
}

function enrichCardDetail(response: CardDetailResponse): EnrichedCardDetail {
  const setsById = new Map(response.sets.map((s) => [s.id, s]));
  // Printings carry `canonicalRank` from the DB view; consumers layer the
  // per-user language axis on top via `sortByLanguageAndCanonicalRank`.
  const printings: Printing[] = response.printings.map((p) => {
    const set = setsById.get(p.setId);
    return {
      ...p,
      setSlug: set?.slug ?? "",
      setReleased: set?.released ?? true,
      card: response.card,
    };
  });
  return { card: response.card, printings, sets: response.sets };
}

/** @returns Query options for a single card detail, enriched with set slugs. */
export function cardDetailQueryOptions(cardSlug: string) {
  return queryOptions({
    queryKey: queryKeys.cards.detail(cardSlug),
    queryFn: () => fetchCardDetail({ data: cardSlug }),
    staleTime: 5 * 60 * 1000,
    select: enrichCardDetail,
  });
}
