import { adminOperationsContract } from "@openrift/shared/contracts/admin/operations";
import { useMutation } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const recomputeCardTokensFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(({ context }) =>
    apiOrpcClient(adminOperationsContract, context.cookie).recomputeCardTokens(),
  );

/**
 * Re-derives every card's token references from EN rules text and refreshes the
 * card-aggregates view. Card and errata edits already do this for the card they
 * touch, so this is for the initial backfill and after a bulk set import.
 *
 * @returns A mutation that triggers the full re-derivation.
 */
export function useRecomputeCardTokens() {
  return useMutation({
    mutationFn: () => recomputeCardTokensFn(),
  });
}
