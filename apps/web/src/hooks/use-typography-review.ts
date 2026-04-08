import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
import type { TypographyReviewResponse } from "@/lib/server-fns/api-types";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchTypographyReview = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<TypographyReviewResponse> => {
    const res = await fetch(`${API_URL}/api/v1/admin/typography-review`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Typography review fetch failed: ${res.status}`);
    }
    return res.json() as Promise<TypographyReviewResponse>;
  });

export const typographyReviewQueryOptions = queryOptions({
  queryKey: queryKeys.admin.typographyReview,
  queryFn: () => fetchTypographyReview(),
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
