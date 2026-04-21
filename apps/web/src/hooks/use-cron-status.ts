import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import type { CronStatus } from "@/components/admin/refresh-actions";
import { queryKeys } from "@/lib/query-keys";
import { fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchCronStatusFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }) =>
    fetchApiJson<CronStatus>({
      errorTitle: "Couldn't load cron status",
      cookie: context.cookie,
      path: "/api/v1/admin/cron-status",
    }),
  );

export function useCronStatus() {
  return useQuery({
    queryKey: queryKeys.admin.cronStatus,
    queryFn: () => fetchCronStatusFn(),
    refetchInterval: 1 * 60 * 1000, // 1 minute
  });
}
