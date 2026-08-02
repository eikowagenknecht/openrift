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

/**
 * Where the scanner's downloadable assets come from: the server's manifest
 * (content-hashed, immutable) or the dev export's public paths.
 */
export interface ScanAssets {
  source: "manifest" | "dev";
  bankUrl: string;
  labelsUrl: string;
  encoderUrl: string;
  opencvUrl: string;
  bankHash: string | null;
  entryCount: number | null;
  builtAt: string | null;
}

/** The dev-export fallback: files written by `bun scripts/scan/export-index.ts`. */
const DEV_SCAN_ASSETS: ScanAssets = {
  source: "dev",
  bankUrl: "/scan-embed-bank.bin",
  labelsUrl: "/scan-labels.json",
  encoderUrl: "/scan-encoder.onnx",
  opencvUrl: "/scan-opencv.js",
  bankHash: null,
  entryCount: null,
  builtAt: null,
};

const fetchScanManifestFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<ScanManifest> => apiOrpcClient(scanContract, context.cookie).manifest(),
  );

/**
 * The serving manifest, resolved to usable asset URLs.
 *
 * @returns Null while resolving; afterwards the manifest's assets, or the dev
 *   fallback when no bank has ever been built (or the manifest failed).
 */
export function useScanAssets(): ScanAssets | null {
  const manifest = useQuery({
    queryKey: MANIFEST_KEY,
    queryFn: () => fetchScanManifestFn(),
    staleTime: 60_000,
    retry: 1,
  });
  if (manifest.isPending) {
    return null;
  }
  const data = manifest.data;
  if (!data?.available || data.bankUrl === null || data.labelsUrl === null) {
    return DEV_SCAN_ASSETS;
  }
  return {
    source: "manifest",
    bankUrl: data.bankUrl,
    labelsUrl: data.labelsUrl,
    encoderUrl: data.encoderUrl,
    opencvUrl: data.opencvUrl,
    bankHash: data.bankHash,
    entryCount: data.entryCount,
    builtAt: data.builtAt,
  };
}

const rebuildScanBankFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<JobRunStartedResponse> =>
      apiOrpcClient(adminScanContract, context.cookie).rebuildBank(),
  );

export function useRebuildScanBank() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => rebuildScanBankFn(),
    onSuccess: () => {
      // Surface the running row immediately; the manifest refreshes once the
      // rebuild lands a new generation.
      queryClient.invalidateQueries({ queryKey: REBUILD_RUN_KEY });
      queryClient.invalidateQueries({ queryKey: MANIFEST_KEY });
    },
  });
}

/**
 * Poll the latest rebuild run: every 2s while running so the page flips to
 * the result quickly, every 60s otherwise.
 *
 * @returns A react-query result with the latest run row or null.
 */
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
