import type { JobRunStartedResponse } from "@openrift/shared";
import { adminScanContract } from "@openrift/shared/contracts/admin/scan";
import type { ScanManifest } from "@openrift/shared/contracts/scan";
import { scanContract } from "@openrift/shared/contracts/scan";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { getLatestJobRunFn } from "@/components/admin/refresh-actions";
import type { JobRunView } from "@/lib/server-fns/api-types";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const REBUILD_SCAN_BANK_KIND = "scan.rebuild_bank";

const MANIFEST_KEY = ["scan", "manifest"] as const;
const REBUILD_RUN_KEY = ["admin", "job-runs", REBUILD_SCAN_BANK_KIND] as const;

interface ScanAssets {
  bankUrl: string;
  labelsUrl: string;
  encoderUrl: string;
  opencvUrl: string;
  bankHash: string | null;
  entryCount: number | null;
  builtAt: string | null;
}

// No local fallback: an unpublished bank leaves the scanner unavailable.
export type ScanServing =
  | { status: "loading"; assets: null }
  | { status: "unavailable"; assets: null }
  | { status: "ready"; assets: ScanAssets };

const fetchScanManifestFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<ScanManifest> =>
    apiOrpcClient(scanContract, context.cookie).manifest(),
  );

export function useScanServing(): ScanServing {
  const manifest = useQuery({
    queryKey: MANIFEST_KEY,
    queryFn: () => fetchScanManifestFn(),
    staleTime: 60_000,
    retry: 1,
  });
  if (manifest.isPending) {
    return { status: "loading", assets: null };
  }
  const data = manifest.data;
  if (!data?.available || data.bankUrl === null || data.labelsUrl === null) {
    return { status: "unavailable", assets: null };
  }
  return {
    status: "ready",
    assets: {
      bankUrl: data.bankUrl,
      labelsUrl: data.labelsUrl,
      encoderUrl: data.encoderUrl,
      opencvUrl: data.opencvUrl,
      bankHash: data.bankHash,
      entryCount: data.entryCount,
      builtAt: data.builtAt,
    },
  };
}

const rebuildScanBankFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(({ context }): Promise<JobRunStartedResponse> =>
    apiOrpcClient(adminScanContract, context.cookie).rebuildBank(),
  );

export function useRebuildScanBank() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => rebuildScanBankFn(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: REBUILD_RUN_KEY });
      void queryClient.invalidateQueries({ queryKey: MANIFEST_KEY });
    },
  });
}

export function useLatestScanBankRun() {
  return useQuery({
    queryKey: REBUILD_RUN_KEY,
    queryFn: async (): Promise<JobRunView | null> => {
      const response = await getLatestJobRunFn({ data: { kind: REBUILD_SCAN_BANK_KIND } });
      return response.runs[0] ?? null;
    },
    refetchInterval: (query) => (query.state.data?.status === "running" ? 2000 : 60_000),
  });
}
