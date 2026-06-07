import { queryOptions, useMutation, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { callApi, callApiJson, serverApiClient } from "@/lib/server-fns/api-client";
import type { IgnoredCandidatesResponse } from "@/lib/server-fns/api-types";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchIgnoredCandidates = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<IgnoredCandidatesResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.admin.v1["ignored-candidates"].$get(),
        "Couldn't load ignored candidates",
      ),
  );

export const ignoredCandidatesQueryOptions = queryOptions({
  queryKey: queryKeys.admin.ignoredCandidates,
  queryFn: () => fetchIgnoredCandidates(),
});

export function useIgnoredCandidates() {
  return useSuspenseQuery(ignoredCandidatesQueryOptions);
}

const ignoreCandidateCardFn = createServerFn({ method: "POST" })
  .validator((input: { provider: string; externalId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1["ignored-candidates"].cards.$post({
        json: data,
      }),
      "Couldn't ignore candidate card",
    );
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
  .validator((input: { provider: string; externalId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1["ignored-candidates"].cards.$delete({
        json: data,
      }),
      "Couldn't unignore candidate card",
    );
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
  .validator((input: { provider: string; externalId: string; finish?: string | null }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1["ignored-candidates"].printings.$post({
        json: data,
      }),
      "Couldn't ignore candidate printing",
    );
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
  .validator((input: { provider: string; externalId: string; finish: string | null }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1["ignored-candidates"].printings.$delete({
        json: data,
      }),
      "Couldn't unignore candidate printing",
    );
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
