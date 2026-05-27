import type {
  PublicListDetailResponse,
  PublicUserBundleResponse,
  UserShareStateResponse,
} from "@openrift/shared";
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
import { fetchApi, fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";

// ── Authenticated: read + manage your own bundle token ──────────────────────

const fetchUserShareStateFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<UserShareStateResponse> =>
      fetchApiJson<UserShareStateResponse>({
        errorTitle: "Couldn't load share state",
        cookie: context.cookie,
        path: "/api/v1/users/me/share",
      }),
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
      fetchApiJson<UserShareStateResponse>({
        errorTitle: "Couldn't enable sharing",
        cookie: context.cookie,
        path: "/api/v1/users/me/share",
        method: "POST",
      }),
  );

const disableUserShareFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(async ({ context }) => {
    await fetchApi({
      errorTitle: "Couldn't disable sharing",
      cookie: context.cookie,
      path: "/api/v1/users/me/share",
      method: "DELETE",
    });
  });

const rotateUserShareFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<UserShareStateResponse> =>
      fetchApiJson<UserShareStateResponse>({
        errorTitle: "Couldn't rotate share link",
        cookie: context.cookie,
        path: "/api/v1/users/me/share/rotate",
        method: "POST",
      }),
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

// ── Public: anonymous reads via the bundle token ────────────────────────────

const fetchPublicUserBundleFn = createServerFn({ method: "GET" })
  .inputValidator((input: string) => input)
  .handler(async ({ data: token }): Promise<PublicUserBundleResponse> => {
    const res = await fetchApi({
      errorTitle: "Couldn't load shared lists",
      path: `/api/v1/users/share/${encodeURIComponent(token)}`,
      acceptStatuses: [404],
    });
    if (res.status === 404) {
      throw new Error("NOT_FOUND");
    }
    return res.json() as Promise<PublicUserBundleResponse>;
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
  .inputValidator((input: { token: string; listId: string }) => input)
  .handler(async ({ data }): Promise<PublicListDetailResponse> => {
    const res = await fetchApi({
      errorTitle: "Couldn't load shared list",
      path: `/api/v1/users/share/${encodeURIComponent(data.token)}/lists/${encodeURIComponent(
        data.listId,
      )}`,
      acceptStatuses: [404],
    });
    if (res.status === 404) {
      throw new Error("NOT_FOUND");
    }
    return res.json() as Promise<PublicListDetailResponse>;
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
