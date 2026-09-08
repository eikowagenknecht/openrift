import { friendGroupsContract } from "@openrift/shared/contracts/friend-groups";
import type {
  FriendGroupMemberResponse,
  FriendGroupResponse,
} from "@openrift/shared/types/api/friend-group";
import { createServerFn } from "@tanstack/react-start";

import { friendGroupsKeys } from "@/features/groups/lib/groups-query-keys";
import { useRequiredUserId } from "@/lib/auth-session";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

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
