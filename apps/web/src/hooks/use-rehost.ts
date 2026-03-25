import type { RehostImageResponse, RegenerateImageResponse } from "@openrift/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";

/** Accumulated totals across regeneration batches (excludes per-batch pagination fields). */
export type RegenerateAccumulator = Pick<
  RegenerateImageResponse,
  "total" | "regenerated" | "failed" | "errors"
>;

// ── Query ─────────────────────────────────────────────────────────────────────

export function useRehostStatus() {
  return useQuery({
    queryKey: queryKeys.admin.rehostStatus,
    queryFn: async () => {
      const res = await client.api.v1.admin["rehost-status"].$get();
      assertOk(res);
      return await res.json();
    },
  });
}

export function useBrokenImages() {
  return useQuery({
    queryKey: queryKeys.admin.brokenImages,
    queryFn: async () => {
      const res = await client.api.v1.admin["broken-images"].$get();
      assertOk(res);
      return await res.json();
    },
  });
}

export function useMissingImages() {
  return useQuery({
    queryKey: queryKeys.admin.missingImages,
    queryFn: async () => {
      const res = await client.api.v1.admin["missing-images"].$get();
      assertOk(res);
      return await res.json();
    },
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useRehostImages(onBatchComplete?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<RehostImageResponse> => {
      const totals: RehostImageResponse = {
        total: 0,
        rehosted: 0,
        skipped: 0,
        failed: 0,
        errors: [],
      };
      for (;;) {
        const res = await client.api.v1.admin["rehost-images"].$post({ query: {} });
        assertOk(res);
        const batch = await res.json();
        totals.total += batch.total;
        totals.rehosted += batch.rehosted;
        totals.skipped += batch.skipped;
        totals.failed += batch.failed;
        totals.errors.push(...batch.errors);
        onBatchComplete?.();
        if (batch.total === 0 || batch.rehosted === 0) {
          break;
        }
      }
      return totals;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.rehostStatus });
    },
  });
}

export function useRegenerateImages(onProgress?: (processed: number, totalFiles: number) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<RegenerateAccumulator> => {
      const totals: RegenerateAccumulator = { total: 0, regenerated: 0, failed: 0, errors: [] };
      let offset = 0;
      for (;;) {
        const res = await client.api.v1.admin["regenerate-images"].$post({
          query: { offset: String(offset) },
        });
        assertOk(res);
        const batch = await res.json();
        totals.total += batch.total;
        totals.regenerated += batch.regenerated;
        totals.failed += batch.failed;
        totals.errors.push(...batch.errors);
        onProgress?.(offset + batch.total, batch.totalFiles);
        if (!batch.hasMore) {
          break;
        }
        offset += batch.total;
      }
      return totals;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.rehostStatus });
    },
  });
}

export function useClearRehosted() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await client.api.v1.admin["clear-rehosted"].$post();
      assertOk(res);
      return await res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.rehostStatus });
    },
  });
}

export function useRenamePreview() {
  return useQuery({
    queryKey: queryKeys.admin.renamePreview,
    queryFn: async () => {
      const res = await client.api.v1.admin["rename-preview"].$get();
      assertOk(res);
      return await res.json();
    },
  });
}

export function useRenameImages() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await client.api.v1.admin["rename-images"].$post();
      assertOk(res);
      return await res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.rehostStatus });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.renamePreview });
    },
  });
}

export function useCleanupOrphaned() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await client.api.v1.admin["cleanup-orphaned"].$post();
      assertOk(res);
      return await res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.rehostStatus });
    },
  });
}

export function useRestoreImageUrls() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (provider: string) => {
      const res = await client.api.v1.admin["restore-image-urls"].$post({ json: { provider } });
      assertOk(res);
      return await res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.rehostStatus });
    },
  });
}
