import type {
  MetaCreditVisibility,
  MetaCreditVisibilityResponse,
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
 * The meta archive's signed-in surfaces (ADR-014's User submissions and
 * Contributor credit). Nothing here writes anything public: a submission stages
 * one decklist for review, and the credit setting only decides whether the
 * reader of an event page sees a name.
 */

// ── Submitting a decklist ────────────────────────────────────────────────────

/**
 * Why a submission was turned away before it was staged. Each maps to a typed
 * oRPC error the endpoint declares, and each is a sentence the form shows next
 * to itself rather than a toast — the fix is in the form.
 */
type MetaSubmissionRefusal = "cap" | "invalid" | "event-missing";

/** A submission either staged, or refused for a reason the submitter can act on. */
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
    // The three declared errors come back as answers rather than throws: each
    // one names something the person can fix in the form they are still
    // looking at, and the global mutation toast would put that sentence
    // somewhere the form is not. Anything else is a real failure and throws.
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

/**
 * Submits one decklist to the archive. The endpoint stages it for review;
 * nothing it writes is public until someone accepts it.
 *
 * Resolves rather than rejects on the three refusals the endpoint declares, so
 * the form can show the reason in place. Unexpected failures still reject and
 * reach the global mutation error toast.
 *
 * @returns A React Query mutation; call `.mutateAsync(input)`.
 */
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

// ── The contributor's own ledger ─────────────────────────────────────────────

const fetchMetaSubmissionsFn = createServerFn({ method: "GET" })
  .validator((input: { cursor?: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<MetaSubmissionListResponse> =>
    apiOrpcClient(metaSubmissionsContract, context.cookie).list(
      data.cursor ? { cursor: data.cursor } : {},
    ),
  );

/**
 * Query options for the viewer's own decklist submissions and what review did
 * about them. Shared by the hook below and the /meta/submissions loader. The
 * endpoint scopes to the session user, so the id here only keys the cache.
 *
 * @param userId The viewer, for the cache key.
 * @returns The submissions infinite-query options.
 */
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

/**
 * The viewer's own decklist submissions, newest first.
 * @returns The submissions infinite query.
 */
export function useMetaSubmissions() {
  const userId = useRequiredUserId();
  return useInfiniteQuery(metaSubmissionsQueryOptions(userId));
}

// ── Contributor credit ───────────────────────────────────────────────────────

const fetchMetaCreditVisibilityFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<MetaCreditVisibilityResponse> =>
    apiOrpcClient(metaSubmissionsContract, context.cookie).creditVisibility(),
  );

/**
 * Query options for whether the viewer's name appears on the archive pages they
 * contributed to.
 *
 * @param userId The viewer, for the cache key.
 * @returns The credit-visibility query options.
 */
function metaCreditVisibilityQueryOptions(userId: string) {
  return queryOptions({
    queryKey: queryKeys.metaSubmissions.creditVisibility(userId),
    queryFn: (): Promise<MetaCreditVisibilityResponse> =>
      fetchMetaCreditVisibilityFn() as Promise<MetaCreditVisibilityResponse>,
  });
}

/**
 * Non-suspense read of the viewer's credit setting. The profile section renders
 * inline, so it must not suspend the settings page around it.
 *
 * @returns The query result; `data` is undefined until the first fetch lands.
 */
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
 * Changes whether the viewer is credited on the archive pages they contributed
 * to. No archive row moves either way — the public read joins the setting at
 * render, so opting in credits every past contribution at once and opting out
 * removes them all (ADR-014).
 *
 * @returns A React Query mutation; call `.mutate({ visibility })`.
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
