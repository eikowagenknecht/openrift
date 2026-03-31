import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";

export function useFormats() {
  return useQuery({
    queryKey: queryKeys.admin.formats,
    queryFn: async () => {
      const res = await client.api.v1.admin.formats.$get();
      assertOk(res);
      const data = await res.json();
      return data.formats;
    },
  });
}
