import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { TypographyReviewResponse } from "@/lib/server-fns/api-types";
import { fetchApi, fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchTypographyReview = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<TypographyReviewResponse> =>
      fetchApiJson<TypographyReviewResponse>({
        errorTitle: "Couldn't load typography review",
        cookie: context.cookie,
        path: "/api/v1/admin/typography-review",
      }),
  );

export const typographyReviewQueryOptions = queryOptions({
  queryKey: queryKeys.admin.typographyReview,
  queryFn: () => fetchTypographyReview(),
});

export function useTypographyReview() {
  return useSuspenseQuery(typographyReviewQueryOptions);
}

const acceptTypographyFixFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { entity: "card" | "printing"; id: string; field: string; proposed: string }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't accept typography fix",
      cookie: context.cookie,
      path: "/api/v1/admin/typography-review/accept",
      method: "POST",
      body: data,
    });
  });

export function useAcceptTypographyFix() {
  return useMutationWithInvalidation<
    void,
    { entity: "card" | "printing"; id: string; field: string; proposed: string }
  >({
    mutationFn: async (variables) => {
      await acceptTypographyFixFn({ data: variables });
    },
    invalidates: [queryKeys.admin.typographyReview],
  });
}
