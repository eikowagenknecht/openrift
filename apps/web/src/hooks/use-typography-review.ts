import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { callApi, callApiJson, serverApiClient } from "@/lib/server-fns/api-client";
import type { TypographyReviewResponse } from "@/lib/server-fns/api-types";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchTypographyReview = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<TypographyReviewResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1.admin["typography-review"].$get(),
        "Couldn't load typography review",
      ),
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
    await callApi(
      serverApiClient(context.cookie).api.v1.admin["typography-review"].accept.$post({
        json: data,
      }),
      "Couldn't accept typography fix",
    );
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
