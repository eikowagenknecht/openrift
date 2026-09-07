import type { Printing, SetDetailResponse, SetListResponse } from "@openrift/shared";
import { isReleasedIn, todayUtc } from "@openrift/shared";
import { setsContract } from "@openrift/shared/contracts/sets";
import { isDefinedError, safe } from "@orpc/client";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchSetList = createServerFn({ method: "GET" }).handler((): Promise<SetListResponse> =>
  serverCache.query({
    queryKey: ["server-cache", "sets"],
    queryFn: () => apiOrpcClient(setsContract).list(),
  }),
);

const fetchSetDetail = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .handler(({ data }): Promise<SetDetailResponse> =>
    serverCache.query({
      queryKey: ["server-cache", "set-detail", data],
      queryFn: async () => {
        // 404 (unknown slug) maps to the NOT_FOUND sentinel the caller expects.
        const { error, data: detail } = await safe(
          apiOrpcClient(setsContract).detail({ setSlug: data }),
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

interface EnrichedSetDetail {
  set: SetDetailResponse["set"];
  printings: Printing[];
  cards: SetDetailResponse["cards"];
}

function enrichSetDetail(response: SetDetailResponse): EnrichedSetDetail {
  const today = todayUtc();
  const printings: Printing[] = response.printings.map((p) => ({
    ...p,
    setSlug: response.set.slug,
    setReleased: isReleasedIn(response.set.releases, p.language, today),
    card: response.cards[p.cardId],
  }));
  return { set: response.set, printings, cards: response.cards };
}

export const publicSetListQueryOptions = queryOptions({
  queryKey: queryKeys.sets.all,
  queryFn: () => fetchSetList(),
  staleTime: 5 * 60 * 1000,
});

export function publicSetDetailQueryOptions(setSlug: string) {
  return queryOptions({
    queryKey: queryKeys.sets.detail(setSlug),
    queryFn: () => fetchSetDetail({ data: setSlug }),
    staleTime: 5 * 60 * 1000,
    select: enrichSetDetail,
  });
}
