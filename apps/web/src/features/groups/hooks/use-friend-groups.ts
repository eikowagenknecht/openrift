import { friendGroupsContract } from "@openrift/shared/contracts/friend-groups";
import { publicFriendGroupsContract } from "@openrift/shared/contracts/public-friend-groups";
import type {
  FriendGroupActivityResponse,
  FriendGroupDetailResponse,
  FriendGroupDiscordLinkCodeResponse,
  FriendGroupDiscordLinksResponse,
  FriendGroupJoinPreviewResponse,
  FriendGroupListResponse,
  FriendGroupMatchesResponse,
  FriendGroupMatchRow,
  FriendGroupMemberDetailResponse,
  FriendGroupMemberResponse,
  FriendGroupPendingRequestsCountResponse,
  FriendGroupResponse,
  FriendGroupShareableCollectionsResponse,
  FriendGroupShareableListsResponse,
  FriendGroupSharedCollectionDetailResponse,
  FriendGroupSharedListDetailResponse,
} from "@openrift/shared/types/api/friend-group";
import { isDefinedError, safe } from "@orpc/client";
import type { QueryClient } from "@tanstack/react-query";
import { queryOptions, useQueries, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ParsedLocation } from "@tanstack/react-router";
import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { collectionsKeys } from "@/features/collections/lib/collections-query-keys";
import type { BoxWantRow, BoxWantsLookup } from "@/features/decks/lib/box-wants";
import { buildBoxWantsLookup, EMPTY_BOX_WANTS } from "@/features/decks/lib/box-wants";
import { friendGroupsKeys } from "@/features/groups/lib/groups-query-keys";
import type { GroupMatchPanels } from "@/features/groups/lib/trade-derivation";
import { listsKeys } from "@/features/lists/lib/lists-query-keys";
import { useRequiredUserId } from "@/lib/auth-session";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchGroups = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<FriendGroupListResponse> =>
    apiOrpcClient(friendGroupsContract, context.cookie).list(),
  );

const fetchPendingRequestsCount = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<FriendGroupPendingRequestsCountResponse> =>
    apiOrpcClient(friendGroupsContract, context.cookie).pendingRequestsCount(),
  );

const fetchGroupDetail = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: slug }): Promise<FriendGroupDetailResponse> => {
    // The route boundary expects a thrown "NOT_FOUND" for an unknown or hidden group.
    const { error, data } = await safe(
      apiOrpcClient(friendGroupsContract, context.cookie).get({ slug }),
    );
    if (error) {
      if (isDefinedError(error) && error.code === "NOT_FOUND") {
        throw new Error("NOT_FOUND");
      }
      throw error;
    }
    return data;
  });

const fetchGroupMatches = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: slug }): Promise<FriendGroupMatchesResponse> =>
    apiOrpcClient(friendGroupsContract, context.cookie).matches({ slug }),
  );

const fetchGroupBoxWants = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: slug }): Promise<{ items: BoxWantRow[] }> =>
    apiOrpcClient(friendGroupsContract, context.cookie).boxWants({ slug }),
  );

const fetchGroupActivity = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: slug }): Promise<FriendGroupActivityResponse> =>
    apiOrpcClient(friendGroupsContract, context.cookie).activity({ slug }),
  );

const fetchMemberDetail = createServerFn({ method: "GET" })
  .validator((input: { slug: string; userId: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<FriendGroupMemberDetailResponse> =>
    apiOrpcClient(friendGroupsContract, context.cookie).getMemberDetail(data),
  );

const fetchShareableLists = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: slug }): Promise<FriendGroupShareableListsResponse> =>
    apiOrpcClient(friendGroupsContract, context.cookie).shareableLists({ slug }),
  );

const fetchJoinPreview = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: code }): Promise<FriendGroupJoinPreviewResponse> => {
    // 404 (no group matches the code) maps to the NOT_FOUND sentinel.
    const { error, data } = await safe(
      apiOrpcClient(publicFriendGroupsContract, context.cookie).joinPreview({ code }),
    );
    if (error) {
      if (isDefinedError(error) && error.code === "NOT_FOUND") {
        throw new Error("NOT_FOUND");
      }
      throw error;
    }
    return data;
  });

const fetchSharedList = createServerFn({ method: "GET" })
  .validator((input: { slug: string; listId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }): Promise<FriendGroupSharedListDetailResponse> => {
    const { error, data: result } = await safe(
      apiOrpcClient(friendGroupsContract, context.cookie).getSharedList(data),
    );
    if (error) {
      if (isDefinedError(error) && error.code === "NOT_FOUND") {
        throw new Error("NOT_FOUND");
      }
      throw error;
    }
    return result;
  });

const fetchShareableCollections = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: slug }): Promise<FriendGroupShareableCollectionsResponse> =>
    apiOrpcClient(friendGroupsContract, context.cookie).shareableCollections({ slug }),
  );

const fetchSharedCollection = createServerFn({ method: "GET" })
  .validator((input: { slug: string; collectionId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }): Promise<FriendGroupSharedCollectionDetailResponse> => {
    const { error, data: result } = await safe(
      apiOrpcClient(friendGroupsContract, context.cookie).getSharedCollection(data),
    );
    if (error) {
      if (isDefinedError(error) && error.code === "NOT_FOUND") {
        throw new Error("NOT_FOUND");
      }
      throw error;
    }
    return result;
  });

export function friendGroupsQueryOptions(userId: string) {
  return queryOptions({
    queryKey: friendGroupsKeys.all(userId),
    queryFn: () => fetchGroups(),
  });
}

function friendGroupDetailQueryOptions(userId: string, slug: string) {
  return queryOptions({
    queryKey: friendGroupsKeys.detail(userId, slug),
    queryFn: () => fetchGroupDetail({ data: slug }),
  });
}

/**
 * Redirects to the canonical slug when the API resolved a rename alias, so
 * bookmarks and trade-email links survive a group rename.
 */
export async function ensureFriendGroupDetailCanonical(options: {
  queryClient: QueryClient;
  userId: string;
  slug: string;
  location: ParsedLocation;
}): Promise<FriendGroupDetailResponse> {
  const { queryClient, userId, slug, location } = options;
  const detail = await queryClient.query({
    ...friendGroupDetailQueryOptions(userId, slug),
    staleTime: "static",
  });
  const canonical = detail.group.slug;
  if (canonical !== slug) {
    throw redirect({
      href: location.href.replace(`/groups/${slug}`, `/groups/${canonical}`),
      replace: true,
    });
  }
  return detail;
}

function friendGroupMatchesQueryOptions(userId: string, slug: string) {
  return queryOptions({
    queryKey: friendGroupsKeys.matches(userId, slug),
    queryFn: () => fetchGroupMatches({ data: slug }),
    // Trade actions invalidate this key directly; the window only covers a
    // suggestion created by someone else's list edit.
    staleTime: 60_000,
  });
}

function friendGroupBoxWantsQueryOptions(userId: string, slug: string) {
  return queryOptions({
    queryKey: friendGroupsKeys.boxWants(userId, slug),
    queryFn: () => fetchGroupBoxWants({ data: slug }),
    // No mutation invalidates this key, so counts can lag up to a minute
    // behind a take or a wishlist edit.
    staleTime: 60_000,
  });
}

export function friendGroupJoinPreviewQueryOptions(code: string) {
  return queryOptions({
    queryKey: friendGroupsKeys.joinPreview(code),
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
 * Non-suspending variant of {@link useFriendGroups} for surfaces (e.g. a
 * dialog's optional section) that must not suspend their subtree.
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

/**
 * The match rows of several groups at once, pooled into one pair of arrays.
 * Must not suspend: each group's data must paint independently of the others.
 */
export function useFriendGroupMatchesForSlugs(
  slugs: readonly string[],
): FriendGroupMatchesResponse {
  const userId = useRequiredUserId();
  return useQueries({
    queries: slugs.map((slug) => friendGroupMatchesQueryOptions(userId, slug)),
    combine: (results) => ({
      othersHaveYourWants: results.flatMap((result) => result.data?.othersHaveYourWants ?? []),
      othersWantYourHaves: results.flatMap((result) => result.data?.othersWantYourHaves ?? []),
    }),
  });
}

/**
 * The same rows kept apart per group, for a surface that shows several groups
 * side by side. A group still loading is absent from the result, not zero.
 */
export function useFriendGroupMatchPanels(
  slugs: readonly string[],
): GroupMatchPanels<FriendGroupMatchRow>[] {
  const userId = useRequiredUserId();
  return useQueries({
    queries: slugs.map((slug) => friendGroupMatchesQueryOptions(userId, slug)),
    combine: (results) =>
      results.flatMap((result, index) => {
        const slug = slugs[index];
        return result.data === undefined || slug === undefined
          ? []
          : [
              {
                slug,
                incoming: result.data.othersHaveYourWants,
                outgoing: result.data.othersWantYourHaves,
              },
            ];
      }),
  });
}

/**
 * Which printings in a group's bulk boxes the viewer's wish lists still want.
 * Gated on `slug` being defined: personal collections have no group at all.
 */
export function useGroupBoxWants(slug?: string): BoxWantsLookup {
  const userId = useRequiredUserId();
  const { data } = useQuery({
    ...friendGroupBoxWantsQueryOptions(userId, slug ?? ""),
    enabled: slug !== undefined,
  });
  return data ? buildBoxWantsLookup(data.items) : EMPTY_BOX_WANTS;
}

export function useFriendGroupActivity(slug: string) {
  const userId = useRequiredUserId();
  return useSuspenseQuery(
    queryOptions({
      queryKey: friendGroupsKeys.activity(userId, slug),
      queryFn: () => fetchGroupActivity({ data: slug }),
    }),
  );
}

export function useFriendGroupMemberDetail(slug: string, memberUserId: string) {
  const userId = useRequiredUserId();
  return useSuspenseQuery(
    queryOptions({
      queryKey: friendGroupsKeys.memberDetail(userId, slug, memberUserId),
      queryFn: () => fetchMemberDetail({ data: { slug, userId: memberUserId } }),
    }),
  );
}

function friendGroupSharedListQueryOptions(userId: string, slug: string, listId: string) {
  return queryOptions({
    queryKey: friendGroupsKeys.sharedList(userId, slug, listId),
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
      queryKey: friendGroupsKeys.shareableLists(userId, slug),
      queryFn: () => fetchShareableLists({ data: slug }),
    }),
  );
}

export function useFriendGroupShareableCollections(slug: string) {
  const userId = useRequiredUserId();
  return useSuspenseQuery(
    queryOptions({
      queryKey: friendGroupsKeys.shareableCollections(userId, slug),
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
    queryKey: friendGroupsKeys.sharedCollection(userId, slug, collectionId),
    queryFn: () => fetchSharedCollection({ data: { slug, collectionId } }),
  });
}

export function useFriendGroupSharedCollection(slug: string, collectionId: string) {
  const userId = useRequiredUserId();
  return useSuspenseQuery(friendGroupSharedCollectionQueryOptions(userId, slug, collectionId));
}

/**
 * Non-suspense so it can sit in the header without an authenticated route
 * boundary.
 */
export function useFriendGroupPendingRequestsCount(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: friendGroupsKeys.pendingRequestsCount(),
    queryFn: () => fetchPendingRequestsCount(),
    staleTime: 60 * 1000,
    enabled: opts?.enabled ?? true,
  });
}

const createGroupFn = createServerFn({ method: "POST" })
  .validator(
    (input: { slug: string; name: string; description?: string | null; generateCode?: boolean }) =>
      input,
  )
  .middleware([withCookies])
  .handler(({ context, data }): Promise<FriendGroupResponse> =>
    apiOrpcClient(friendGroupsContract, context.cookie).create(data),
  );

const updateGroupFn = createServerFn({ method: "POST" })
  .validator(
    (input: { slug: string; name?: string; description?: string | null; newSlug?: string }) =>
      input,
  )
  .middleware([withCookies])
  .handler(({ context, data }): Promise<FriendGroupResponse> => {
    const { slug, newSlug, ...fields } = data;
    // Detailed input: the path slug (current) and the body slug (rename target)
    // are distinct fields, so they ride in separate envelopes.
    return apiOrpcClient(friendGroupsContract, context.cookie).update({
      params: { slug },
      body: { ...fields, slug: newSlug },
    });
  });

const deleteGroupFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: slug }) => {
    await apiOrpcClient(friendGroupsContract, context.cookie).remove({ slug });
  });

const rotateCodeFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: slug }): Promise<FriendGroupResponse> =>
    apiOrpcClient(friendGroupsContract, context.cookie).rotateCode({ slug }),
  );

const disableCodeFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: slug }): Promise<FriendGroupResponse> =>
    apiOrpcClient(friendGroupsContract, context.cookie).disableCode({ slug }),
  );

const enableCodeFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: slug }): Promise<FriendGroupResponse> =>
    apiOrpcClient(friendGroupsContract, context.cookie).enableCode({ slug }),
  );

const joinByCodeFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: code }) => {
    await apiOrpcClient(friendGroupsContract, context.cookie).join({ code });
  });

const acceptInviteFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; userId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(friendGroupsContract, context.cookie).acceptInvite(data);
  });

const declineInviteFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; userId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(friendGroupsContract, context.cookie).declineInvite(data);
  });

const leaveFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: slug }) => {
    await apiOrpcClient(friendGroupsContract, context.cookie).leave({ slug });
  });

const transferOwnershipFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; userId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(friendGroupsContract, context.cookie).transferOwnership(data);
  });

const updateRoleFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; userId: string; role: "admin" | "member" }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<FriendGroupMemberResponse> =>
    apiOrpcClient(friendGroupsContract, context.cookie).updateRole(data),
  );

const setRevealedContactsFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; userId: string; contactMethodIds: string[] }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<FriendGroupMemberResponse> =>
    apiOrpcClient(friendGroupsContract, context.cookie).setRevealedContacts(data),
  );

const kickMemberFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; userId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(friendGroupsContract, context.cookie).kickMember(data);
  });

const shareListFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; listId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(friendGroupsContract, context.cookie).shareList(data);
  });

const unshareListFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; listId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(friendGroupsContract, context.cookie).unshareList(data);
  });

const shareCollectionFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; collectionId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(friendGroupsContract, context.cookie).shareCollection(data);
  });

const unshareCollectionFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; collectionId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(friendGroupsContract, context.cookie).unshareCollection(data);
  });

export function useCreateFriendGroup() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (body: {
      slug: string;
      name: string;
      description?: string | null;
      generateCode?: boolean;
    }) => createGroupFn({ data: body }),
    invalidates: () => [friendGroupsKeys.all(userId)],
  });
}

export function useUpdateFriendGroup() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<
    FriendGroupResponse,
    { slug: string; name?: string; description?: string | null; newSlug?: string }
  >({
    mutationFn: (data) => updateGroupFn({ data }),
    invalidates: (variables) => [
      friendGroupsKeys.all(userId),
      friendGroupsKeys.detail(userId, variables.slug),
      ...(variables.newSlug ? [friendGroupsKeys.detail(userId, variables.newSlug)] : []),
    ],
  });
}

export function useDeleteFriendGroup() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (slug: string) => deleteGroupFn({ data: slug }),
    invalidates: () => [friendGroupsKeys.all(userId)],
  });
}

export function useRotateFriendGroupCode() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (slug: string) => rotateCodeFn({ data: slug }),
    invalidates: (slug) => [friendGroupsKeys.detail(userId, slug)],
  });
}

export function useDisableFriendGroupCode() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (slug: string) => disableCodeFn({ data: slug }),
    invalidates: (slug) => [friendGroupsKeys.detail(userId, slug)],
  });
}

export function useEnableFriendGroupCode() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (slug: string) => enableCodeFn({ data: slug }),
    invalidates: (slug) => [friendGroupsKeys.detail(userId, slug)],
  });
}

export function useJoinFriendGroupByCode() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (code: string) => joinByCodeFn({ data: code }),
    invalidates: () => [friendGroupsKeys.all(userId)],
  });
}

export function useAcceptFriendGroupInvite() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<unknown, { slug: string; userId: string }>({
    mutationFn: (data) => acceptInviteFn({ data }),
    invalidates: (variables) => [
      friendGroupsKeys.all(userId),
      friendGroupsKeys.detail(userId, variables.slug),
      friendGroupsKeys.pendingRequestsCount(),
    ],
  });
}

export function useDeclineFriendGroupInvite() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<unknown, { slug: string; userId: string }>({
    mutationFn: (data) => declineInviteFn({ data }),
    invalidates: (variables) => [
      friendGroupsKeys.all(userId),
      friendGroupsKeys.detail(userId, variables.slug),
      friendGroupsKeys.pendingRequestsCount(),
    ],
  });
}

export function useLeaveFriendGroup() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (slug: string) => leaveFn({ data: slug }),
    invalidates: () => [friendGroupsKeys.all(userId)],
  });
}

export function useTransferFriendGroupOwnership() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<unknown, { slug: string; userId: string }>({
    mutationFn: (data) => transferOwnershipFn({ data }),
    invalidates: (variables) => [friendGroupsKeys.detail(userId, variables.slug)],
  });
}

export function useUpdateFriendGroupRole() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<
    FriendGroupMemberResponse,
    { slug: string; userId: string; role: "admin" | "member" }
  >({
    mutationFn: (data) => updateRoleFn({ data }),
    invalidates: (variables) => [friendGroupsKeys.detail(userId, variables.slug)],
  });
}

export function useUpdateGroupContactReveal() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<
    FriendGroupMemberResponse,
    { slug: string; userId: string; contactMethodIds: string[] }
  >({
    mutationFn: (data) => setRevealedContactsFn({ data }),
    invalidates: (variables) => [friendGroupsKeys.detail(userId, variables.slug)],
  });
}

export function useKickFriendGroupMember() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<unknown, { slug: string; userId: string }>({
    mutationFn: (data) => kickMemberFn({ data }),
    invalidates: (variables) => [
      friendGroupsKeys.detail(userId, variables.slug),
      friendGroupsKeys.matches(userId, variables.slug),
    ],
  });
}

export function useShareListWithFriendGroup() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<unknown, { slug: string; listId: string }>({
    mutationFn: (data) => shareListFn({ data }),
    invalidates: (variables) => [
      friendGroupsKeys.detail(userId, variables.slug),
      friendGroupsKeys.shareableLists(userId, variables.slug),
      friendGroupsKeys.matches(userId, variables.slug),
      listsKeys.groupShares(userId, variables.listId),
    ],
  });
}

export function useUnshareListFromFriendGroup() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<unknown, { slug: string; listId: string }>({
    mutationFn: (data) => unshareListFn({ data }),
    invalidates: (variables) => [
      friendGroupsKeys.detail(userId, variables.slug),
      friendGroupsKeys.shareableLists(userId, variables.slug),
      friendGroupsKeys.matches(userId, variables.slug),
      listsKeys.groupShares(userId, variables.listId),
    ],
  });
}

export function useShareCollectionWithFriendGroup() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<unknown, { slug: string; collectionId: string }>({
    mutationFn: (data) => shareCollectionFn({ data }),
    invalidates: (variables) => [
      friendGroupsKeys.detail(userId, variables.slug),
      friendGroupsKeys.shareableCollections(userId, variables.slug),
      collectionsKeys.groupShares(userId, variables.collectionId),
    ],
  });
}

export function useUnshareCollectionFromFriendGroup() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<unknown, { slug: string; collectionId: string }>({
    mutationFn: (data) => unshareCollectionFn({ data }),
    invalidates: (variables) => [
      friendGroupsKeys.detail(userId, variables.slug),
      friendGroupsKeys.shareableCollections(userId, variables.slug),
      collectionsKeys.groupShares(userId, variables.collectionId),
    ],
  });
}

const fetchDiscordLinks = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: slug }): Promise<FriendGroupDiscordLinksResponse> =>
    apiOrpcClient(friendGroupsContract, context.cookie).listDiscordLinks({ slug }),
  );

const createDiscordLinkCodeFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: slug }): Promise<FriendGroupDiscordLinkCodeResponse> =>
    apiOrpcClient(friendGroupsContract, context.cookie).createDiscordLinkCode({ slug }),
  );

const deleteDiscordLinkFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; linkId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(friendGroupsContract, context.cookie).deleteDiscordLink(data);
  });

/**
 * Pass `refetchInterval` while a link code is outstanding so the panel
 * notices the redeem happening over in Discord without a manual reload.
 */
export function useFriendGroupDiscordLinks(slug: string, opts?: { refetchInterval?: number }) {
  const userId = useRequiredUserId();
  return useSuspenseQuery({
    queryKey: friendGroupsKeys.discordLinks(userId, slug),
    queryFn: () => fetchDiscordLinks({ data: slug }),
    refetchInterval: opts?.refetchInterval,
  });
}

export function useCreateFriendGroupDiscordLinkCode() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<FriendGroupDiscordLinkCodeResponse, string>({
    mutationFn: (slug) => createDiscordLinkCodeFn({ data: slug }),
    invalidates: (slug) => [friendGroupsKeys.discordLinks(userId, slug)],
  });
}

export function useDeleteFriendGroupDiscordLink() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<unknown, { slug: string; linkId: string }>({
    mutationFn: (data) => deleteDiscordLinkFn({ data }),
    invalidates: (variables) => [friendGroupsKeys.discordLinks(userId, variables.slug)],
  });
}
