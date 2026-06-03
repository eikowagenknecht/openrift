import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import type { CronStatus } from "@/components/admin/refresh-actions";
import { queryKeys } from "@/lib/query-keys";
import { callApiJson, serverApiClient } from "@/lib/server-fns/api-client";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchCronStatusFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<CronStatus> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1.admin["cron-status"].$get(),
        "Couldn't load cron status",
      ),
  );

export function useCronStatus() {
  return useQuery({
    queryKey: queryKeys.admin.cronStatus,
    queryFn: () => fetchCronStatusFn(),
    refetchInterval: 1 * 60 * 1000, // 1 minute
  });
}
