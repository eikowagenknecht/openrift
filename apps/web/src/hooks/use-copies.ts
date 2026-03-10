import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export interface CopyRow {
  id: string;
  printing_id: string;
  collection_id: string;
  source_id: string | null;
  created_at: string;
  updated_at: string;
  card_id: string;
  set_id: string;
  collector_number: string;
  rarity: string;
  art_variant: string;
  is_signed: boolean;
  is_promo: boolean;
  finish: string;
  image_url: string;
  artist: string;
  card_name: string;
  card_type: string;
}

async function fetchAllCopies(): Promise<CopyRow[]> {
  const res = await fetch("/api/copies", { credentials: "include" });
  if (!res.ok) {
    throw new Error(`Failed to fetch copies: ${res.status}`);
  }
  return res.json() as Promise<CopyRow[]>;
}

async function fetchCollectionCopies(collectionId: string): Promise<CopyRow[]> {
  const res = await fetch(`/api/collections/${collectionId}/copies`, { credentials: "include" });
  if (!res.ok) {
    throw new Error(`Failed to fetch copies: ${res.status}`);
  }
  return res.json() as Promise<CopyRow[]>;
}

async function addCopies(body: {
  copies: { printingId: string; collectionId?: string; sourceId?: string }[];
}): Promise<{ id: string; printingId: string; collectionId: string; sourceId: string | null }[]> {
  const res = await fetch("/api/copies", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? `Failed: ${res.status}`);
  }
  return res.json() as Promise<
    { id: string; printingId: string; collectionId: string; sourceId: string | null }[]
  >;
}

async function moveCopies(body: { copyIds: string[]; toCollectionId: string }): Promise<void> {
  const res = await fetch("/api/copies/move", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? `Failed: ${res.status}`);
  }
}

async function disposeCopies(body: { copyIds: string[] }): Promise<void> {
  const res = await fetch("/api/copies/dispose", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? `Failed: ${res.status}`);
  }
}

export function useCopies(collectionId?: string) {
  return useQuery({
    queryKey: collectionId ? queryKeys.copies.byCollection(collectionId) : queryKeys.copies.all,
    queryFn: () => (collectionId ? fetchCollectionCopies(collectionId) : fetchAllCopies()),
  });
}

export function useAddCopies() {
  return useMutationWithInvalidation({
    mutationFn: addCopies,
    invalidates: [queryKeys.copies.all, queryKeys.ownedCount.all, queryKeys.collections.all],
  });
}

export function useMoveCopies() {
  return useMutationWithInvalidation({
    mutationFn: moveCopies,
    invalidates: [queryKeys.copies.all, queryKeys.collections.all],
  });
}

export function useDisposeCopies() {
  return useMutationWithInvalidation({
    mutationFn: disposeCopies,
    invalidates: [queryKeys.copies.all, queryKeys.ownedCount.all, queryKeys.collections.all],
  });
}
