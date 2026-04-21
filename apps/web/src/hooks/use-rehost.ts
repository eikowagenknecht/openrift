import type {
  BrokenImagesResponse,
  LowResImagesResponse,
  RegenerateImageResponse,
  RehostImageResponse,
  RehostStatusResponse,
  UnrehostImagesResponse,
} from "@openrift/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { fetchApi, fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";

/** Accumulated totals across regeneration batches (excludes per-batch pagination fields). */
export type RegenerateAccumulator = Pick<
  RegenerateImageResponse,
  "total" | "regenerated" | "failed" | "errors"
>;

// ── Server functions ─────────────────────────────────────────────────────────

const fetchRehostStatusFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<RehostStatusResponse> =>
      fetchApiJson<RehostStatusResponse>({
        errorTitle: "Couldn't load rehost status",
        cookie: context.cookie,
        path: "/api/v1/admin/rehost-status",
      }),
  );

const fetchBrokenImagesFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<BrokenImagesResponse> =>
      fetchApiJson<BrokenImagesResponse>({
        errorTitle: "Couldn't load broken images",
        cookie: context.cookie,
        path: "/api/v1/admin/broken-images",
      }),
  );

const fetchLowResImagesFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<LowResImagesResponse> =>
      fetchApiJson<LowResImagesResponse>({
        errorTitle: "Couldn't load low-res images",
        cookie: context.cookie,
        path: "/api/v1/admin/low-res-images",
      }),
  );

interface MissingImageCard {
  cardId: string;
  slug: string;
  name: string;
}

const fetchMissingImagesFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<MissingImageCard[]> =>
      fetchApiJson<MissingImageCard[]>({
        errorTitle: "Couldn't load missing images",
        cookie: context.cookie,
        path: "/api/v1/admin/missing-images",
      }),
  );

const rehostImagesBatchFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(({ context }) =>
    fetchApiJson<RehostImageResponse>({
      errorTitle: "Couldn't rehost images",
      cookie: context.cookie,
      path: "/api/v1/admin/rehost-images",
      method: "POST",
    }),
  );

const regenerateImagesBatchFn = createServerFn({ method: "POST" })
  .inputValidator((input: { offset: number }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) => {
    const params = new URLSearchParams({ offset: String(data.offset) });
    return fetchApiJson<RegenerateImageResponse>({
      errorTitle: "Couldn't regenerate images",
      cookie: context.cookie,
      path: `/api/v1/admin/regenerate-images?${params.toString()}`,
      method: "POST",
    });
  });

const unrehostImagesFn = createServerFn({ method: "POST" })
  .inputValidator((input: { imageIds: string[] }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<UnrehostImagesResponse> =>
      fetchApiJson<UnrehostImagesResponse>({
        errorTitle: "Couldn't unrehost images",
        cookie: context.cookie,
        path: "/api/v1/admin/unrehost-images",
        method: "POST",
        body: { imageIds: data.imageIds },
      }),
  );

const clearRehostedFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(async ({ context }) => {
    await fetchApi({
      errorTitle: "Couldn't clear rehosted images",
      cookie: context.cookie,
      path: "/api/v1/admin/clear-rehosted",
      method: "POST",
    });
  });

const cleanupOrphanedFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(({ context }) =>
    fetchApiJson<{ scanned: number; deleted: number; errors: string[] }>({
      errorTitle: "Couldn't clean up orphaned images",
      cookie: context.cookie,
      path: "/api/v1/admin/cleanup-orphaned",
      method: "POST",
    }),
  );

const migrateDirectoriesFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(({ context }) =>
    fetchApiJson<{
      scanned: number;
      moved: number;
      skipped: number;
      failed: number;
      errors: string[];
    }>({
      errorTitle: "Couldn't migrate directories",
      cookie: context.cookie,
      path: "/api/v1/admin/migrate-directories",
      method: "POST",
    }),
  );

const restoreImageUrlsFn = createServerFn({ method: "POST" })
  .inputValidator((input: { provider: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    fetchApiJson<{ updated: number; provider: string }>({
      errorTitle: "Couldn't restore image URLs",
      cookie: context.cookie,
      path: "/api/v1/admin/restore-image-urls",
      method: "POST",
      body: { provider: data.provider },
    }),
  );

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
      while (true) {
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

export function useUnrehostImages() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (imageIds: string[]) => unrehostImagesFn({ data: { imageIds } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.rehostStatus });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.brokenImages });
    },
  });
}

export function useRegenerateImages(onProgress?: (processed: number, totalFiles: number) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<RegenerateAccumulator> => {
      const totals: RegenerateAccumulator = { total: 0, regenerated: 0, failed: 0, errors: [] };
      let offset = 0;
      while (true) {
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
