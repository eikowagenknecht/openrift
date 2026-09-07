import type {
  AcceptTypographyFixBody,
  TypographyReviewResponse,
} from "@openrift/shared/contracts/admin/typography-review";
import { adminTypographyReviewContract } from "@openrift/shared/contracts/admin/typography-review";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { adminKeys } from "@/features/admin/lib/admin-query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchTypographyReview = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<TypographyReviewResponse> =>
    apiOrpcClient(adminTypographyReviewContract, context.cookie).list(),
  );

export const typographyReviewQueryOptions = queryOptions({
  queryKey: adminKeys.typographyReview,
  queryFn: () => fetchTypographyReview(),
});

export function useTypographyReview() {
  return useSuspenseQuery(typographyReviewQueryOptions);
}

const acceptTypographyFixFn = createServerFn({ method: "POST" })
  .validator((input: AcceptTypographyFixBody) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminTypographyReviewContract, context.cookie).accept(data);
  });

export function useAcceptTypographyFix() {
  return useMutationWithInvalidation<void, AcceptTypographyFixBody>({
    mutationFn: async (variables) => {
      await acceptTypographyFixFn({ data: variables });
    },
    invalidates: [adminKeys.typographyReview],
  });
}
