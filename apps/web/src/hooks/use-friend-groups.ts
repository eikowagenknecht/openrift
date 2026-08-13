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
  FriendGroupPendingInvitesCountResponse,
  FriendGroupPendingRequestsCountResponse,
  FriendGroupResponse,
  FriendGroupShareableCollectionsResponse,
  FriendGroupShareableListsResponse,
  FriendGroupSharedCollectionDetailResponse,
  FriendGroupSharedListDetailResponse,
} from "@openrift/shared";
import { friendGroupsContract } from "@openrift/shared/contracts/friend-groups";
import { isDefinedError, safe } from "@orpc/client";
import type { QueryClient } from "@tanstack/react-query";
import { queryOptions, useQueries, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ParsedLocation } from "@tanstack/react-router";
import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId } from "@/lib/auth-session";
import type { BoxWantRow, BoxWantsLookup } from "@/lib/box-wants";
import { buildBoxWantsLookup, EMPTY_BOX_WANTS } from "@/lib/box-wants";
import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import type { GroupMatchPanels } from "@/lib/trade-derivation";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

// ── Server functions: queries ───────────────────────────────────────────────

const fetchGroups = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<FriendGroupListResponse> =>
    apiOrpcClient(friendGroupsContract, context.cookie).list(),
  );

const fetchPendingInvitesCount = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<FriendGroupPendingInvitesCountResponse> =>
    apiOrpcClient(friendGroupsContract, context.cookie).pendingInvitesCount(),
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
    // 404 (unknown group, or one the viewer can't see) maps to the NOT_FOUND
    // sentinel the route boundary expects.
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
      apiOrpcClient(friendGroupsContract, context.cookie).preview({ code }),
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

// ── Hooks ───────────────────────────────────────────────────────────────────

export function friendGroupsQueryOptions(userId: string) {
  return queryOptions({
    queryKey: queryKeys.friendGroups.all(userId),
    queryFn: () => fetchGroups(),
  });
}

function friendGroupDetailQueryOptions(userId: string, slug: string) {
  return queryOptions({
    queryKey: queryKeys.friendGroups.detail(userId, slug),
    queryFn: () => fetchGroupDetail({ data: slug }),
  });
}

/**
 * Route-loader helper: ensures the group detail and, when the API resolved a
 * rename alias (the group's `previous_slug`), redirects to the same page
 * under the canonical slug so bookmarks and trade-email links survive a
 * group rename.
 * @returns The ensured detail payload (already in the query cache).
 */
export async function ensureFriendGroupDetailCanonical(options: {
  queryClient: QueryClient;
  userId: string;
  slug: string;
  location: ParsedLocation;
}): Promise<FriendGroupDetailResponse> {
  const { queryClient, userId, slug, location } = options;
  const detail = await queryClient.ensureQueryData(friendGroupDetailQueryOptions(userId, slug));
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
    queryKey: queryKeys.friendGroups.matches(userId, slug),
    queryFn: () => fetchGroupMatches({ data: slug }),
    // Matching is the app's most expensive read and three surfaces now mount it
    // (the groups index, a group's overview, its trades page), so walking the
    // index into a group would otherwise run the same matcher twice within
    // seconds. Everything the viewer does to a trade invalidates this key, which
    // refetches regardless of the window; what waits out the minute is only a
    // suggestion someone else's list edit created.
    staleTime: 60_000,
  });
}

function friendGroupBoxWantsQueryOptions(userId: string, slug: string) {
  return queryOptions({
    queryKey: queryKeys.friendGroups.boxWants(userId, slug),
    queryFn: () => fetchGroupBoxWants({ data: slug }),
    // No mutation invalidates this key yet, so counts can lag up to a minute
    // behind a take or a wishlist edit. That's tolerable because the box's own
    // stacks update instantly (the taken copy leaves the synced collection);
    // only the tile count and per-printing quantities ride out the window.
    staleTime: 60_000,
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

/**
 * The match rows of several groups at once, pooled into one pair of arrays.
 * The trades hub uses it for the viewer's *other* groups, so a member card can
 * say that the person it is about has suggestions the sheet will show and this
 * group does not.
 *
 * Non-suspending on purpose: matching is the most expensive read in the app
 * (rule lists expand against the whole catalog), and the hub must paint its
 * cards from this group's data rather than wait on every other group. Rows
 * arrive as each group answers, and they land on the same query keys those
 * groups' own trades pages use, so a hub visit warms them and vice versa.
 * @param slugs The groups to read, usually every group but the current one.
 * @returns The pooled rows, empty until the first group answers.
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
 * side by side and needs a number for each (the groups index).
 *
 * Non-suspending for the reason {@link useFriendGroupMatchesForSlugs} gives:
 * matching is the most expensive read in the app, so the cards paint at once and
 * each group's count fills in when that group answers. A group still loading is
 * simply absent from the result rather than reported as zero.
 * @param slugs The groups to read.
 * @returns One entry per group that has answered, in `slugs` order.
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
 * Which printings in a group's bulk boxes the viewer's wish lists still want,
 * and how many of each the box can actually hand over. Non-suspending and
 * gated on the slug: the collection grid resolves a group's slug from the
 * collection it is showing, so the query must stand down until it has one (and
 * on every personal collection, which has no group at all).
 * @param slug The group to read, or undefined to fetch nothing.
 * @returns The lookups over the group's rows; empty until the query answers.
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

const inviteByEmailFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; email: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(friendGroupsContract, context.cookie).inviteByEmail(data);
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

export function useUpdateGroupContactReveal() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<
    FriendGroupMemberResponse,
    { slug: string; userId: string; contactMethodIds: string[] }
  >({
    mutationFn: (data) => setRevealedContactsFn({ data }),
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

// ── Discord links (admin) ───────────────────────────────────────────────────

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
 * The group's linked Discord servers (admin-only endpoint). Pass a
 * `refetchInterval` while a link code is outstanding so the panel notices the
 * redeem happening over in Discord without a manual reload.
 * @returns The suspense query for the group's Discord links.
 */
export function useFriendGroupDiscordLinks(slug: string, opts?: { refetchInterval?: number }) {
  const userId = useRequiredUserId();
  return useSuspenseQuery({
    queryKey: queryKeys.friendGroups.discordLinks(userId, slug),
    queryFn: () => fetchDiscordLinks({ data: slug }),
    refetchInterval: opts?.refetchInterval,
  });
}

export function useCreateFriendGroupDiscordLinkCode() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<FriendGroupDiscordLinkCodeResponse, string>({
    mutationFn: (slug) => createDiscordLinkCodeFn({ data: slug }),
    invalidates: (slug) => [queryKeys.friendGroups.discordLinks(userId, slug)],
  });
}

export function useDeleteFriendGroupDiscordLink() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<unknown, { slug: string; linkId: string }>({
    mutationFn: (data) => deleteDiscordLinkFn({ data }),
    invalidates: (variables) => [queryKeys.friendGroups.discordLinks(userId, variables.slug)],
  });
}
