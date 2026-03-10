import type { Source } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

async function fetchSources(): Promise<Source[]> {
  const res = await fetch("/api/sources", { credentials: "include" });
  if (!res.ok) {
    throw new Error(`Failed to fetch sources: ${res.status}`);
  }
  return res.json() as Promise<Source[]>;
}

async function createSource(body: { name: string; description?: string | null }): Promise<Source> {
  const res = await fetch("/api/sources", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? `Failed: ${res.status}`);
  }
  return res.json() as Promise<Source>;
}

async function updateSource({
  id,
  ...body
}: {
  id: string;
  name?: string;
  description?: string | null;
}): Promise<Source> {
  const res = await fetch(`/api/sources/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? `Failed: ${res.status}`);
  }
  return res.json() as Promise<Source>;
}

async function deleteSource(id: string): Promise<void> {
  const res = await fetch(`/api/sources/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? `Failed: ${res.status}`);
  }
}

export function useSources() {
  return useQuery({
    queryKey: queryKeys.sources.all,
    queryFn: fetchSources,
  });
}

export function useCreateSource() {
  return useMutationWithInvalidation({
    mutationFn: createSource,
    invalidates: [queryKeys.sources.all],
  });
}

export function useUpdateSource() {
  return useMutationWithInvalidation({
    mutationFn: updateSource,
    invalidates: [queryKeys.sources.all],
  });
}

export function useDeleteSource() {
  return useMutationWithInvalidation({
    mutationFn: deleteSource,
    invalidates: [queryKeys.sources.all],
  });
}
