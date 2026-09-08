import { friendGroupsContract } from "@openrift/shared/contracts/friend-groups";
import { publicFriendGroupsContract } from "@openrift/shared/contracts/public-friend-groups";
import type {
  FriendGroupActivityResponse,
  FriendGroupDetailResponse,
  FriendGroupJoinPreviewResponse,
  FriendGroupListResponse,
  FriendGroupMatchesResponse,
  FriendGroupMatchRow,
  FriendGroupMemberDetailResponse,
  FriendGroupPendingRequestsCountResponse,
} from "@openrift/shared/types/api/friend-group";
import { isDefinedError, safe } from "@orpc/client";
import type { QueryClient } from "@tanstack/react-query";
import { queryOptions, useQueries, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ParsedLocation } from "@tanstack/react-router";
import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import type { BoxWantRow, BoxWantsLookup } from "@/features/decks/lib/box-wants";
import { buildBoxWantsLookup, EMPTY_BOX_WANTS } from "@/features/decks/lib/box-wants";
import { friendGroupsKeys } from "@/features/groups/lib/groups-query-keys";
import type { GroupMatchPanels } from "@/features/groups/lib/trade-derivation";
import { useRequiredUserId } from "@/lib/auth-session";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

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
