import type { AdminMeResponse } from "@openrift/shared/contracts";
import { adminCoreContract } from "@openrift/shared/contracts";
import { ORPCError } from "@orpc/client";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

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

export const adminAccessQueryOptions = queryOptions({
  queryKey: queryKeys.admin.me,
  queryFn: () => fetchAdminAccess(),
  staleTime: 5 * 60 * 1000, // 5 minutes
});

/** @returns The full admin access query: `{ isAdmin, sections }`. */
export function useAdminAccess() {
  return useQuery(adminAccessQueryOptions);
}

/** @returns Query for the full-admin flag only (partial grants excluded). */
export function useIsAdmin() {
  return useQuery({ ...adminAccessQueryOptions, select: (data) => data.isAdmin });
}
