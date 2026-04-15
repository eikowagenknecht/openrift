import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchFormatsFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/formats`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Formats fetch failed: ${res.status}`);
    }
    return res.json() as Promise<{ formats: { id: string; name: string }[] }>;
  });

export function useFormats() {
  return useQuery({
    queryKey: queryKeys.admin.formats,
    queryFn: async () => {
      const data = await fetchFormatsFn();
      return data.formats;
    },
    staleTime: 30 * 60 * 1000,
  });
}
