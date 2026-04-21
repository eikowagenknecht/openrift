import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchFormatsFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }) =>
    fetchApiJson<{ formats: { id: string; name: string }[] }>({
      errorTitle: "Couldn't load formats",
      cookie: context.cookie,
      path: "/api/v1/admin/formats",
    }),
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
