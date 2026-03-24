import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { fetchApi } from "@/lib/server-fns";

export function useIsAdmin() {
  return useQuery({
    queryKey: queryKeys.admin.me,
    queryFn: async () => {
      try {
        const data = (await fetchApi({ data: "/api/admin/me" })) as { isAdmin: boolean };
        return data.isAdmin;
      } catch {
        return false;
      }
    },
    staleTime: 5 * 60 * 1000,
  });
}
