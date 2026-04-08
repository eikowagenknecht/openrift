import type {
  BrokenImagesResponse,
  LowResImagesResponse,
  RegenerateImageResponse,
  RehostImageResponse,
  RehostStatusResponse,
} from "@openrift/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";

/** Accumulated totals across regeneration batches (excludes per-batch pagination fields). */
export type RegenerateAccumulator = Pick<
  RegenerateImageResponse,
  "total" | "regenerated" | "failed" | "errors"
>;

// ── Server functions ─────────────────────────────────────────────────────────

const fetchRehostStatusFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<RehostStatusResponse> => {
    const res = await fetch(`${API_URL}/api/v1/admin/rehost-status`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Rehost status fetch failed: ${res.status}`);
    }
    return res.json() as Promise<RehostStatusResponse>;
  });

const fetchBrokenImagesFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<BrokenImagesResponse> => {
    const res = await fetch(`${API_URL}/api/v1/admin/broken-images`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Broken images fetch failed: ${res.status}`);
    }
    return res.json() as Promise<BrokenImagesResponse>;
  });

const fetchLowResImagesFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<LowResImagesResponse> => {
    const res = await fetch(`${API_URL}/api/v1/admin/low-res-images`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Low-res images fetch failed: ${res.status}`);
    }
    return res.json() as Promise<LowResImagesResponse>;
  });

interface MissingImageCard {
  cardId: string;
  slug: string;
  name: string;
}

const fetchMissingImagesFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<MissingImageCard[]> => {
    const res = await fetch(`${API_URL}/api/v1/admin/missing-images`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Missing images fetch failed: ${res.status}`);
    }
    return res.json() as Promise<MissingImageCard[]>;
  });

const fetchRenamePreviewFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/rename-preview`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Rename preview fetch failed: ${res.status}`);
    }
    return res.json();
  });

const rehostImagesBatchFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(async ({ context }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/rehost-images`, {
      method: "POST",
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Rehost images batch failed: ${res.status}`);
    }
    return res.json() as Promise<RehostImageResponse>;
  });

const regenerateImagesBatchFn = createServerFn({ method: "POST" })
  .inputValidator((input: { offset: number }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const params = new URLSearchParams({ offset: String(data.offset) });
    const res = await fetch(`${API_URL}/api/v1/admin/regenerate-images?${params.toString()}`, {
      method: "POST",
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Regenerate images batch failed: ${res.status}`);
    }
    return res.json() as Promise<RegenerateImageResponse>;
  });

const clearRehostedFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(async ({ context }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/clear-rehosted`, {
      method: "POST",
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Clear rehosted failed: ${res.status}`);
    }
    return res.json();
  });

const renameImagesFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(async ({ context }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/rename-images`, {
      method: "POST",
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Rename images failed: ${res.status}`);
    }
    return res.json();
  });

const cleanupOrphanedFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(async ({ context }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/cleanup-orphaned`, {
      method: "POST",
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Cleanup orphaned failed: ${res.status}`);
    }
    return res.json();
  });

const migrateDirectoriesFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(async ({ context }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/migrate-directories`, {
      method: "POST",
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Migrate directories failed: ${res.status}`);
    }
    return res.json();
  });

const restoreImageUrlsFn = createServerFn({ method: "POST" })
  .inputValidator((input: { provider: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/restore-image-urls`, {
      method: "POST",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify({ provider: data.provider }),
    });
    if (!res.ok) {
      throw new Error(`Restore image URLs failed: ${res.status}`);
    }
    return res.json();
  });

// ── Query ─────────────────────────────────────────────────────────────────────

export function useRehostStatus() {
  return useQuery({
    queryKey: queryKeys.admin.rehostStatus,
    queryFn: () => fetchRehostStatusFn(),
  });
}

export function useBrokenImages(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.admin.brokenImages,
    queryFn: () => fetchBrokenImagesFn(),
    enabled,
  });
}

export function useLowResImages(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.admin.lowResImages,
    queryFn: () => fetchLowResImagesFn(),
    enabled,
  });
}

export function useMissingImages() {
  return useQuery({
    queryKey: queryKeys.admin.missingImages,
    queryFn: () => fetchMissingImagesFn(),
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
        const batch = await rehostImagesBatchFn();
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
        const batch = await regenerateImagesBatchFn({ data: { offset } });
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
    mutationFn: () => clearRehostedFn(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.rehostStatus });
    },
  });
}

export function useRenamePreview() {
  return useQuery({
    queryKey: queryKeys.admin.renamePreview,
    queryFn: () => fetchRenamePreviewFn(),
  });
}

export function useRenameImages() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => renameImagesFn(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.rehostStatus });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.renamePreview });
    },
  });
}

export function useCleanupOrphaned() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => cleanupOrphanedFn(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.rehostStatus });
    },
  });
}

export function useMigrateDirectories() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => migrateDirectoriesFn(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.rehostStatus });
    },
  });
}

export function useRestoreImageUrls() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (provider: string) => restoreImageUrlsFn({ data: { provider } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.rehostStatus });
    },
  });
}
