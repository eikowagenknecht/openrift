import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";

async function fetchIsAdmin(): Promise<boolean> {
  const res = await fetch("/api/admin/me", { credentials: "include" });
  if (!res.ok) {
    return false;
  }
  const data = (await res.json()) as { isAdmin: boolean };
  return data.isAdmin;
}

export function useIsAdmin() {
  return useQuery({
    queryKey: queryKeys.admin.me,
    queryFn: fetchIsAdmin,
    staleTime: 5 * 60 * 1000,
  });
}
