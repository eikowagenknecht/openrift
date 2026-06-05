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
import {
  callApi,
  callApiJson,
  encodeParams,
  okJson,
  serverApiClient,
} from "@/lib/server-fns/api-client";
import { withCookies } from "@/lib/server-fns/middleware";

// ── Authenticated: read + manage your own bundle token ──────────────────────

const fetchUserShareStateFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<UserShareStateResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1.users.me.share.$get(),
        "Couldn't load share state",
      ),
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
      callApiJson(
        serverApiClient(context.cookie).api.v1.users.me.share.$post(),
        "Couldn't enable sharing",
      ),
  );

const disableUserShareFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(async ({ context }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1.users.me.share.$delete(),
      "Couldn't disable sharing",
    );
  });

const rotateUserShareFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<UserShareStateResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1.users.me.share.rotate.$post(),
        "Couldn't rotate share link",
      ),
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

// ── Public reads via the bundle token ───────────────────────────────────────
// These fetches forward the viewer's session cookie so the API can apply the
// friend-group visibility bypass. Anonymous viewers (no cookie) still resolve
// the response, just restricted to lists with their own public share token.

const fetchPublicUserBundleFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .inputValidator((input: string) => input)
  .handler(async ({ context, data: token }): Promise<PublicUserBundleResponse> => {
    const res = await callApi(
      serverApiClient(context.cookie).api.v1.users.share[":token"].$get({
        param: encodeParams({ token }),
      }),
      "Couldn't load shared lists",
      [404],
    );
    if ((res.status as number) === 404) {
      throw new Error("NOT_FOUND");
    }
    return okJson(res);
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
  .inputValidator((input: { token: string; listId: string }) => input)
  .handler(async ({ context, data }): Promise<PublicListDetailResponse> => {
    const res = await callApi(
      serverApiClient(context.cookie).api.v1.users.share[":token"].lists[":listId"].$get({
        param: encodeParams({ token: data.token, listId: data.listId }),
      }),
      "Couldn't load shared list",
      [404],
    );
    if ((res.status as number) === 404) {
      throw new Error("NOT_FOUND");
    }
    return okJson(res);
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
