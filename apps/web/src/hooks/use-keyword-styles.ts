import type { KeywordStylesResponse } from "@openrift/shared";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import type { KeywordStylesResponse as KeywordStylesApiResponse } from "@/lib/server-fns/api-types";
import { API_URL } from "@/lib/server-fns/api-url";

const fetchKeywordStyles = createServerFn({ method: "GET" }).handler(
  (): Promise<KeywordStylesApiResponse> =>
    serverCache.fetchQuery({
      queryKey: ["server-cache", "keyword-styles"],
      queryFn: async () => {
        const res = await fetch(`${API_URL}/api/v1/keyword-styles`);
        if (!res.ok) {
          throw new Error(`Keyword styles fetch failed: ${res.status}`);
        }
        return res.json() as Promise<KeywordStylesApiResponse>;
      },
    }),
);

export const keywordStylesQueryOptions = queryOptions({
  queryKey: queryKeys.keywordStyles.all,
  queryFn: () => fetchKeywordStyles(),
  staleTime: 60 * 60 * 1000, // 1 hour
  refetchOnWindowFocus: false,
});

export function useKeywordStyles(): KeywordStylesResponse["items"] {
  const { data } = useSuspenseQuery(keywordStylesQueryOptions);
  return data.items as KeywordStylesResponse["items"];
}
