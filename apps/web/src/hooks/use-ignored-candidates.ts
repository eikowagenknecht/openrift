import { queryOptions, useMutation, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
import type { IgnoredCandidatesResponse } from "@/lib/server-fns/api-types";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchIgnoredCandidates = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<IgnoredCandidatesResponse> => {
    const res = await fetch(`${API_URL}/api/v1/admin/ignored-candidates`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Ignored candidates fetch failed: ${res.status}`);
    }
    return res.json() as Promise<IgnoredCandidatesResponse>;
  });

export const ignoredCandidatesQueryOptions = queryOptions({
  queryKey: queryKeys.admin.ignoredCandidates,
  queryFn: () => fetchIgnoredCandidates(),
});

export function useIgnoredCandidates() {
  return useSuspenseQuery(ignoredCandidatesQueryOptions);
}

export function useIgnoreCandidateCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { provider: string; externalId: string }) => {
      const res = await client.api.v1.admin["ignored-candidates"].cards.$post({ json: params });
      assertOk(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.ignoredCandidates });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.cards.all });
    },
  });
}

export function useUnignoreCandidateCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { provider: string; externalId: string }) => {
      const res = await client.api.v1.admin["ignored-candidates"].cards.$delete({ json: params });
      assertOk(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.ignoredCandidates });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.cards.all });
    },
  });
}

export function useIgnoreCandidatePrinting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      provider: string;
      externalId: string;
      finish?: string | null;
    }) => {
      const res = await client.api.v1.admin["ignored-candidates"].printings.$post({ json: params });
      assertOk(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.ignoredCandidates });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.cards.all });
    },
  });
}

export function useUnignoreCandidatePrinting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { provider: string; externalId: string; finish: string | null }) => {
      const res = await client.api.v1.admin["ignored-candidates"].printings.$delete({
        json: params,
      });
      assertOk(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.ignoredCandidates });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.cards.all });
    },
  });
}
