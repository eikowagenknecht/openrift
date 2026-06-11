import type {
  FriendGroupActivityResponse,
  FriendGroupDetailResponse,
  FriendGroupJoinPreviewResponse,
  FriendGroupListResponse,
  FriendGroupMatchesResponse,
  FriendGroupMemberDetailResponse,
  FriendGroupMemberResponse,
  FriendGroupPendingInvitesCountResponse,
  FriendGroupPendingRequestsCountResponse,
  FriendGroupResponse,
  FriendGroupShareableCollectionsResponse,
  FriendGroupShareableListsResponse,
  FriendGroupSharedCollectionDetailResponse,
  FriendGroupSharedListDetailResponse,
} from "@openrift/shared";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { callApi, callApiJson, encodeParams, serverApiClient } from "@/lib/server-fns/api-client";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

// ── Server functions: queries ───────────────────────────────────────────────

const fetchGroups = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<FriendGroupListResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1["friend-groups"].$get(),
        "Couldn't load groups",
      ),
  );

const fetchPendingInvitesCount = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<FriendGroupPendingInvitesCountResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1["friend-groups"]["pending-invites-count"].$get(),
        "Couldn't load invite count",
      ),
  );

const fetchPendingRequestsCount = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<FriendGroupPendingRequestsCountResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1["friend-groups"]["pending-requests-count"].$get(),
        "Couldn't load request count",
      ),
  );

const fetchGroupDetail = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: slug }): Promise<FriendGroupDetailResponse> => {
    const res = await callApi(
      serverApiClient(context.cookie).api.v1["friend-groups"][":slug"].$get({
        param: encodeParams({ slug }),
      }),
      "Couldn't load group",
      [404],
    );
    if ((res.status as number) === 404) {
      throw new Error("NOT_FOUND");
    }
    return res.json() as Promise<FriendGroupDetailResponse>;
  });

const fetchGroupMatches = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: slug }): Promise<FriendGroupMatchesResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1["friend-groups"][":slug"].matches.$get({
          param: encodeParams({ slug }),
        }),
        "Couldn't load matches",
      ),
  );

const fetchGroupActivity = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: slug }): Promise<FriendGroupActivityResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1["friend-groups"][":slug"].activity.$get({
          param: encodeParams({ slug }),
        }),
        "Couldn't load activity",
      ),
  );

const fetchMemberDetail = createServerFn({ method: "GET" })
  .validator((input: { slug: string; userId: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<FriendGroupMemberDetailResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1["friend-groups"][":slug"].members[":userId"].$get({
          param: encodeParams({ slug: data.slug, userId: data.userId }),
        }),
        "Couldn't load member",
      ),
  );

const fetchShareableLists = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: slug }): Promise<FriendGroupShareableListsResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1["friend-groups"][":slug"]["shareable-lists"].$get({
          param: encodeParams({ slug }),
        }),
        "Couldn't load lists",
      ),
  );

const fetchJoinPreview = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: code }): Promise<FriendGroupJoinPreviewResponse> => {
    const res = await callApi(
      serverApiClient(context.cookie).api.v1["friend-groups"].preview.$get({
        query: { code },
      }),
      "Couldn't load preview",
      [404],
    );
    if ((res.status as number) === 404) {
      throw new Error("NOT_FOUND");
    }
    return res.json() as Promise<FriendGroupJoinPreviewResponse>;
  });

const fetchSharedList = createServerFn({ method: "GET" })
  .validator((input: { slug: string; listId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }): Promise<FriendGroupSharedListDetailResponse> => {
    const res = await callApi(
      serverApiClient(context.cookie).api.v1["friend-groups"][":slug"].lists[":listId"].$get({
        param: encodeParams({ slug: data.slug, listId: data.listId }),
      }),
      "Couldn't load list",
      [404],
    );
    if ((res.status as number) === 404) {
      throw new Error("NOT_FOUND");
    }
    return res.json() as Promise<FriendGroupSharedListDetailResponse>;
  });

const fetchShareableCollections = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: slug }): Promise<FriendGroupShareableCollectionsResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1["friend-groups"][":slug"][
          "shareable-collections"
        ].$get({
          param: encodeParams({ slug }),
        }),
        "Couldn't load collections",
      ),
  );

const fetchSharedCollection = createServerFn({ method: "GET" })
  .validator((input: { slug: string; collectionId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }): Promise<FriendGroupSharedCollectionDetailResponse> => {
    const res = await callApi(
      serverApiClient(context.cookie).api.v1["friend-groups"][":slug"].collections[
        ":collectionId"
      ].$get({
        param: encodeParams({ slug: data.slug, collectionId: data.collectionId }),
      }),
      "Couldn't load collection",
      [404],
    );
    if ((res.status as number) === 404) {
      throw new Error("NOT_FOUND");
    }
    return res.json() as Promise<FriendGroupSharedCollectionDetailResponse>;
  });

// ── Hooks ───────────────────────────────────────────────────────────────────

export function friendGroupsQueryOptions(userId: string) {
  return queryOptions({
    queryKey: queryKeys.friendGroups.all(userId),
    queryFn: () => fetchGroups(),
  });
}

export function friendGroupDetailQueryOptions(userId: string, slug: string) {
  return queryOptions({
    queryKey: queryKeys.friendGroups.detail(userId, slug),
    queryFn: () => fetchGroupDetail({ data: slug }),
  });
}

function friendGroupMatchesQueryOptions(userId: string, slug: string) {
  return queryOptions({
    queryKey: queryKeys.friendGroups.matches(userId, slug),
    queryFn: () => fetchGroupMatches({ data: slug }),
  });
}

export function friendGroupJoinPreviewQueryOptions(code: string) {
  return queryOptions({
    queryKey: queryKeys.friendGroups.joinPreview(code),
    queryFn: () => fetchJoinPreview({ data: code }),
    enabled: code.length > 0,
    retry: false,
  });
}

export function useFriendGroups() {
  const userId = useRequiredUserId();
  return useSuspenseQuery(friendGroupsQueryOptions(userId));
}

/**
 * Non-suspending variant of {@link useFriendGroups} for surfaces that fetch the
 * viewer's groups opportunistically and must not suspend their subtree — e.g.
 * the create-list dialog's optional "share with groups" section, which is only
 * relevant while the dialog is open.
 * @param enabled Whether to run the query (gate on the dialog's open state to
 *   avoid an always-on fetch).
 * @returns The query result; `data` is undefined until the groups load.
 */
export function useFriendGroupsList(enabled: boolean) {
  const userId = useRequiredUserId();
  return useQuery({ ...friendGroupsQueryOptions(userId), enabled });
}

export function useFriendGroupDetail(slug: string) {
  const userId = useRequiredUserId();
  return useSuspenseQuery(friendGroupDetailQueryOptions(userId, slug));
}

export function useFriendGroupMatches(slug: string) {
  const userId = useRequiredUserId();
  return useSuspenseQuery(friendGroupMatchesQueryOptions(userId, slug));
}

export function useFriendGroupActivity(slug: string) {
  const userId = useRequiredUserId();
  return useSuspenseQuery(
    queryOptions({
      queryKey: queryKeys.friendGroups.activity(userId, slug),
      queryFn: () => fetchGroupActivity({ data: slug }),
    }),
  );
}

export function useFriendGroupMemberDetail(slug: string, memberUserId: string) {
  const userId = useRequiredUserId();
  return useSuspenseQuery(
    queryOptions({
      queryKey: queryKeys.friendGroups.memberDetail(userId, slug, memberUserId),
      queryFn: () => fetchMemberDetail({ data: { slug, userId: memberUserId } }),
    }),
  );
}

function friendGroupSharedListQueryOptions(userId: string, slug: string, listId: string) {
  return queryOptions({
    queryKey: queryKeys.friendGroups.sharedList(userId, slug, listId),
    queryFn: () => fetchSharedList({ data: { slug, listId } }),
  });
}

export function useFriendGroupSharedList(slug: string, listId: string) {
  const userId = useRequiredUserId();
  return useSuspenseQuery(friendGroupSharedListQueryOptions(userId, slug, listId));
}

export function useFriendGroupShareableLists(slug: string) {
  const userId = useRequiredUserId();
  return useSuspenseQuery(
    queryOptions({
      queryKey: queryKeys.friendGroups.shareableLists(userId, slug),
      queryFn: () => fetchShareableLists({ data: slug }),
    }),
  );
}

export function useFriendGroupShareableCollections(slug: string) {
  const userId = useRequiredUserId();
  return useSuspenseQuery(
    queryOptions({
      queryKey: queryKeys.friendGroups.shareableCollections(userId, slug),
      queryFn: () => fetchShareableCollections({ data: slug }),
    }),
  );
}

function friendGroupSharedCollectionQueryOptions(
  userId: string,
  slug: string,
  collectionId: string,
) {
  return queryOptions({
    queryKey: queryKeys.friendGroups.sharedCollection(userId, slug, collectionId),
    queryFn: () => fetchSharedCollection({ data: { slug, collectionId } }),
  });
}

export function useFriendGroupSharedCollection(slug: string, collectionId: string) {
  const userId = useRequiredUserId();
  return useSuspenseQuery(friendGroupSharedCollectionQueryOptions(userId, slug, collectionId));
}

/**
 * Polls the pending-invite count for the avatar badge. Uses `useQuery`
 * (non-suspense) so it can sit in the header without requiring an
 * authenticated route boundary.
 * @returns The query result; `count` is 0 when the viewer isn't logged in.
 */
export function useFriendGroupPendingInvitesCount(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["friend-groups", "pending-invites-count"],
    queryFn: () => fetchPendingInvitesCount(),
    staleTime: 60 * 1000,
    enabled: opts?.enabled ?? true,
  });
}

/**
 * Polls the count of pending join requests across all groups the viewer
 * owns or administers (the requests awaiting their approval). Drives the
 * header "Groups" badge alongside pending invites. Non-suspense so it can
 * sit in the header without an authenticated route boundary.
 * @returns The query result; `count` is 0 when the viewer isn't logged in.
 */
export function useFriendGroupPendingRequestsCount(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["friend-groups", "pending-requests-count"],
    queryFn: () => fetchPendingRequestsCount(),
    staleTime: 60 * 1000,
    enabled: opts?.enabled ?? true,
  });
}

// ── Server functions: mutations ─────────────────────────────────────────────

const createGroupFn = createServerFn({ method: "POST" })
  .validator(
    (input: { slug: string; name: string; description?: string | null; generateCode?: boolean }) =>
      input,
  )
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<FriendGroupResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1["friend-groups"].$post({
          json: data,
        }),
        "Couldn't create group",
      ),
  );

const updateGroupFn = createServerFn({ method: "POST" })
  .validator(
    (input: { slug: string; name?: string; description?: string | null; newSlug?: string }) =>
      input,
  )
  .middleware([withCookies])
  .handler(({ context, data }): Promise<FriendGroupResponse> => {
    const { slug, newSlug, ...fields } = data;
    return callApiJson(
      serverApiClient(context.cookie).api.v1["friend-groups"][":slug"].$patch({
        param: encodeParams({ slug }),
        json: { ...fields, slug: newSlug },
      }),
      "Couldn't update group",
    );
  });

const deleteGroupFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: slug }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1["friend-groups"][":slug"].$delete({
        param: encodeParams({ slug }),
      }),
      "Couldn't delete group",
    );
  });

const rotateCodeFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: slug }): Promise<FriendGroupResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1["friend-groups"][":slug"].code.rotate.$post({
          param: encodeParams({ slug }),
        }),
        "Couldn't rotate code",
      ),
  );

const disableCodeFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: slug }): Promise<FriendGroupResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1["friend-groups"][":slug"].code.$delete({
          param: encodeParams({ slug }),
        }),
        "Couldn't disable code",
      ),
  );

const enableCodeFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: slug }): Promise<FriendGroupResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1["friend-groups"][":slug"].code.$post({
          param: encodeParams({ slug }),
        }),
        "Couldn't enable code",
      ),
  );

const joinByCodeFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: code }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1["friend-groups"].join.$post({
        json: { code },
      }),
      "Couldn't submit join request",
    );
  });

const inviteByEmailFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; email: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1["friend-groups"][":slug"].invites.$post({
        param: encodeParams({ slug: data.slug }),
        json: { email: data.email },
      }),
      "Couldn't send invite",
    );
  });

const acceptInviteFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; userId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1["friend-groups"][":slug"].invites[
        ":userId"
      ].accept.$post({
        param: encodeParams({ slug: data.slug, userId: data.userId }),
      }),
      "Couldn't accept",
    );
  });

const declineInviteFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; userId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1["friend-groups"][":slug"].invites[":userId"].$delete({
        param: encodeParams({ slug: data.slug, userId: data.userId }),
      }),
      "Couldn't decline",
    );
  });

const leaveFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: slug }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1["friend-groups"][":slug"].leave.$post({
        param: encodeParams({ slug }),
      }),
      "Couldn't leave group",
    );
  });

const transferOwnershipFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; userId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1["friend-groups"][":slug"]["transfer-ownership"].$post({
        param: encodeParams({ slug: data.slug }),
        json: { userId: data.userId },
      }),
      "Couldn't transfer ownership",
    );
  });

const updateRoleFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; userId: string; role: "admin" | "judge" | "member" }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<FriendGroupMemberResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1["friend-groups"][":slug"].members[
          ":userId"
        ].role.$patch({
          param: encodeParams({ slug: data.slug, userId: data.userId }),
          json: { role: data.role },
        }),
        "Couldn't update role",
      ),
  );

const updateNicknameFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; userId: string; nickname: string | null }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<FriendGroupMemberResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1["friend-groups"][":slug"].members[
          ":userId"
        ].nickname.$patch({
          param: encodeParams({ slug: data.slug, userId: data.userId }),
          json: { nickname: data.nickname },
        }),
        "Couldn't update nickname",
      ),
  );

const kickMemberFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; userId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1["friend-groups"][":slug"].members[":userId"].$delete({
        param: encodeParams({ slug: data.slug, userId: data.userId }),
      }),
      "Couldn't remove member",
    );
  });

const shareListFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; listId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1["friend-groups"][":slug"].lists.$post({
        param: encodeParams({ slug: data.slug }),
        json: { listId: data.listId },
      }),
      "Couldn't share list",
    );
  });

const unshareListFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; listId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1["friend-groups"][":slug"].lists[":listId"].$delete({
        param: encodeParams({ slug: data.slug, listId: data.listId }),
      }),
      "Couldn't unshare list",
    );
  });

const shareCollectionFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; collectionId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1["friend-groups"][":slug"].collections.$post({
        param: encodeParams({ slug: data.slug }),
        json: { collectionId: data.collectionId },
      }),
      "Couldn't share collection",
    );
  });

const unshareCollectionFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; collectionId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1["friend-groups"][":slug"].collections[
        ":collectionId"
      ].$delete({
        param: encodeParams({ slug: data.slug, collectionId: data.collectionId }),
      }),
      "Couldn't unshare collection",
    );
  });

// ── Mutation hooks ──────────────────────────────────────────────────────────

export function useCreateFriendGroup() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (body: {
      slug: string;
      name: string;
      description?: string | null;
      generateCode?: boolean;
    }) => createGroupFn({ data: body }),
    invalidates: () => [queryKeys.friendGroups.all(userId)],
  });
}

export function useUpdateFriendGroup() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<
    FriendGroupResponse,
    { slug: string; name?: string; description?: string | null; newSlug?: string }
  >({
    mutationFn: (data) => updateGroupFn({ data }),
    // Invalidate both the old slug (in case the rename succeeded) and, when a
    // newSlug was set, the new one too so its detail cache doesn't carry pre-
    // rename state.
    invalidates: (variables) => [
      queryKeys.friendGroups.all(userId),
      queryKeys.friendGroups.detail(userId, variables.slug),
      ...(variables.newSlug ? [queryKeys.friendGroups.detail(userId, variables.newSlug)] : []),
    ],
  });
}

export function useDeleteFriendGroup() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (slug: string) => deleteGroupFn({ data: slug }),
    invalidates: () => [queryKeys.friendGroups.all(userId)],
  });
}

export function useRotateFriendGroupCode() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (slug: string) => rotateCodeFn({ data: slug }),
    invalidates: (slug) => [queryKeys.friendGroups.detail(userId, slug)],
  });
}

export function useDisableFriendGroupCode() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (slug: string) => disableCodeFn({ data: slug }),
    invalidates: (slug) => [queryKeys.friendGroups.detail(userId, slug)],
  });
}

export function useEnableFriendGroupCode() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (slug: string) => enableCodeFn({ data: slug }),
    invalidates: (slug) => [queryKeys.friendGroups.detail(userId, slug)],
  });
}

export function useJoinFriendGroupByCode() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (code: string) => joinByCodeFn({ data: code }),
    invalidates: () => [queryKeys.friendGroups.all(userId)],
  });
}

export function useInviteFriendByEmail() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<unknown, { slug: string; email: string }>({
    mutationFn: (data) => inviteByEmailFn({ data }),
    invalidates: (variables) => [queryKeys.friendGroups.detail(userId, variables.slug)],
  });
}

export function useAcceptFriendGroupInvite() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<unknown, { slug: string; userId: string }>({
    mutationFn: (data) => acceptInviteFn({ data }),
    invalidates: (variables) => [
      queryKeys.friendGroups.all(userId),
      queryKeys.friendGroups.detail(userId, variables.slug),
      queryKeys.friendGroups.pendingInvitesCount(userId),
    ],
  });
}

export function useDeclineFriendGroupInvite() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<unknown, { slug: string; userId: string }>({
    mutationFn: (data) => declineInviteFn({ data }),
    invalidates: (variables) => [
      queryKeys.friendGroups.all(userId),
      queryKeys.friendGroups.detail(userId, variables.slug),
      queryKeys.friendGroups.pendingInvitesCount(userId),
    ],
  });
}

export function useLeaveFriendGroup() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (slug: string) => leaveFn({ data: slug }),
    invalidates: () => [queryKeys.friendGroups.all(userId)],
  });
}

export function useTransferFriendGroupOwnership() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<unknown, { slug: string; userId: string }>({
    mutationFn: (data) => transferOwnershipFn({ data }),
    invalidates: (variables) => [queryKeys.friendGroups.detail(userId, variables.slug)],
  });
}

export function useUpdateFriendGroupRole() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<
    FriendGroupMemberResponse,
    { slug: string; userId: string; role: "admin" | "judge" | "member" }
  >({
    mutationFn: (data) => updateRoleFn({ data }),
    invalidates: (variables) => [queryKeys.friendGroups.detail(userId, variables.slug)],
  });
}

export function useUpdateFriendGroupNickname() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<
    FriendGroupMemberResponse,
    { slug: string; userId: string; nickname: string | null }
  >({
    mutationFn: (data) => updateNicknameFn({ data }),
    invalidates: (variables) => [queryKeys.friendGroups.detail(userId, variables.slug)],
  });
}

export function useKickFriendGroupMember() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<unknown, { slug: string; userId: string }>({
    mutationFn: (data) => kickMemberFn({ data }),
    invalidates: (variables) => [
      queryKeys.friendGroups.detail(userId, variables.slug),
      queryKeys.friendGroups.matches(userId, variables.slug),
    ],
  });
}

export function useShareListWithFriendGroup() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<unknown, { slug: string; listId: string }>({
    mutationFn: (data) => shareListFn({ data }),
    invalidates: (variables) => [
      queryKeys.friendGroups.detail(userId, variables.slug),
      queryKeys.friendGroups.shareableLists(userId, variables.slug),
      queryKeys.friendGroups.matches(userId, variables.slug),
      queryKeys.lists.groupShares(userId, variables.listId),
    ],
  });
}

export function useUnshareListFromFriendGroup() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<unknown, { slug: string; listId: string }>({
    mutationFn: (data) => unshareListFn({ data }),
    invalidates: (variables) => [
      queryKeys.friendGroups.detail(userId, variables.slug),
      queryKeys.friendGroups.shareableLists(userId, variables.slug),
      queryKeys.friendGroups.matches(userId, variables.slug),
      queryKeys.lists.groupShares(userId, variables.listId),
    ],
  });
}

export function useShareCollectionWithFriendGroup() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<unknown, { slug: string; collectionId: string }>({
    mutationFn: (data) => shareCollectionFn({ data }),
    invalidates: (variables) => [
      queryKeys.friendGroups.detail(userId, variables.slug),
      queryKeys.friendGroups.shareableCollections(userId, variables.slug),
      queryKeys.collections.groupShares(userId, variables.collectionId),
    ],
  });
}

export function useUnshareCollectionFromFriendGroup() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<unknown, { slug: string; collectionId: string }>({
    mutationFn: (data) => unshareCollectionFn({ data }),
    invalidates: (variables) => [
      queryKeys.friendGroups.detail(userId, variables.slug),
      queryKeys.friendGroups.shareableCollections(userId, variables.slug),
      queryKeys.collections.groupShares(userId, variables.collectionId),
    ],
  });
}
