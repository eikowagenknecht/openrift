import type {
  AdminMetaEventCorrection,
  AdminMetaSubmission,
} from "@openrift/shared/contracts/admin/meta-submissions";
import { adminMetaSubmissionsContract } from "@openrift/shared/contracts/admin/meta-submissions";
import { isDefinedError, safe } from "@orpc/client";
import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { adminKeys } from "@/features/admin/lib/admin-query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import type { ContractInput } from "@/lib/server-fns/orpc-client";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

function submissionKeys(playerOverlayId: string | null) {
  if (playerOverlayId === null) {
    return [adminKeys.meta.eventCorrections] as const;
  }
  return [
    adminKeys.meta.submissionForPlayerOverlay(playerOverlayId),
    adminKeys.meta.overlays,
  ] as const;
}

const fetchMetaEventCorrections = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<{ items: AdminMetaEventCorrection[]; hasMore: boolean }> =>
    apiOrpcClient(adminMetaSubmissionsContract, context.cookie).eventCorrections(),
  );

export function useMetaEventCorrections() {
  return useQuery({
    queryKey: adminKeys.meta.eventCorrections,
    queryFn: () => fetchMetaEventCorrections(),
    staleTime: 60 * 1000,
  });
}

const fetchSubmissionForPlayerOverlay = createServerFn({ method: "GET" })
  .validator((input: { playerOverlayId: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<{ submission: AdminMetaSubmission | null }> =>
    apiOrpcClient(adminMetaSubmissionsContract, context.cookie).forPlayerOverlay({
      playerOverlayId: data.playerOverlayId,
    }),
  );

export function useMetaSubmissionForPlayerOverlay(playerOverlayId: string, enabled: boolean) {
  return useQuery({
    queryKey: adminKeys.meta.submissionForPlayerOverlay(playerOverlayId),
    queryFn: () => fetchSubmissionForPlayerOverlay({ data: { playerOverlayId } }),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export type MetaSubmissionWriteResult = { status: "ok" } | { status: "alreadyAccepted" };

export type ResolveMetaSubmissionInput = Omit<
  ContractInput<typeof adminMetaSubmissionsContract, "resolve">,
  "id"
> & {
  submissionId: string;
  playerOverlayId: string | null;
};

const resolveMetaSubmissionFn = createServerFn({ method: "POST" })
  .validator((input: Omit<ResolveMetaSubmissionInput, "playerOverlayId">) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }): Promise<MetaSubmissionWriteResult> => {
    const { error } = await safe(
      apiOrpcClient(adminMetaSubmissionsContract, context.cookie).resolve({
        id: data.submissionId,
        status: data.status,
        reason: data.reason,
        note: data.note,
      }),
    );
    if (error) {
      if (isDefinedError(error) && error.code === "CONFLICT") {
        return { status: "alreadyAccepted" };
      }
      throw error;
    }
    return { status: "ok" };
  });

export function useResolveMetaSubmission() {
  return useMutationWithInvalidation<MetaSubmissionWriteResult, ResolveMetaSubmissionInput>({
    mutationFn: (vars) =>
      resolveMetaSubmissionFn({
        data: {
          submissionId: vars.submissionId,
          status: vars.status,
          reason: vars.reason,
          note: vars.note,
        },
      }),
    invalidates: (vars) => submissionKeys(vars.playerOverlayId),
  });
}

const reopenMetaSubmissionFn = createServerFn({ method: "POST" })
  .validator((input: { submissionId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }): Promise<MetaSubmissionWriteResult> => {
    const { error } = await safe(
      apiOrpcClient(adminMetaSubmissionsContract, context.cookie).reopen({
        id: data.submissionId,
      }),
    );
    if (error) {
      if (isDefinedError(error) && error.code === "CONFLICT") {
        return { status: "alreadyAccepted" };
      }
      throw error;
    }
    return { status: "ok" };
  });

export function useReopenMetaSubmission() {
  return useMutationWithInvalidation<
    MetaSubmissionWriteResult,
    { submissionId: string; playerOverlayId: string | null }
  >({
    mutationFn: (vars) => reopenMetaSubmissionFn({ data: { submissionId: vars.submissionId } }),
    invalidates: (vars) => submissionKeys(vars.playerOverlayId),
  });
}
