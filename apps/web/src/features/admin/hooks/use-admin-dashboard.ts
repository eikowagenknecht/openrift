import type { AdminDashboardResponse } from "@openrift/shared/contracts/admin/dashboard";
import { adminDashboardContract } from "@openrift/shared/contracts/admin/dashboard";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { adminKeys } from "@/features/admin/lib/admin-query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchAdminDashboard = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<AdminDashboardResponse> =>
    apiOrpcClient(adminDashboardContract, context.cookie).get(),
  );

export const adminDashboardQueryOptions = queryOptions({
  queryKey: adminKeys.dashboard,
  queryFn: () => fetchAdminDashboard(),
});

export function useAdminDashboard() {
  return useSuspenseQuery(adminDashboardQueryOptions);
}
