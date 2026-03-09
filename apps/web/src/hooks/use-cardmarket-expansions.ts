import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

interface CardmarketExpansion {
  expansionId: number;
  setId: string | null;
  setName: string | null;
  stagedCount: number;
  assignedCount: number;
}

interface SetOption {
  id: string;
  name: string;
}

interface CardmarketExpansionsResponse {
  expansions: CardmarketExpansion[];
  sets: SetOption[];
}

async function fetchCardmarketExpansions(): Promise<CardmarketExpansionsResponse> {
  const res = await fetch(`/api/admin/cardmarket-expansions`, {
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch Cardmarket expansions: ${res.status}`);
  }
  return res.json() as Promise<CardmarketExpansionsResponse>;
}

export function useCardmarketExpansions() {
  return useQuery({
    queryKey: ["admin", "cardmarket-expansions"],
    queryFn: fetchCardmarketExpansions,
  });
}

interface UpdateExpansionBody {
  expansionId: number;
  setId: string | null;
}

async function updateCardmarketExpansion(body: UpdateExpansionBody): Promise<{ ok: boolean }> {
  const res = await fetch(`/api/admin/cardmarket-expansions`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Failed to update Cardmarket expansion: ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean }>;
}

export function useUpdateCardmarketExpansion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateCardmarketExpansion,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "cardmarket-expansions"] });
    },
  });
}
