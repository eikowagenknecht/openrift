import { adminFormatsContract } from "@openrift/shared/contracts/admin/formats";
import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchFormatsFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<{ formats: { id: string; name: string }[] }> =>
    apiOrpcClient(adminFormatsContract, context.cookie).list(),
  );

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
