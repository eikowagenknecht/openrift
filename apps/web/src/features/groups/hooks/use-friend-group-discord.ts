import { friendGroupsContract } from "@openrift/shared/contracts/friend-groups";
import type {
  FriendGroupDiscordLinkCodeResponse,
  FriendGroupDiscordLinksResponse,
} from "@openrift/shared/types/api/friend-group";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { friendGroupsKeys } from "@/features/groups/lib/groups-query-keys";
import { useRequiredUserId } from "@/lib/auth-session";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

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
