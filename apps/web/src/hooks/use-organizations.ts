import type {
  OrganizationDetailResponse,
  OrganizationListResponse,
  OrganizationResponse,
  OrganizationRole,
} from "@openrift/shared";
import { adminOrganizationsContract, organizationsContract } from "@openrift/shared/contracts";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

// ── Server functions: queries ────────────────────────────────────────────────

const fetchMyOrganizations = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<OrganizationListResponse> =>
      apiOrpcClient(organizationsContract, context.cookie).list(),
  );

const fetchOrganization = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: id }): Promise<OrganizationDetailResponse> =>
      apiOrpcClient(organizationsContract, context.cookie).get({ id }),
  );

const fetchAdminOrganizations = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<OrganizationListResponse> =>
      apiOrpcClient(adminOrganizationsContract, context.cookie).list(),
  );

// ── Query options + hooks ────────────────────────────────────────────────────

export function myOrganizationsQueryOptions(userId: string) {
  return queryOptions({
    queryKey: queryKeys.organizations.mine(userId),
    queryFn: () => fetchMyOrganizations(),
  });
}

export function organizationQueryOptions(userId: string, id: string) {
  return queryOptions({
    queryKey: queryKeys.organizations.detail(userId, id),
    queryFn: () => fetchOrganization({ data: id }),
  });
}

export const adminOrganizationsQueryOptions = queryOptions({
  queryKey: queryKeys.organizations.adminAll,
  queryFn: () => fetchAdminOrganizations(),
});

export function useMyOrganizations() {
  const userId = useRequiredUserId();
  return useSuspenseQuery(myOrganizationsQueryOptions(userId));
}

export function useOrganization(id: string) {
  const userId = useRequiredUserId();
  return useSuspenseQuery(organizationQueryOptions(userId, id));
}

export function useAdminOrganizations() {
  return useSuspenseQuery(adminOrganizationsQueryOptions);
}

// ── Server functions: mutations ──────────────────────────────────────────────

const addMemberFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; email: string; role: OrganizationRole }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<OrganizationDetailResponse> =>
      apiOrpcClient(organizationsContract, context.cookie).addMember(data),
  );

const updateMemberRoleFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; userId: string; role: OrganizationRole }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<OrganizationDetailResponse> =>
      apiOrpcClient(organizationsContract, context.cookie).updateMemberRole(data),
  );

const removeMemberFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; userId: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<OrganizationDetailResponse> =>
      apiOrpcClient(organizationsContract, context.cookie).removeMember(data),
  );

const adminCreateOrgFn = createServerFn({ method: "POST" })
  .validator(
    (input: { slug: string; name: string; description?: string | null; ownerUserId: string }) =>
      input,
  )
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<OrganizationResponse> =>
      apiOrpcClient(adminOrganizationsContract, context.cookie).create(data),
  );

const adminUpdateOrgFn = createServerFn({ method: "POST" })
  .validator(
    (input: { id: string; slug?: string; name?: string; description?: string | null }) => input,
  )
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<OrganizationResponse> =>
      apiOrpcClient(adminOrganizationsContract, context.cookie).update(data),
  );

const adminDeleteOrgFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: id }) => {
    await apiOrpcClient(adminOrganizationsContract, context.cookie).remove({ id });
  });

// ── Mutation hooks ───────────────────────────────────────────────────────────

/**
 * Invalidates the org list and a single org's detail after a membership change.
 * @returns A mutation wired with the org invalidation set.
 */
function useOrgDetailMutation<TVariables extends { id: string }>(
  mutationFn: (variables: TVariables) => Promise<OrganizationDetailResponse>,
) {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<OrganizationDetailResponse, TVariables>({
    mutationFn,
    invalidates: (variables) => [
      queryKeys.organizations.mine(userId),
      queryKeys.organizations.detail(userId, variables.id),
    ],
  });
}

export function useAddOrganizationMember() {
  return useOrgDetailMutation<{ id: string; email: string; role: OrganizationRole }>((data) =>
    addMemberFn({ data }),
  );
}

export function useUpdateOrganizationMemberRole() {
  return useOrgDetailMutation<{ id: string; userId: string; role: OrganizationRole }>((data) =>
    updateMemberRoleFn({ data }),
  );
}

export function useRemoveOrganizationMember() {
  return useOrgDetailMutation<{ id: string; userId: string }>((data) => removeMemberFn({ data }));
}

export function useAdminCreateOrganization() {
  return useMutationWithInvalidation<
    OrganizationResponse,
    { slug: string; name: string; description?: string | null; ownerUserId: string }
  >({
    mutationFn: (data) => adminCreateOrgFn({ data }),
    invalidates: () => [queryKeys.organizations.adminAll],
  });
}

export function useAdminUpdateOrganization() {
  return useMutationWithInvalidation<
    OrganizationResponse,
    { id: string; slug?: string; name?: string; description?: string | null }
  >({
    mutationFn: (data) => adminUpdateOrgFn({ data }),
    invalidates: () => [queryKeys.organizations.adminAll],
  });
}

export function useAdminDeleteOrganization() {
  return useMutationWithInvalidation({
    mutationFn: (id: string) => adminDeleteOrgFn({ data: id }),
    invalidates: () => [queryKeys.organizations.adminAll],
  });
}
