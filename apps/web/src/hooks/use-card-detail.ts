import { cardsContract } from "@openrift/shared/contracts/cards";
import { isReleasedIn, todayUtc } from "@openrift/shared/set-release";
import type { CardDetailResponse } from "@openrift/shared/types/api/catalog";
import type { Printing } from "@openrift/shared/types/catalog";
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
        // 404 is a typed NOT_FOUND error on the contract, mapped here to the
        // sentinel the route boundary expects.
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
      // If set is missing from the payload, default setReleased to true.
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

export function cardDetailQueryOptions(cardSlug: string) {
  return queryOptions({
    queryKey: queryKeys.cards.detail(cardSlug),
    queryFn: () => fetchCardDetail({ data: cardSlug }),
    staleTime: 5 * 60 * 1000,
    select: enrichCardDetail,
  });
}
