import type { Collection } from "@openrift/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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

async function updateCollection({
  id,
  ...body
}: {
  id: string;
  name?: string;
  description?: string | null;
  availableForDeckbuilding?: boolean;
  sortOrder?: number;
}): Promise<Collection> {
  const res = await fetch(`/api/collections/${id}`, {
    method: "PATCH",
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

async function deleteCollection({
  id,
  moveCopiesTo,
}: {
  id: string;
  moveCopiesTo: string;
}): Promise<void> {
  const res = await fetch(`/api/collections/${id}?move_copies_to=${moveCopiesTo}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? `Failed: ${res.status}`);
  }
}

export function useCollections() {
  return useQuery({
    queryKey: ["collections"],
    queryFn: fetchCollections,
  });
}

export function useCreateCollection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCollection,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
  });
}

export function useUpdateCollection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateCollection,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
  });
}

export function useDeleteCollection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCollection,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
      void queryClient.invalidateQueries({ queryKey: ["copies"] });
    },
  });
}
