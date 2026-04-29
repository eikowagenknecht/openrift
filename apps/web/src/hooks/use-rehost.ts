import type {
  BrokenImagesResponse,
  LowResImagesResponse,
  RegenerateImagesKickoffResponse,
  RehostImageResponse,
  RehostStatusResponse,
  UnrehostImagesResponse,
} from "@openrift/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { fetchApi, fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";

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

const regenerateImagesKickoffFn = createServerFn({ method: "POST" })
  .inputValidator((input: { skipExisting?: boolean; reset?: boolean }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) => {
    const params = new URLSearchParams();
    if (data.skipExisting) {
      params.set("skipExisting", "true");
    }
    if (data.reset) {
      params.set("reset", "true");
    }
    const qs = params.toString();
    return fetchApiJson<RegenerateImagesKickoffResponse>({
      errorTitle: "Couldn't start regenerate images job",
      cookie: context.cookie,
      path: `/api/v1/admin/regenerate-images${qs ? `?${qs}` : ""}`,
      method: "POST",
    });
  });

const cancelRegenerateImagesFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(({ context }) =>
    fetchApiJson<{ runId: string; cancelRequested: true }>({
      errorTitle: "Couldn't cancel regenerate images job",
      cookie: context.cookie,
      path: "/api/v1/admin/regenerate-images/cancel",
      method: "POST",
    }),
  );

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

/**
 * Kick off the resumable regenerate-images job. Returns a `runId` immediately;
 * progress is read separately via the `useLatestJobRunByKind` hook.
 *
 * The server auto-resumes from the most recent failed run unless `reset: true`
 * is passed.
 * @returns Mutation that POSTs the kickoff request and returns `{runId, status}`.
 */
export function useRegenerateImages() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { skipExisting?: boolean; reset?: boolean } = {}) =>
      regenerateImagesKickoffFn({ data: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.admin.jobRunsByKind("images.regenerate"),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.jobRuns });
    },
  });
}

/**
 * Request cancellation of the currently-running regenerate-images job.
 * @returns Mutation that POSTs the cancel request.
 */
export function useCancelRegenerateImages() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => cancelRegenerateImagesFn(),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.admin.jobRunsByKind("images.regenerate"),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.jobRuns });
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
