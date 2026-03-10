import type { Collection } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

async function fetchCollections(): Promise<Collection[]> {
  const res = await fetch("/api/collections", { credentials: "include" });
  if (!res.ok) {
    throw new Error(`Failed to fetch collections: ${res.status}`);
  }
  return res.json() as Promise<Collection[]>;
}

async function createCollection(body: {
  name: string;
  description?: string | null;
  availableForDeckbuilding?: boolean;
}): Promise<Collection> {
  const res = await fetch("/api/collections", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? `Failed: ${res.status}`);
  }
  return res.json() as Promise<Collection>;
}

export function useCollections() {
  return useQuery({
    queryKey: queryKeys.collections.all,
    queryFn: fetchCollections,
  });
}

export function useCreateCollection() {
  return useMutationWithInvalidation({
    mutationFn: createCollection,
    invalidates: [queryKeys.collections.all],
  });
}
