import type {
  BrokenImagesResponse,
  LowResImagesResponse,
  MissingImageCard,
  RegenerateImagesKickoffResponse,
  RehostImageResponse,
  RehostStatusResponse,
  UnrehostImagesResponse,
} from "@openrift/shared";
import { adminImagesContract } from "@openrift/shared/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

// ── Server functions ─────────────────────────────────────────────────────────

const fetchRehostStatusFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<RehostStatusResponse> =>
      apiOrpcClient(adminImagesContract, context.cookie).rehostStatus(),
  );

const fetchBrokenImagesFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<BrokenImagesResponse> =>
      apiOrpcClient(adminImagesContract, context.cookie).brokenImages(),
  );

const fetchLowResImagesFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<LowResImagesResponse> =>
      apiOrpcClient(adminImagesContract, context.cookie).lowResImages(),
  );

const fetchMissingImagesFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<MissingImageCard[]> =>
      apiOrpcClient(adminImagesContract, context.cookie).missingImages(),
  );

const rehostImagesBatchFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<RehostImageResponse> =>
      apiOrpcClient(adminImagesContract, context.cookie).rehost({ query: {} }),
  );

const regenerateImagesKickoffFn = createServerFn({ method: "POST" })
  .validator((input: { skipExisting?: boolean; reset?: boolean; scansOnly?: boolean }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<RegenerateImagesKickoffResponse> => {
    const query: { skipExisting?: "true"; reset?: "true"; scansOnly?: "true" } = {};
    if (data.skipExisting) {
      query.skipExisting = "true";
    }
    if (data.reset) {
      query.reset = "true";
    }
    if (data.scansOnly) {
      query.scansOnly = "true";
    }
    return apiOrpcClient(adminImagesContract, context.cookie).regenerate({ query });
  });

const cancelRegenerateImagesFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<{ runId: string; cancelRequested: true }> =>
      apiOrpcClient(adminImagesContract, context.cookie).cancelRegenerate(),
  );

const unrehostImagesFn = createServerFn({ method: "POST" })
  .validator((input: { imageIds: string[] }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<UnrehostImagesResponse> =>
      apiOrpcClient(adminImagesContract, context.cookie).unrehost({ imageIds: data.imageIds }),
  );

const clearRehostedFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(async ({ context }) => {
    await apiOrpcClient(adminImagesContract, context.cookie).clearRehosted();
  });

const cleanupOrphanedFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<{ scanned: number; deleted: number; errors: string[] }> =>
      apiOrpcClient(adminImagesContract, context.cookie).cleanupOrphaned(),
  );

const migrateDirectoriesFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(
    ({
      context,
    }): Promise<{
      scanned: number;
      moved: number;
      skipped: number;
      failed: number;
      errors: string[];
    }> => apiOrpcClient(adminImagesContract, context.cookie).migrateDirectories(),
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
    mutationFn: (input: { skipExisting?: boolean; reset?: boolean; scansOnly?: boolean } = {}) =>
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
