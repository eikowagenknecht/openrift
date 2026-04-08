import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchCronStatusFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/cron-status`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Cron status fetch failed: ${res.status}`);
    }
    return res.json();
  });

export function useCronStatus() {
  return useQuery({
    queryKey: queryKeys.admin.cronStatus,
    queryFn: () => fetchCronStatusFn(),
    refetchInterval: 1 * 60 * 1000, // 1 minute
  });
}
