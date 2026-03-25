import type { KeywordStylesResponse } from "@openrift/shared";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";

const keywordStylesQueryOptions = queryOptions({
  queryKey: queryKeys.keywordStyles.all,
  queryFn: async () => {
    const res = await client.api.v1["keyword-styles"].$get();
    assertOk(res);
    return await res.json();
  },
  staleTime: 60 * 60 * 1000, // 1 hour
  refetchOnWindowFocus: false,
});

export function useKeywordStyles(): KeywordStylesResponse["items"] {
  const { data } = useSuspenseQuery(keywordStylesQueryOptions);
  return data.items as KeywordStylesResponse["items"];
}
