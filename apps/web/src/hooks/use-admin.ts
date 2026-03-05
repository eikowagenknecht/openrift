import { useQuery } from "@tanstack/react-query";

import { API_BASE } from "@/lib/api-base";

async function fetchIsAdmin(): Promise<boolean> {
  const res = await fetch(`${API_BASE}/api/admin/me`, { credentials: "include" });
  if (!res.ok) {
    return false;
  }
  const data = (await res.json()) as { isAdmin: boolean };
  return data.isAdmin;
}

export function useIsAdmin() {
  return useQuery({
    queryKey: ["admin", "me"],
    queryFn: fetchIsAdmin,
    staleTime: 5 * 60 * 1000,
  });
}
