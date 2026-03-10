import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

interface TcgplayerGroup {
  groupId: number;
  name: string;
  abbreviation: string;
  setId: string | null;
  setName: string | null;
  stagedCount: number;
  assignedCount: number;
}

interface SetOption {
  id: string;
  name: string;
}

interface TcgplayerGroupsResponse {
  groups: TcgplayerGroup[];
  sets: SetOption[];
}

async function fetchTcgplayerGroups(): Promise<TcgplayerGroupsResponse> {
  const res = await fetch(`/api/admin/tcgplayer-groups`, { credentials: "include" });
  if (!res.ok) {
    throw new Error(`Failed to fetch TCGPlayer groups: ${res.status}`);
  }
  return res.json() as Promise<TcgplayerGroupsResponse>;
}

export function useTcgplayerGroups() {
  return useQuery({
    queryKey: queryKeys.admin.tcgplayerGroups,
    queryFn: fetchTcgplayerGroups,
  });
}

interface UpdateGroupBody {
  groupId: number;
  setId: string | null;
}

async function updateTcgplayerGroup(body: UpdateGroupBody): Promise<{ ok: boolean }> {
  const res = await fetch(`/api/admin/tcgplayer-groups`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Failed to update TCGPlayer group: ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean }>;
}

export function useUpdateTcgplayerGroup() {
  return useMutationWithInvalidation({
    mutationFn: updateTcgplayerGroup,
    invalidates: [queryKeys.admin.tcgplayerGroups],
  });
}
