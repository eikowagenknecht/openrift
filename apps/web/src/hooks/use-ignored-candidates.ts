import { queryOptions, useMutation, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { IgnoredCandidatesResponse } from "@/lib/server-fns/api-types";
import { fetchApi, fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchIgnoredCandidates = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<IgnoredCandidatesResponse> =>
      fetchApiJson<IgnoredCandidatesResponse>({
        errorTitle: "Couldn't load ignored candidates",
        cookie: context.cookie,
        path: "/api/v1/admin/ignored-candidates",
      }),
  );

export const ignoredCandidatesQueryOptions = queryOptions({
  queryKey: queryKeys.admin.ignoredCandidates,
  queryFn: () => fetchIgnoredCandidates(),
});

export function useIgnoredCandidates() {
  return useSuspenseQuery(ignoredCandidatesQueryOptions);
}

const ignoreCandidateCardFn = createServerFn({ method: "POST" })
  .inputValidator((input: { provider: string; externalId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't ignore candidate card",
      cookie: context.cookie,
      path: "/api/v1/admin/ignored-candidates/cards",
      method: "POST",
      body: data,
    });
  });

export function useIgnoreCandidateCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { provider: string; externalId: string }) =>
      ignoreCandidateCardFn({ data: params }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.ignoredCandidates });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.cards.all });
    },
  });
}

const unignoreCandidateCardFn = createServerFn({ method: "POST" })
  .inputValidator((input: { provider: string; externalId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't unignore candidate card",
      cookie: context.cookie,
      path: "/api/v1/admin/ignored-candidates/cards",
      method: "DELETE",
      body: data,
    });
  });

export function useUnignoreCandidateCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { provider: string; externalId: string }) =>
      unignoreCandidateCardFn({ data: params }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.ignoredCandidates });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.cards.all });
    },
  });
}

const ignoreCandidatePrintingFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { provider: string; externalId: string; finish?: string | null }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't ignore candidate printing",
      cookie: context.cookie,
      path: "/api/v1/admin/ignored-candidates/printings",
      method: "POST",
      body: data,
    });
  });

export function useIgnoreCandidatePrinting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { provider: string; externalId: string; finish?: string | null }) =>
      ignoreCandidatePrintingFn({ data: params }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.ignoredCandidates });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.cards.all });
    },
  });
}

const unignoreCandidatePrintingFn = createServerFn({ method: "POST" })
  .inputValidator((input: { provider: string; externalId: string; finish: string | null }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't unignore candidate printing",
      cookie: context.cookie,
      path: "/api/v1/admin/ignored-candidates/printings",
      method: "DELETE",
      body: data,
    });
  });

export function useUnignoreCandidatePrinting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { provider: string; externalId: string; finish: string | null }) =>
      unignoreCandidatePrintingFn({ data: params }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.ignoredCandidates });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.cards.all });
    },
  });
}
