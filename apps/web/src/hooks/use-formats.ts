import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { callApiJson, serverApiClient } from "@/lib/server-fns/api-client";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchFormatsFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<{ formats: { id: string; name: string }[] }> =>
      callApiJson(
        serverApiClient(context.cookie).api.admin.v1.formats.$get(),
        "Couldn't load formats",
      ),
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
