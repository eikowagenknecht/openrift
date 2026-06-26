import { adminCoreContract } from "@openrift/shared/contracts";
import { ORPCError } from "@orpc/client";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchIsAdmin = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<boolean> => {
    try {
      const { isAdmin } = await apiOrpcClient(adminCoreContract, context.cookie).me();
      return isAdmin;
    } catch (error) {
      // 401/403 are expected for non-admins — treat as "not admin" without
      // throwing. The requireAdmin gate replies before the handler, so oRPC
      // surfaces those as an ORPCError carrying the original HTTP status.
      if (error instanceof ORPCError && (error.status === 401 || error.status === 403)) {
        return false;
      }
      throw error;
    }
  });

export const isAdminQueryOptions = queryOptions({
  queryKey: queryKeys.admin.me,
  queryFn: () => fetchIsAdmin(),
  staleTime: 5 * 60 * 1000, // 5 minutes
});

export function useIsAdmin() {
  return useQuery(isAdminQueryOptions);
}
