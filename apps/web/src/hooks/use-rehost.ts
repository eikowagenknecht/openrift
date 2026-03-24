import type { RehostImageResponse, RegenerateImageResponse } from "@openrift/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { client, rpc } from "@/lib/rpc-client";
import { fetchApi } from "@/lib/server-fns";

/** Accumulated totals across regeneration batches (excludes per-batch pagination fields). */
export type RegenerateAccumulator = Pick<
  RegenerateImageResponse,
  "total" | "regenerated" | "failed" | "errors"
>;

// ── Query ─────────────────────────────────────────────────────────────────────

export function useRehostStatus() {
  return useQuery({
    queryKey: queryKeys.admin.rehostStatus,
    queryFn: () => fetchApi({ data: "/api/admin/rehost-status" }),
  });
}

export function useBrokenImages() {
  return useQuery({
    queryKey: queryKeys.admin.brokenImages,
    queryFn: () => fetchApi({ data: "/api/admin/broken-images" }),
  });
}

export function useMissingImages() {
  return useQuery({
    queryKey: queryKeys.admin.missingImages,
    queryFn: () => fetchApi({ data: "/api/admin/missing-images" }),
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
        const batch = await rpc(client.api.admin["rehost-images"].$post({ query: {} }));
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
        const batch = await rpc(
          client.api.admin["regenerate-images"].$post({
            query: { offset: String(offset) },
          }),
        );
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
    mutationFn: () => rpc(client.api.admin["clear-rehosted"].$post()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.rehostStatus });
    },
  });
}

export function useRenamePreview() {
  return useQuery({
    queryKey: queryKeys.admin.renamePreview,
    queryFn: () => fetchApi({ data: "/api/admin/rename-preview" }),
  });
}

export function useRenameImages() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => rpc(client.api.admin["rename-images"].$post()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.rehostStatus });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.renamePreview });
    },
  });
}

export function useCleanupOrphaned() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => rpc(client.api.admin["cleanup-orphaned"].$post()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.rehostStatus });
    },
  });
}

export function useRestoreImageUrls() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (provider: string) =>
      rpc(client.api.admin["restore-image-urls"].$post({ json: { provider } })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.rehostStatus });
    },
  });
}
