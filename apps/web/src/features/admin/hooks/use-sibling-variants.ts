import { adminOperationsContract } from "@openrift/shared/contracts/admin/operations";
import type {
  JobRunStartedResponse,
  SiblingVariantDriftResponse,
} from "@openrift/shared/types/api/admin";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { adminKeys } from "@/features/admin/lib/admin-query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

export const SIBLING_VARIANT_BACKFILL_KIND = "marketplace_variants.backfill_siblings";

const siblingVariantDriftFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<SiblingVariantDriftResponse> =>
    apiOrpcClient(adminOperationsContract, context.cookie).siblingVariantDrift(),
  );

const backfillSiblingVariantsFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(({ context }): Promise<JobRunStartedResponse> =>
    apiOrpcClient(adminOperationsContract, context.cookie).backfillSiblingVariants(),
  );

export function useSiblingVariantDrift(isBackfillRunning: boolean) {
  return useQuery({
    queryKey: adminKeys.siblingVariantDrift,
    queryFn: (): Promise<SiblingVariantDriftResponse> => siblingVariantDriftFn(),
    refetchInterval: isBackfillRunning ? 5000 : 60_000,
  });
}

/**
 * The pass can exceed the API's request timeout; the endpoint answers 202 with
 * a run handle to poll via job-runs (`SIBLING_VARIANT_BACKFILL_KIND`).
 */
export function useBackfillSiblingVariants() {
  return useMutation({
    mutationFn: (): Promise<JobRunStartedResponse> => backfillSiblingVariantsFn(),
  });
}
