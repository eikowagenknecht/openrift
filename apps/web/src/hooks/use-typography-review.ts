import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export const typographyReviewQueryOptions = queryOptions({
  queryKey: queryKeys.admin.typographyReview,
  queryFn: async () => {
    const res = await client.api.v1.admin["typography-review"].$get();
    assertOk(res);
    return await res.json();
  },
});

export function useTypographyReview() {
  return useSuspenseQuery(typographyReviewQueryOptions);
}

export function useAcceptTypographyFix() {
  return useMutationWithInvalidation<
    void,
    { entity: "card" | "printing"; id: string; field: string; proposed: string }
  >({
    mutationFn: async (variables) => {
      const res = await client.api.v1.admin["typography-review"].accept.$post({
        json: variables,
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.typographyReview],
  });
}
