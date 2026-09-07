import { adminIgnoredCandidatesContract } from "@openrift/shared/contracts/admin/ignored-candidates";
import { queryOptions, useMutation, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { adminKeys } from "@/features/admin/lib/admin-query-keys";
import type { IgnoredCandidatesResponse } from "@/lib/server-fns/api-types";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchIgnoredCandidates = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<IgnoredCandidatesResponse> =>
    apiOrpcClient(adminIgnoredCandidatesContract, context.cookie).list(),
  );

export const ignoredCandidatesQueryOptions = queryOptions({
  queryKey: adminKeys.ignoredCandidates,
  queryFn: () => fetchIgnoredCandidates(),
});

export function useIgnoredCandidates() {
  return useSuspenseQuery(ignoredCandidatesQueryOptions);
}

const ignoreCandidateCardFn = createServerFn({ method: "POST" })
  .validator((input: { provider: string; externalId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminIgnoredCandidatesContract, context.cookie).ignoreCard(data);
  });

export function useIgnoreCandidateCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { provider: string; externalId: string }) =>
      ignoreCandidateCardFn({ data: params }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.ignoredCandidates });
      void queryClient.invalidateQueries({ queryKey: adminKeys.cards.all });
    },
  });
}

const unignoreCandidateCardFn = createServerFn({ method: "POST" })
  .validator((input: { provider: string; externalId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminIgnoredCandidatesContract, context.cookie).unignoreCard(data);
  });

export function useUnignoreCandidateCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { provider: string; externalId: string }) =>
      unignoreCandidateCardFn({ data: params }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.ignoredCandidates });
      void queryClient.invalidateQueries({ queryKey: adminKeys.cards.all });
    },
  });
}

const ignoreCandidatePrintingFn = createServerFn({ method: "POST" })
  .validator((input: { provider: string; externalId: string; finish?: string | null }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminIgnoredCandidatesContract, context.cookie).ignorePrinting(data);
  });

export function useIgnoreCandidatePrinting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { provider: string; externalId: string; finish?: string | null }) =>
      ignoreCandidatePrintingFn({ data: params }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.ignoredCandidates });
      void queryClient.invalidateQueries({ queryKey: adminKeys.cards.all });
    },
  });
}

const unignoreCandidatePrintingFn = createServerFn({ method: "POST" })
  .validator((input: { provider: string; externalId: string; finish: string | null }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminIgnoredCandidatesContract, context.cookie).unignorePrinting(data);
  });

export function useUnignoreCandidatePrinting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { provider: string; externalId: string; finish: string | null }) =>
      unignoreCandidatePrintingFn({ data: params }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.ignoredCandidates });
      void queryClient.invalidateQueries({ queryKey: adminKeys.cards.all });
    },
  });
}
