import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

interface TcgplayerGroup {
  groupId: number;
  name: string;
  abbreviation: string;
  stagedCount: number;
  assignedCount: number;
}

interface TcgplayerGroupsResponse {
  groups: TcgplayerGroup[];
}

export function useTcgplayerGroups() {
  return useQuery({
    queryKey: queryKeys.admin.tcgplayerGroups,
    queryFn: () => api.get<TcgplayerGroupsResponse>("/api/admin/tcgplayer-groups"),
  });
}
