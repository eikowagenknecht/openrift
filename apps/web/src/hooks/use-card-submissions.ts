import { cardSubmissionsContract } from "@openrift/shared/contracts/card-submissions";
import type { CardSubmissionListResponse } from "@openrift/shared/contracts/card-submissions";
import { infiniteQueryOptions, useInfiniteQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchCardSubmissionsFn = createServerFn({ method: "GET" })
  .validator((input: { cursor?: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<CardSubmissionListResponse> =>
    apiOrpcClient(cardSubmissionsContract, context.cookie).list(
      data.cursor ? { cursor: data.cursor } : {},
    ),
  );

/**
 * Query options for the viewer's own card submissions and their review status
 * (ADR-036). Shared by the hook below and the /contribute/submissions loader.
 * The API scopes to the session user, so the id here only keys the cache.
 * @param userId The viewer, for the cache key.
 * @returns The submissions infinite-query options.
 */
export function cardSubmissionsQueryOptions(userId: string) {
  return infiniteQueryOptions({
    queryKey: queryKeys.cardSubmissions.all(userId),
    queryFn: ({ pageParam }): Promise<CardSubmissionListResponse> =>
      fetchCardSubmissionsFn({
        data: { cursor: pageParam },
      }) as Promise<CardSubmissionListResponse>,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: CardSubmissionListResponse) => lastPage.nextCursor ?? undefined,
  });
}

/**
 * The viewer's card submissions, newest first.
 * @returns The submissions infinite query.
 */
export function useCardSubmissions() {
  const userId = useRequiredUserId();
  return useInfiniteQuery(cardSubmissionsQueryOptions(userId));
}
