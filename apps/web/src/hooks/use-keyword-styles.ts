import type { KeywordStylesResponse } from "@openrift/shared";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { client, rpc } from "@/lib/rpc-client";

const keywordStylesQueryOptions = queryOptions({
  queryKey: queryKeys.keywordStyles.all,
  queryFn: () => rpc(client.api["keyword-styles"].$get()),
  staleTime: 30 * 60 * 1000,
  refetchOnWindowFocus: false,
});

export function useKeywordStyles(): KeywordStylesResponse {
  const { data } = useSuspenseQuery(keywordStylesQueryOptions);
  return data as KeywordStylesResponse;
}
