import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

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
    queryKey: queryKeys.admin.sets,
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
  return useMutationWithInvalidation({
    mutationFn: updateSet,
    invalidates: [queryKeys.admin.sets],
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
  return useMutationWithInvalidation({
    mutationFn: createSet,
    invalidates: [queryKeys.admin.sets],
  });
}
