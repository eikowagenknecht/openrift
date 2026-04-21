import type { Printing, SetDetailResponse, SetListResponse } from "@openrift/shared";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import { fetchApiJson } from "@/lib/server-fns/fetch-api";

const fetchSetList = createServerFn({ method: "GET" }).handler(
  (): Promise<SetListResponse> =>
    serverCache.fetchQuery({
      queryKey: ["server-cache", "sets"],
      queryFn: () =>
        fetchApiJson<SetListResponse>({
          errorTitle: "Couldn't load sets",
          path: "/api/v1/sets",
        }),
    }),
);

const fetchSetDetail = createServerFn({ method: "GET" })
  .inputValidator((input: string) => input)
  .handler(
    ({ data }): Promise<SetDetailResponse> =>
      serverCache.fetchQuery({
        queryKey: ["server-cache", "set-detail", data],
        queryFn: () =>
          fetchApiJson<SetDetailResponse>({
            errorTitle: "Couldn't load set",
            path: `/api/v1/sets/${encodeURIComponent(data)}`,
          }),
      }),
  );

interface EnrichedSetDetail {
  set: SetDetailResponse["set"];
  printings: Printing[];
  cards: SetDetailResponse["cards"];
}

function enrichSetDetail(response: SetDetailResponse): EnrichedSetDetail {
  const printings: Printing[] = response.printings.map((p) => ({
    ...p,
    setSlug: response.set.slug,
    setReleased: response.set.released,
    card: response.cards[p.cardId],
  }));
  return { set: response.set, printings, cards: response.cards };
}

export const publicSetListQueryOptions = queryOptions({
  queryKey: queryKeys.sets.all,
  queryFn: () => fetchSetList(),
  staleTime: 5 * 60 * 1000,
});

/** @returns Query options for a single set detail, enriched with card references. */
export function publicSetDetailQueryOptions(setSlug: string) {
  return queryOptions({
    queryKey: queryKeys.sets.detail(setSlug),
    queryFn: () => fetchSetDetail({ data: setSlug }),
    staleTime: 5 * 60 * 1000,
    select: enrichSetDetail,
  });
}
