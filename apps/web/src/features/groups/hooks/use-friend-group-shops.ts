import { friendGroupsContract } from "@openrift/shared/contracts/friend-groups";
import type {
  FriendGroupShopEventsResponse,
  FriendGroupShopSearchResponse,
  FriendGroupShopsResponse,
} from "@openrift/shared/types/api/friend-group";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { friendGroupsKeys } from "@/features/groups/lib/groups-query-keys";
import { useRequiredUserId } from "@/lib/auth-session";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export const SHOP_SEARCH_MIN_LENGTH = 2;

const fetchShops = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: slug }): Promise<FriendGroupShopsResponse> =>
    apiOrpcClient(friendGroupsContract, context.cookie).listShops({ slug }),
  );

const searchShopsFn = createServerFn({ method: "GET" })
  .validator((input: { slug: string; q: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<FriendGroupShopSearchResponse> =>
    apiOrpcClient(friendGroupsContract, context.cookie).searchShops(data),
  );

const fetchShopEvents = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: slug }): Promise<FriendGroupShopEventsResponse> =>
    apiOrpcClient(friendGroupsContract, context.cookie).shopEvents({ slug }),
  );

const linkShopFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; storeId: number }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(friendGroupsContract, context.cookie).linkShop(data);
  });

const unlinkShopFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; storeId: number }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(friendGroupsContract, context.cookie).unlinkShop(data);
  });

function friendGroupShopsQueryOptions(userId: string, slug: string) {
  return {
    queryKey: friendGroupsKeys.shops(userId, slug),
    queryFn: () => fetchShops({ data: slug }),
  };
}

export function friendGroupShopEventsQueryOptions(userId: string, slug: string) {
  return {
    queryKey: friendGroupsKeys.shopEvents(userId, slug),
    queryFn: () => fetchShopEvents({ data: slug }),
  };
}

export function useFriendGroupShops(slug: string) {
  const userId = useRequiredUserId();
  return useSuspenseQuery(friendGroupShopsQueryOptions(userId, slug));
}

export function useFriendGroupShopEvents(slug: string) {
  const userId = useRequiredUserId();
  return useSuspenseQuery(friendGroupShopEventsQueryOptions(userId, slug));
}

export function useFriendGroupShopSearch(slug: string, term: string) {
  const userId = useRequiredUserId();
  const trimmed = term.trim();
  return useQuery({
    queryKey: friendGroupsKeys.shopSearch(userId, slug, trimmed),
    queryFn: () => searchShopsFn({ data: { slug, q: trimmed } }),
    enabled: trimmed.length >= SHOP_SEARCH_MIN_LENGTH,
  });
}

export function useLinkFriendGroupShop() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<unknown, { slug: string; storeId: number }>({
    mutationFn: (data) => linkShopFn({ data }),
    invalidates: (variables) => [
      friendGroupsKeys.shops(userId, variables.slug),
      friendGroupsKeys.shopEvents(userId, variables.slug),
    ],
  });
}

export function useUnlinkFriendGroupShop() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<unknown, { slug: string; storeId: number }>({
    mutationFn: (data) => unlinkShopFn({ data }),
    invalidates: (variables) => [
      friendGroupsKeys.shops(userId, variables.slug),
      friendGroupsKeys.shopEvents(userId, variables.slug),
    ],
  });
}
