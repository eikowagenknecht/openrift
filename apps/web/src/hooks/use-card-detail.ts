import type { CardDetailResponse, Printing } from "@openrift/shared";
import { comparePrintings } from "@openrift/shared";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import { API_URL } from "@/lib/server-fns/api-url";

const fetchCardDetail = createServerFn({ method: "GET" })
  .inputValidator((input: string) => input)
  .handler(
    ({ data }): Promise<CardDetailResponse> =>
      serverCache.fetchQuery({
        queryKey: ["server-cache", "card-detail", data],
        queryFn: async () => {
          const res = await fetch(`${API_URL}/api/v1/cards/${encodeURIComponent(data)}`);
          if (!res.ok) {
            throw new Error(`Card fetch failed: ${res.status}`);
          }
          return res.json() as Promise<CardDetailResponse>;
        },
      }),
  );

export interface EnrichedCardDetail {
  card: CardDetailResponse["card"];
  printings: Printing[];
  sets: CardDetailResponse["sets"];
}

function enrichCardDetail(response: CardDetailResponse): EnrichedCardDetail {
  const slugById = new Map(response.sets.map((s) => [s.id, s.slug]));
  // Build a set display-order map so comparePrintings uses sortOrder, not UUID
  const setOrderMap = new Map(response.sets.map((s, i) => [s.id, i]));
  const printings: Printing[] = response.printings
    .map((p) => ({
      ...p,
      setSlug: slugById.get(p.setId) ?? "",
      card: response.card,
    }))
    .toSorted((a, b) =>
      comparePrintings(
        { ...a, setOrder: setOrderMap.get(a.setId), promoTypeSlug: a.promoType?.slug },
        { ...b, setOrder: setOrderMap.get(b.setId), promoTypeSlug: b.promoType?.slug },
      ),
    );
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
