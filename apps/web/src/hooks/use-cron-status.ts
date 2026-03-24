import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { client, rpc } from "@/lib/rpc-client";

export function useCronStatus() {
  return useQuery({
    queryKey: queryKeys.admin.cronStatus,
    queryFn: () => rpc(client.api.v1.admin["cron-status"].$get()),
    refetchInterval: 60_000,
  });
}
