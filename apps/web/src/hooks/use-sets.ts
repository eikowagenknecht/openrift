import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

interface AdminSet {
  id: string;
  name: string;
  printedTotal: number;
  cardCount: number;
  printingCount: number;
}

async function fetchSets(): Promise<{ sets: AdminSet[] }> {
  const res = await fetch(`/api/admin/sets`, { credentials: "include" });
  if (!res.ok) {
    throw new Error(`Failed to fetch sets: ${res.status}`);
  }
  return res.json() as Promise<{ sets: AdminSet[] }>;
}

export function useSets() {
  return useQuery({
    queryKey: ["admin", "sets"],
    queryFn: fetchSets,
  });
}

interface UpdateSetBody {
  id: string;
  name: string;
  printedTotal: number;
}

async function updateSet(body: UpdateSetBody): Promise<{ ok: boolean }> {
  const res = await fetch(`/api/admin/sets`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Failed to update set: ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean }>;
}

export function useUpdateSet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateSet,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "sets"] });
    },
  });
}

interface CreateSetBody {
  id: string;
  name: string;
  printedTotal: number;
}

async function createSet(body: CreateSetBody): Promise<{ ok: boolean }> {
  const res = await fetch(`/api/admin/sets`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? `Failed to create set: ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean }>;
}

export function useCreateSet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createSet,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "sets"] });
    },
  });
}
