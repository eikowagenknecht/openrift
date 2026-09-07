import { publicUserShareContract } from "@openrift/shared/contracts/public-user-share";
import { userShareContract } from "@openrift/shared/contracts/user-share";
import type { PublicListDetailResponse } from "@openrift/shared/types/api/list";
import type {
  PublicUserBundleResponse,
  UserShareStateResponse,
} from "@openrift/shared/types/api/user-share";
import { isDefinedError, safe } from "@orpc/client";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { userShareKeys } from "@/features/groups/lib/groups-query-keys";
import { useRequiredUserId } from "@/lib/auth-session";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchUserShareStateFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<UserShareStateResponse> =>
    apiOrpcClient(userShareContract, context.cookie).get(),
  );

function userShareStateQueryOptions(userId: string) {
  return queryOptions({
    queryKey: userShareKeys.state(userId),
    queryFn: () => fetchUserShareStateFn(),
  });
}

/** Non-suspense: used by inline UI (share dialog, profile section), not a route boundary. */
export function useUserShareState() {
  const userId = useRequiredUserId();
  return useQuery(userShareStateQueryOptions(userId));
}

const enableUserShareFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(({ context }): Promise<UserShareStateResponse> =>
    apiOrpcClient(userShareContract, context.cookie).enable(),
  );

const disableUserShareFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(async ({ context }) => {
    await apiOrpcClient(userShareContract, context.cookie).disable();
  });

const rotateUserShareFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(({ context }): Promise<UserShareStateResponse> =>
    apiOrpcClient(userShareContract, context.cookie).rotate(),
  );

export function useEnableUserShare() {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => enableUserShareFn(),
    onSuccess: (data) => {
      queryClient.setQueryData<UserShareStateResponse>(userShareKeys.state(userId), data);
    },
  });
}

export function useDisableUserShare() {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => disableUserShareFn(),
    onSuccess: () => {
      queryClient.setQueryData<UserShareStateResponse>(userShareKeys.state(userId), {
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
      queryClient.setQueryData<UserShareStateResponse>(userShareKeys.state(userId), data);
    },
  });
}

// Forwards the viewer's session cookie so the API can apply the friend-group
// visibility bypass; anonymous viewers still resolve, restricted to lists
// with their own public share token.
const fetchPublicUserBundleFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .validator((input: string) => input)
  .handler(async ({ context, data: token }): Promise<PublicUserBundleResponse> => {
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
    queryKey: userShareKeys.publicByToken(token),
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
    queryKey: userShareKeys.publicListByToken(token, listId),
    queryFn: () => fetchPublicUserBundleListFn({ data: { token, listId } }),
  });
}

export function usePublicUserBundleList(token: string, listId: string) {
  return useSuspenseQuery(publicUserBundleListQueryOptions(token, listId));
}
