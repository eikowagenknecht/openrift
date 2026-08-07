import { adminCoreContract } from "@openrift/shared/contracts/admin/core";
import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import type { CronStatus } from "@/components/admin/refresh-actions";
import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchCronStatusFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<CronStatus> =>
    apiOrpcClient(adminCoreContract, context.cookie).cronStatus(),
  );

export function useCronStatus() {
  return useQuery({
    queryKey: queryKeys.admin.cronStatus,
    queryFn: () => fetchCronStatusFn(),
    refetchInterval: 1 * 60 * 1000, // 1 minute
  });
}
