import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { fetchApi } from "@/lib/server-fns";

export function useCronStatus() {
  return useQuery({
    queryKey: queryKeys.admin.cronStatus,
    queryFn: () => fetchApi({ data: "/api/admin/cron-status" }),
    refetchInterval: 60_000,
  });
}
