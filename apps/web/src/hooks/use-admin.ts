import type { AdminMeResponse } from "@openrift/shared/contracts/admin/core";
import { adminCoreContract } from "@openrift/shared/contracts/admin/core";
import { ORPCError } from "@orpc/client";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const NO_ACCESS: AdminMeResponse = { isAdmin: false, sections: [] };

const fetchAdminAccess = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<AdminMeResponse> => {
    try {
      return await apiOrpcClient(adminCoreContract, context.cookie).me();
    } catch (error) {
      // 401/403 are expected for users with no admin access at all — treat as
      // "no access" without throwing. The requireAdmin gate replies before the
      // handler (grant holders are let through to `me`), so oRPC surfaces those
      // as an ORPCError carrying the original HTTP status.
      if (error instanceof ORPCError && (error.status === 401 || error.status === 403)) {
        return NO_ACCESS;
      }
      throw error;
    }
  });

/**
 * Keyed by userId so a signed-out "no access" answer cached before login can
 * never be served to the user who just signed in (login invalidates only the
 * session query and relies on user-scoped keys for everything else — see
 * login-form.tsx). Signed-out callers short-circuit to NO_ACCESS without a
 * network round-trip; there is no session cookie to grant anything.
 *
 * @param userId The current user id, or null when signed out.
 * @returns Query options for the caller's admin access.
 */
export const adminAccessQueryOptions = (userId: string | null) =>
  queryOptions({
    queryKey: queryKeys.admin.me(userId),
    queryFn: () => (userId === null ? NO_ACCESS : fetchAdminAccess()),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

/** @returns The full admin access query: `{ isAdmin, sections }`. */
export function useAdminAccess() {
  const userId = useUserId();
  return useQuery(adminAccessQueryOptions(userId));
}

/** @returns Query for the full-admin flag only (partial grants excluded). */
export function useIsAdmin() {
  const userId = useUserId();
  return useQuery({ ...adminAccessQueryOptions(userId), select: (data) => data.isAdmin });
}
