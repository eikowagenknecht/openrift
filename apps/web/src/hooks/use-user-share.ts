import type {
  PublicListDetailResponse,
  PublicUserBundleResponse,
  UserShareStateResponse,
} from "@openrift/shared";
import { publicUserShareContract, userShareContract } from "@openrift/shared/contracts";
import { isDefinedError, safe } from "@orpc/client";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

// ── Authenticated: read + manage your own bundle token ──────────────────────
// Migrated to oRPC, as are the public /users/share/:token reads below.

const fetchUserShareStateFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<UserShareStateResponse> =>
      apiOrpcClient(userShareContract, context.cookie).get(),
  );

function userShareStateQueryOptions(userId: string) {
  return queryOptions({
    queryKey: queryKeys.userShare.state(userId),
    queryFn: () => fetchUserShareStateFn(),
  });
}

/**
 * Non-suspense read of the signed-in user's bundle share state. Used by the
 * share dialog and profile section — both render inline UI rather than a
 * route boundary, so we don't want them to suspend the surrounding tree.
 *
 * @returns The query result; `data` is undefined until the first fetch lands.
 */
export function useUserShareState() {
  const userId = useRequiredUserId();
  return useQuery(userShareStateQueryOptions(userId));
}

const enableUserShareFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<UserShareStateResponse> =>
      apiOrpcClient(userShareContract, context.cookie).enable(),
  );

const disableUserShareFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(async ({ context }) => {
    await apiOrpcClient(userShareContract, context.cookie).disable();
  });

const rotateUserShareFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<UserShareStateResponse> =>
      apiOrpcClient(userShareContract, context.cookie).rotate(),
  );

export function useEnableUserShare() {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => enableUserShareFn(),
    onSuccess: (data) => {
      queryClient.setQueryData<UserShareStateResponse>(queryKeys.userShare.state(userId), data);
    },
  });
}

export function useDisableUserShare() {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => disableUserShareFn(),
    onSuccess: () => {
      queryClient.setQueryData<UserShareStateResponse>(queryKeys.userShare.state(userId), {
        shareToken: null,
        isPublic: false,
      });
    },
  });
}

export function useRotateUserShare() {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => rotateUserShareFn(),
    onSuccess: (data) => {
      queryClient.setQueryData<UserShareStateResponse>(queryKeys.userShare.state(userId), data);
    },
  });
}

// ── Public reads via the bundle token ───────────────────────────────────────
// These fetches forward the viewer's session cookie so the API can apply the
// friend-group visibility bypass. Anonymous viewers (no cookie) still resolve
// the response, just restricted to lists with their own public share token.

const fetchPublicUserBundleFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .validator((input: string) => input)
  .handler(async ({ context, data: token }): Promise<PublicUserBundleResponse> => {
    // Unknown / non-public token is a typed NOT_FOUND — map to the sentinel
    // the route boundary expects without logging it as a failure.
    const { error, data } = await safe(
      apiOrpcClient(publicUserShareContract, context.cookie).bundle({ token }),
    );
    if (error) {
      if (isDefinedError(error) && error.code === "NOT_FOUND") {
        throw new Error("NOT_FOUND");
      }
      throw error;
    }
    return data;
  });

export function publicUserBundleQueryOptions(token: string) {
  return queryOptions({
    queryKey: queryKeys.userShare.publicByToken(token),
    queryFn: () => fetchPublicUserBundleFn({ data: token }),
  });
}

export function usePublicUserBundle(token: string) {
  return useSuspenseQuery(publicUserBundleQueryOptions(token));
}

const fetchPublicUserBundleListFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .validator((input: { token: string; listId: string }) => input)
  .handler(async ({ context, data }): Promise<PublicListDetailResponse> => {
    // Unknown token/list is a typed NOT_FOUND — map to the sentinel the route
    // boundary expects. A malformed listId (400) still surfaces as an error,
    // matching the previous hc behavior.
    const { error, data: result } = await safe(
      apiOrpcClient(publicUserShareContract, context.cookie).bundleList({
        token: data.token,
        listId: data.listId,
      }),
    );
    if (error) {
      if (isDefinedError(error) && error.code === "NOT_FOUND") {
        throw new Error("NOT_FOUND");
      }
      throw error;
    }
    return result;
  });

export function publicUserBundleListQueryOptions(token: string, listId: string) {
  return queryOptions({
    queryKey: queryKeys.userShare.publicListByToken(token, listId),
    queryFn: () => fetchPublicUserBundleListFn({ data: { token, listId } }),
  });
}

export function usePublicUserBundleList(token: string, listId: string) {
  return useSuspenseQuery(publicUserBundleListQueryOptions(token, listId));
}
