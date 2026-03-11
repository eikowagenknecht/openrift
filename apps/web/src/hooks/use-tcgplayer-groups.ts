import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api-client";
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

export function useTcgplayerGroups() {
  return useQuery({
    queryKey: queryKeys.admin.tcgplayerGroups,
    queryFn: () => api.get<TcgplayerGroupsResponse>("/api/admin/tcgplayer-groups"),
  });
}

export function useUpdateTcgplayerGroup() {
  return useMutationWithInvalidation({
    mutationFn: (body: { groupId: number; setId: string | null }) =>
      api.put<{ ok: boolean }>("/api/admin/tcgplayer-groups", body),
    invalidates: [queryKeys.admin.tcgplayerGroups],
  });
}
