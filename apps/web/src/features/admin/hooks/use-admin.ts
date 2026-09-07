import type { AdminMeResponse } from "@openrift/shared/contracts/admin/core";
import { adminCoreContract } from "@openrift/shared/contracts/admin/core";
import { ORPCError } from "@orpc/client";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { adminKeys } from "@/features/admin/lib/admin-query-keys";
import { useUserId } from "@/lib/auth-session";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const NO_ACCESS: AdminMeResponse = { isAdmin: false, sections: [] };

const fetchAdminAccess = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<AdminMeResponse> => {
    try {
      return await apiOrpcClient(adminCoreContract, context.cookie).me();
    } catch (error) {
      // The requireAdmin gate replies before the handler with 401/403 for no
      // access, which oRPC surfaces as an ORPCError carrying that status.
      if (error instanceof ORPCError && (error.status === 401 || error.status === 403)) {
        return NO_ACCESS;
      }
      throw error;
    }
  });

/**
 * Keyed by userId so a signed-out "no access" answer cached before login can
 * never be served to the user who just signed in.
 */
export const adminAccessQueryOptions = (userId: string | null) =>
  queryOptions({
    queryKey: adminKeys.me(userId),
    queryFn: () => (userId === null ? NO_ACCESS : fetchAdminAccess()),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

export function useAdminAccess() {
  const userId = useUserId();
  return useQuery(adminAccessQueryOptions(userId));
}

export function useIsAdmin() {
  const userId = useUserId();
  return useQuery({ ...adminAccessQueryOptions(userId), select: (data) => data.isAdmin });
}
