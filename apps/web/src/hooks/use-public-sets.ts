import type { Printing, SetDetailResponse, SetListResponse } from "@openrift/shared";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import { API_URL } from "@/lib/server-fns/api-url";

const fetchSetList = createServerFn({ method: "GET" }).handler(
  (): Promise<SetListResponse> =>
    serverCache.fetchQuery({
      queryKey: ["server-cache", "sets"],
      queryFn: async () => {
        const res = await fetch(`${API_URL}/api/v1/sets`);
        if (!res.ok) {
          throw new Error(`Sets fetch failed: ${res.status}`);
        }
        return res.json() as Promise<SetListResponse>;
      },
    }),
);

const fetchSetDetail = createServerFn({ method: "GET" })
  .inputValidator((input: string) => input)
  .handler(
    ({ data }): Promise<SetDetailResponse> =>
      serverCache.fetchQuery({
        queryKey: ["server-cache", "set-detail", data],
        queryFn: async () => {
          const res = await fetch(`${API_URL}/api/v1/sets/${encodeURIComponent(data)}`);
          if (!res.ok) {
            throw new Error(`Set fetch failed: ${res.status}`);
          }
          return res.json() as Promise<SetDetailResponse>;
        },
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
