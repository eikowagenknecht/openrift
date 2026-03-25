import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";

export function useCronStatus() {
  return useQuery({
    queryKey: queryKeys.admin.cronStatus,
    queryFn: async () => {
      const res = await client.api.v1.admin["cron-status"].$get();
      assertOk(res);
      return await res.json();
    },
    refetchInterval: 1 * 60 * 1000, // 1 minute
  });
}
