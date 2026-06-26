import type { CardDetailResponse, Printing } from "@openrift/shared";
import { cardsContract } from "@openrift/shared/contracts";
import { ORPCError } from "@orpc/client";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchCardDetail = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .handler(
    ({ data }): Promise<CardDetailResponse> =>
      serverCache.fetchQuery({
        queryKey: ["server-cache", "card-detail", data],
        queryFn: async () => {
          // Migrated to oRPC: 404 (unknown slug) is a typed NOT_FOUND error
          // mapped to the sentinel the route boundary expects.
          try {
            return await apiOrpcClient(cardsContract).detail({ cardSlug: data });
          } catch (error) {
            if (error instanceof ORPCError && error.code === "NOT_FOUND") {
              throw new Error("NOT_FOUND");
            }
            throw error;
          }
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
