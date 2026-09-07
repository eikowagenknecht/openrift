import type {
  MetaCreditVisibility,
  MetaCreditVisibilityResponse,
  MetaEventCorrectionInput,
  MetaSubmissionInput,
  MetaSubmissionListResponse,
  MetaSubmissionResult,
} from "@openrift/shared";
import { metaSubmissionsContract } from "@openrift/shared/contracts/meta-submissions";
import { isDefinedError, safe } from "@orpc/client";
import {
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

/**
 * The meta archive's signed-in surfaces. Nothing here writes anything public: a
 * submission stages one decklist for review, and the credit setting only
 * decides whether the reader of an event page sees a name.
 */

/** Each variant maps to a typed oRPC error the endpoint declares. */
type MetaSubmissionRefusal = "cap" | "invalid" | "event-missing";

export type MetaSubmissionOutcome =
  | { ok: true; result: MetaSubmissionResult }
  | { ok: false; refusal: MetaSubmissionRefusal; message: string };

const submitMetaDeckFn = createServerFn({ method: "POST" })
  .validator((input: MetaSubmissionInput) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }): Promise<MetaSubmissionOutcome> => {
    const { error, data: result } = await safe(
      apiOrpcClient(metaSubmissionsContract, context.cookie).submit(data),
    );
    if (!error) {
      return { ok: true, result };
    }
    // Declared errors resolve; anything else throws.
    if (isDefinedError(error)) {
      if (error.code === "TOO_MANY_REQUESTS") {
        return { ok: false, refusal: "cap", message: error.message };
      }
      if (error.code === "BAD_REQUEST") {
        return { ok: false, refusal: "invalid", message: error.message };
      }
      if (error.code === "NOT_FOUND") {
        return { ok: false, refusal: "event-missing", message: error.message };
      }
    }
    throw error;
  });

export function useSubmitMetaDeck() {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MetaSubmissionInput): Promise<MetaSubmissionOutcome> =>
      submitMetaDeckFn({ data: input }) as Promise<MetaSubmissionOutcome>,
    onSuccess: (outcome) => {
      if (outcome.ok) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.metaSubmissions.all(userId) });
      }
    },
  });
}

type MetaEventCorrectionOutcome =
  | { ok: true }
  | { ok: false; refusal: Exclude<MetaSubmissionRefusal, "invalid">; message: string };

const submitMetaEventCorrectionFn = createServerFn({ method: "POST" })
  .validator((input: MetaEventCorrectionInput) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }): Promise<MetaEventCorrectionOutcome> => {
    const { error } = await safe(
      apiOrpcClient(metaSubmissionsContract, context.cookie).submitEventCorrection(data),
    );
    if (!error) {
      return { ok: true };
    }
    if (isDefinedError(error)) {
      if (error.code === "TOO_MANY_REQUESTS") {
        return { ok: false, refusal: "cap", message: error.message };
      }
      if (error.code === "NOT_FOUND") {
        return { ok: false, refusal: "event-missing", message: error.message };
      }
    }
    throw error;
  });

/** Unlike a decklist submission, this stages nothing; an admin applies it to the event themselves. */
export function useSubmitMetaEventCorrection() {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MetaEventCorrectionInput): Promise<MetaEventCorrectionOutcome> =>
      submitMetaEventCorrectionFn({ data: input }) as Promise<MetaEventCorrectionOutcome>,
    onSuccess: (outcome) => {
      if (outcome.ok) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.metaSubmissions.all(userId) });
      }
    },
  });
}

const fetchMetaSubmissionsFn = createServerFn({ method: "GET" })
  .validator((input: { cursor?: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<MetaSubmissionListResponse> =>
    apiOrpcClient(metaSubmissionsContract, context.cookie).list(
      data.cursor ? { cursor: data.cursor } : {},
    ),
  );

/** The endpoint scopes to the session user; `userId` here only keys the cache. */
export function metaSubmissionsQueryOptions(userId: string) {
  return infiniteQueryOptions({
    queryKey: queryKeys.metaSubmissions.all(userId),
    queryFn: ({ pageParam }): Promise<MetaSubmissionListResponse> =>
      fetchMetaSubmissionsFn({
        data: { cursor: pageParam },
      }) as Promise<MetaSubmissionListResponse>,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: MetaSubmissionListResponse) => lastPage.nextCursor ?? undefined,
  });
}

export function useMetaSubmissions() {
  const userId = useRequiredUserId();
  return useInfiniteQuery(metaSubmissionsQueryOptions(userId));
}

const fetchMetaCreditVisibilityFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<MetaCreditVisibilityResponse> =>
    apiOrpcClient(metaSubmissionsContract, context.cookie).creditVisibility(),
  );

function metaCreditVisibilityQueryOptions(userId: string) {
  return queryOptions({
    queryKey: queryKeys.metaSubmissions.creditVisibility(userId),
    queryFn: (): Promise<MetaCreditVisibilityResponse> =>
      fetchMetaCreditVisibilityFn() as Promise<MetaCreditVisibilityResponse>,
  });
}

/** Non-suspense: the profile section renders inline and must not suspend the settings page. */
export function useMetaCreditVisibility() {
  const userId = useRequiredUserId();
  return useQuery(metaCreditVisibilityQueryOptions(userId));
}

const setMetaCreditVisibilityFn = createServerFn({ method: "POST" })
  .validator((input: { visibility: MetaCreditVisibility }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<MetaCreditVisibilityResponse> =>
    apiOrpcClient(metaSubmissionsContract, context.cookie).setCreditVisibility(data),
  );

/**
 * No archive row moves either way: the public read joins the setting at render,
 * so opting in or out applies to every past contribution at once.
 */
export function useSetMetaCreditVisibility() {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { visibility: MetaCreditVisibility }) =>
      setMetaCreditVisibilityFn({ data: input }),
    onSuccess: (data) => {
      queryClient.setQueryData<MetaCreditVisibilityResponse>(
        queryKeys.metaSubmissions.creditVisibility(userId),
        data,
      );
    },
  });
}
