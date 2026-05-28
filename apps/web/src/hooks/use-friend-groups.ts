import type {
  FriendGroupDetailResponse,
  FriendGroupJoinPreviewResponse,
  FriendGroupListResponse,
  FriendGroupMatchesResponse,
  FriendGroupMemberDetailResponse,
  FriendGroupMemberResponse,
  FriendGroupPendingInvitesCountResponse,
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
import { fetchApi, fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

// ── Server functions: queries ───────────────────────────────────────────────

const fetchGroups = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<FriendGroupListResponse> =>
      fetchApiJson<FriendGroupListResponse>({
        errorTitle: "Couldn't load groups",
        cookie: context.cookie,
        path: "/api/v1/friend-groups",
      }),
  );

const fetchPendingInvitesCount = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<FriendGroupPendingInvitesCountResponse> =>
      fetchApiJson<FriendGroupPendingInvitesCountResponse>({
        errorTitle: "Couldn't load invite count",
        cookie: context.cookie,
        path: "/api/v1/friend-groups/pending-invites-count",
      }),
  );

const fetchGroupDetail = createServerFn({ method: "GET" })
  .inputValidator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: slug }): Promise<FriendGroupDetailResponse> => {
    const res = await fetchApi({
      errorTitle: "Couldn't load group",
      cookie: context.cookie,
      path: `/api/v1/friend-groups/${encodeURIComponent(slug)}`,
      acceptStatuses: [404],
    });
    if (res.status === 404) {
      throw new Error("NOT_FOUND");
    }
    return res.json() as Promise<FriendGroupDetailResponse>;
  });

const fetchGroupMatches = createServerFn({ method: "GET" })
  .inputValidator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: slug }): Promise<FriendGroupMatchesResponse> =>
      fetchApiJson<FriendGroupMatchesResponse>({
        errorTitle: "Couldn't load matches",
        cookie: context.cookie,
        path: `/api/v1/friend-groups/${encodeURIComponent(slug)}/matches`,
      }),
  );

const fetchMemberDetail = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string; userId: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<FriendGroupMemberDetailResponse> =>
      fetchApiJson<FriendGroupMemberDetailResponse>({
        errorTitle: "Couldn't load member",
        cookie: context.cookie,
        path: `/api/v1/friend-groups/${encodeURIComponent(data.slug)}/members/${encodeURIComponent(data.userId)}`,
      }),
  );

const fetchShareableLists = createServerFn({ method: "GET" })
  .inputValidator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: slug }): Promise<FriendGroupShareableListsResponse> =>
      fetchApiJson<FriendGroupShareableListsResponse>({
        errorTitle: "Couldn't load lists",
        cookie: context.cookie,
        path: `/api/v1/friend-groups/${encodeURIComponent(slug)}/shareable-lists`,
      }),
  );

const fetchJoinPreview = createServerFn({ method: "GET" })
  .inputValidator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: code }): Promise<FriendGroupJoinPreviewResponse> => {
    const res = await fetchApi({
      errorTitle: "Couldn't load preview",
      cookie: context.cookie,
      path: `/api/v1/friend-groups/preview?code=${encodeURIComponent(code)}`,
      acceptStatuses: [404],
    });
    if (res.status === 404) {
      throw new Error("NOT_FOUND");
    }
    return res.json() as Promise<FriendGroupJoinPreviewResponse>;
  });

const fetchSharedList = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string; listId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }): Promise<FriendGroupSharedListDetailResponse> => {
    const res = await fetchApi({
      errorTitle: "Couldn't load list",
      cookie: context.cookie,
      path: `/api/v1/friend-groups/${encodeURIComponent(data.slug)}/lists/${encodeURIComponent(data.listId)}`,
      acceptStatuses: [404],
    });
    if (res.status === 404) {
      throw new Error("NOT_FOUND");
    }
    return res.json() as Promise<FriendGroupSharedListDetailResponse>;
  });

const fetchShareableCollections = createServerFn({ method: "GET" })
  .inputValidator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: slug }): Promise<FriendGroupShareableCollectionsResponse> =>
      fetchApiJson<FriendGroupShareableCollectionsResponse>({
        errorTitle: "Couldn't load collections",
        cookie: context.cookie,
        path: `/api/v1/friend-groups/${encodeURIComponent(slug)}/shareable-collections`,
      }),
  );

const fetchSharedCollection = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string; collectionId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }): Promise<FriendGroupSharedCollectionDetailResponse> => {
    const res = await fetchApi({
      errorTitle: "Couldn't load collection",
      cookie: context.cookie,
      path: `/api/v1/friend-groups/${encodeURIComponent(data.slug)}/collections/${encodeURIComponent(data.collectionId)}`,
      acceptStatuses: [404],
    });
    if (res.status === 404) {
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

export function useFriendGroupDetail(slug: string) {
  const userId = useRequiredUserId();
  return useSuspenseQuery(friendGroupDetailQueryOptions(userId, slug));
}

export function useFriendGroupMatches(slug: string) {
  const userId = useRequiredUserId();
  return useSuspenseQuery(friendGroupMatchesQueryOptions(userId, slug));
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

// ── Server functions: mutations ─────────────────────────────────────────────

const createGroupFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { slug: string; name: string; description?: string | null; generateCode?: boolean }) =>
      input,
  )
  .middleware([withCookies])
  .handler(({ context, data }) =>
    fetchApiJson<FriendGroupResponse>({
      errorTitle: "Couldn't create group",
      cookie: context.cookie,
      path: "/api/v1/friend-groups",
      method: "POST",
      body: data,
    }),
  );

const updateGroupFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { slug: string; name?: string; description?: string | null; newSlug?: string }) =>
      input,
  )
  .middleware([withCookies])
  .handler(({ context, data }) => {
    const { slug, newSlug, ...fields } = data;
    return fetchApiJson<FriendGroupResponse>({
      errorTitle: "Couldn't update group",
      cookie: context.cookie,
      path: `/api/v1/friend-groups/${encodeURIComponent(slug)}`,
      method: "PATCH",
      body: { ...fields, slug: newSlug },
    });
  });

const deleteGroupFn = createServerFn({ method: "POST" })
  .inputValidator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: slug }) => {
    await fetchApi({
      errorTitle: "Couldn't delete group",
      cookie: context.cookie,
      path: `/api/v1/friend-groups/${encodeURIComponent(slug)}`,
      method: "DELETE",
    });
  });

const rotateCodeFn = createServerFn({ method: "POST" })
  .inputValidator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: slug }) =>
    fetchApiJson<FriendGroupResponse>({
      errorTitle: "Couldn't rotate code",
      cookie: context.cookie,
      path: `/api/v1/friend-groups/${encodeURIComponent(slug)}/code/rotate`,
      method: "POST",
    }),
  );

const disableCodeFn = createServerFn({ method: "POST" })
  .inputValidator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: slug }) =>
    fetchApiJson<FriendGroupResponse>({
      errorTitle: "Couldn't disable code",
      cookie: context.cookie,
      path: `/api/v1/friend-groups/${encodeURIComponent(slug)}/code`,
      method: "DELETE",
    }),
  );

const enableCodeFn = createServerFn({ method: "POST" })
  .inputValidator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: slug }) =>
    fetchApiJson<FriendGroupResponse>({
      errorTitle: "Couldn't enable code",
      cookie: context.cookie,
      path: `/api/v1/friend-groups/${encodeURIComponent(slug)}/code`,
      method: "POST",
    }),
  );

const joinByCodeFn = createServerFn({ method: "POST" })
  .inputValidator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: code }) => {
    await fetchApi({
      errorTitle: "Couldn't submit join request",
      cookie: context.cookie,
      path: "/api/v1/friend-groups/join",
      method: "POST",
      body: { code },
    });
  });

const inviteByEmailFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; email: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't send invite",
      cookie: context.cookie,
      path: `/api/v1/friend-groups/${encodeURIComponent(data.slug)}/invites`,
      method: "POST",
      body: { email: data.email },
    });
  });

const acceptInviteFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; userId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't accept",
      cookie: context.cookie,
      path: `/api/v1/friend-groups/${encodeURIComponent(data.slug)}/invites/${encodeURIComponent(data.userId)}/accept`,
      method: "POST",
    });
  });

const declineInviteFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; userId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't decline",
      cookie: context.cookie,
      path: `/api/v1/friend-groups/${encodeURIComponent(data.slug)}/invites/${encodeURIComponent(data.userId)}`,
      method: "DELETE",
    });
  });

const leaveFn = createServerFn({ method: "POST" })
  .inputValidator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: slug }) => {
    await fetchApi({
      errorTitle: "Couldn't leave group",
      cookie: context.cookie,
      path: `/api/v1/friend-groups/${encodeURIComponent(slug)}/leave`,
      method: "POST",
    });
  });

const transferOwnershipFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; userId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't transfer ownership",
      cookie: context.cookie,
      path: `/api/v1/friend-groups/${encodeURIComponent(data.slug)}/transfer-ownership`,
      method: "POST",
      body: { userId: data.userId },
    });
  });

const updateRoleFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; userId: string; role: "admin" | "member" }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    fetchApiJson<FriendGroupMemberResponse>({
      errorTitle: "Couldn't update role",
      cookie: context.cookie,
      path: `/api/v1/friend-groups/${encodeURIComponent(data.slug)}/members/${encodeURIComponent(data.userId)}/role`,
      method: "PATCH",
      body: { role: data.role },
    }),
  );

const updateNicknameFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; userId: string; nickname: string | null }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    fetchApiJson<FriendGroupMemberResponse>({
      errorTitle: "Couldn't update nickname",
      cookie: context.cookie,
      path: `/api/v1/friend-groups/${encodeURIComponent(data.slug)}/members/${encodeURIComponent(data.userId)}/nickname`,
      method: "PATCH",
      body: { nickname: data.nickname },
    }),
  );

const kickMemberFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; userId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't remove member",
      cookie: context.cookie,
      path: `/api/v1/friend-groups/${encodeURIComponent(data.slug)}/members/${encodeURIComponent(data.userId)}`,
      method: "DELETE",
    });
  });

const shareListFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; listId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't share list",
      cookie: context.cookie,
      path: `/api/v1/friend-groups/${encodeURIComponent(data.slug)}/lists`,
      method: "POST",
      body: { listId: data.listId },
    });
  });

const unshareListFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; listId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't unshare list",
      cookie: context.cookie,
      path: `/api/v1/friend-groups/${encodeURIComponent(data.slug)}/lists/${encodeURIComponent(data.listId)}`,
      method: "DELETE",
    });
  });

const shareCollectionFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; collectionId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't share collection",
      cookie: context.cookie,
      path: `/api/v1/friend-groups/${encodeURIComponent(data.slug)}/collections`,
      method: "POST",
      body: { collectionId: data.collectionId },
    });
  });

const unshareCollectionFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; collectionId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't unshare collection",
      cookie: context.cookie,
      path: `/api/v1/friend-groups/${encodeURIComponent(data.slug)}/collections/${encodeURIComponent(data.collectionId)}`,
      method: "DELETE",
    });
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
    { slug: string; userId: string; role: "admin" | "member" }
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
