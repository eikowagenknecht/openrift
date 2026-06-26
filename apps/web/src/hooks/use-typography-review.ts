import type { TypographyReviewResponse } from "@openrift/shared/contracts";
import { adminTypographyReviewContract } from "@openrift/shared/contracts";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchTypographyReview = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<TypographyReviewResponse> =>
      apiOrpcClient(adminTypographyReviewContract, context.cookie).list(),
  );

export const typographyReviewQueryOptions = queryOptions({
  queryKey: queryKeys.admin.typographyReview,
  queryFn: () => fetchTypographyReview(),
});

export function useTypographyReview() {
  return useSuspenseQuery(typographyReviewQueryOptions);
}

const acceptTypographyFixFn = createServerFn({ method: "POST" })
  .validator(
    (input: { entity: "card" | "printing"; id: string; field: string; proposed: string }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminTypographyReviewContract, context.cookie).accept(data);
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
