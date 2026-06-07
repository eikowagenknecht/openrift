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
import { callApi, callApiJson, serverApiClient } from "@/lib/server-fns/api-client";
import { withCookies } from "@/lib/server-fns/middleware";

// ── Server functions ─────────────────────────────────────────────────────────

const fetchRehostStatusFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<RehostStatusResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.admin.v1["rehost-status"].$get(),
        "Couldn't load rehost status",
      ),
  );

const fetchBrokenImagesFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<BrokenImagesResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.admin.v1["broken-images"].$get(),
        "Couldn't load broken images",
      ),
  );

const fetchLowResImagesFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<LowResImagesResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.admin.v1["low-res-images"].$get(),
        "Couldn't load low-res images",
      ),
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
      callApiJson(
        serverApiClient(context.cookie).api.admin.v1["missing-images"].$get(),
        "Couldn't load missing images",
      ),
  );

const rehostImagesBatchFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<RehostImageResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.admin.v1["rehost-images"].$post({ query: {} }),
        "Couldn't rehost images",
      ),
  );

const regenerateImagesKickoffFn = createServerFn({ method: "POST" })
  .validator((input: { skipExisting?: boolean; reset?: boolean }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<RegenerateImagesKickoffResponse> => {
    const query: { skipExisting?: "true"; reset?: "true" } = {};
    if (data.skipExisting) {
      query.skipExisting = "true";
    }
    if (data.reset) {
      query.reset = "true";
    }
    return callApiJson(
      serverApiClient(context.cookie).api.admin.v1["regenerate-images"].$post({ query }),
      "Couldn't start regenerate images job",
    );
  });

const cancelRegenerateImagesFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<{ runId: string; cancelRequested: true }> =>
      callApiJson(
        serverApiClient(context.cookie).api.admin.v1["regenerate-images"].cancel.$post(),
        "Couldn't cancel regenerate images job",
      ),
  );

const unrehostImagesFn = createServerFn({ method: "POST" })
  .validator((input: { imageIds: string[] }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<UnrehostImagesResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.admin.v1["unrehost-images"].$post({
          json: { imageIds: data.imageIds },
        }),
        "Couldn't unrehost images",
      ),
  );

const clearRehostedFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(async ({ context }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1["clear-rehosted"].$post(),
      "Couldn't clear rehosted images",
    );
  });

const cleanupOrphanedFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<{ scanned: number; deleted: number; errors: string[] }> =>
      callApiJson(
        serverApiClient(context.cookie).api.admin.v1["cleanup-orphaned"].$post(),
        "Couldn't clean up orphaned images",
      ),
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
    }> =>
      callApiJson(
        serverApiClient(context.cookie).api.admin.v1["migrate-directories"].$post(),
        "Couldn't migrate directories",
      ),
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
