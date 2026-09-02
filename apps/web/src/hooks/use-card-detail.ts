import type { CardDetailResponse, Printing } from "@openrift/shared";
import { isReleasedIn, todayUtc } from "@openrift/shared";
import { cardsContract } from "@openrift/shared/contracts/cards";
import { isDefinedError, safe } from "@orpc/client";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchCardDetail = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .handler(({ data }): Promise<CardDetailResponse> =>
    serverCache.query({
      queryKey: ["server-cache", "card-detail", data],
      queryFn: async () => {
        // 404 (unknown slug) is a typed NOT_FOUND error on the contract;
        // `safe` + `isDefinedError` narrows `error.code` to the declared set,
        // mapped to the sentinel the route boundary expects.
        const { error, data: detail } = await safe(
          apiOrpcClient(cardsContract).detail({ cardSlug: data }),
        );
        if (error) {
          if (isDefinedError(error) && error.code === "NOT_FOUND") {
            throw new Error("NOT_FOUND");
          }
          throw error;
        }
        return detail;
      },
    }),
  );

interface EnrichedCardDetail {
  card: CardDetailResponse["card"];
  printings: Printing[];
  sets: CardDetailResponse["sets"];
  /** Products keyed by printing id, for the selected printing's "Found in" row. */
  productsByPrinting: ReadonlyMap<string, CardDetailResponse["products"]>;
  related: CardDetailResponse["related"];
}

function enrichCardDetail(response: CardDetailResponse): EnrichedCardDetail {
  const setsById = new Map(response.sets.map((s) => [s.id, s]));
  // Printings carry `canonicalRank` from the DB view; consumers layer the
  // per-user language axis on top via `sortByLanguageAndCanonicalRank`.
  const today = todayUtc();
  const printings: Printing[] = response.printings.map((p) => {
    const set = setsById.get(p.setId);
    return {
      ...p,
      setSlug: set?.slug ?? "",
      // Per printing language: a set is out in English long before it is out
      // in French. A printing whose set is missing from the payload keeps the
      // optimistic default rather than gaining a Preview ribbon.
      setReleased: set ? isReleasedIn(set.releases, p.language, today) : true,
      card: response.card,
    };
  });
  return {
    card: response.card,
    printings,
    sets: response.sets,
    // The API sends products flat (one row per printing+product) already
    // ordered by product name; grouping preserves that order per printing.
    productsByPrinting: Map.groupBy(response.products, (p) => p.printingId),
    related: response.related,
  };
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
