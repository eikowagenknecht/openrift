import { useMutation, useQuery } from "@tanstack/react-query";
import { createLazyFileRoute } from "@tanstack/react-router";
import {
  CheckIcon,
  HardDriveIcon,
  ImageIcon,
  LoaderIcon,
  RefreshCwIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createLazyFileRoute("/_authenticated/admin/images")({
  component: AdminImagesPage,
});

// ── Types ────────────────────────────────────────────────────────────────────

interface SetImageStats {
  setId: string;
  setName: string;
  total: number;
  rehosted: number;
  external: number;
}

interface DiskSetStats {
  setId: string;
  bytes: number;
  fileCount: number;
}

interface RehostStatus {
  total: number;
  rehosted: number;
  external: number;
  sets: SetImageStats[];
  disk: { totalBytes: number; sets: DiskSetStats[] };
}

interface RehostResult {
  total: number;
  rehosted: number;
  skipped: number;
  failed: number;
  errors: string[];
}

interface RegenerateResult {
  total: number;
  regenerated: number;
  failed: number;
  errors: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / 1024 ** i;
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

function useRehostStatus() {
  return useQuery<RehostStatus>({
    queryKey: ["admin", "rehost-status"],
    queryFn: async () => {
      const res = await fetch("/api/admin/rehost-status", { credentials: "include" });
      if (!res.ok) {
        throw new Error("Failed to fetch rehost status");
      }
      return res.json();
    },
  });
}

// ── Page ─────────────────────────────────────────────────────────────────────

function AdminImagesPage() {
  const { data: status, isLoading, refetch } = useRehostStatus();

  const [regenProgress, setRegenProgress] = useState<{
    processed: number;
    totalFiles: number;
  } | null>(null);

  const regenerateMutation = useMutation({
    mutationFn: async (): Promise<RegenerateResult> => {
      const totals: RegenerateResult = { total: 0, regenerated: 0, failed: 0, errors: [] };
      let offset = 0;

      for (;;) {
        const res = await fetch(`/api/admin/regenerate-images?offset=${offset}`, {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `Request failed (${res.status})`);
        }
        const json = await res.json();
        const batch = json.result;
        totals.total += batch.total;
        totals.regenerated += batch.regenerated;
        totals.failed += batch.failed;
        totals.errors.push(...batch.errors);
        setRegenProgress({ processed: offset + batch.total, totalFiles: batch.totalFiles });

        if (!batch.hasMore) {
          break;
        }
        offset += batch.total;
      }

      return totals;
    },
    onSuccess: () => {
      setRegenProgress(null);
      refetch();
    },
  });

  const mutation = useMutation({
    mutationFn: async (): Promise<RehostResult> => {
      const totals: RehostResult = { total: 0, rehosted: 0, skipped: 0, failed: 0, errors: [] };

      // Process in batches until no more external images remain
      for (;;) {
        const res = await fetch("/api/admin/rehost-images", {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `Request failed (${res.status})`);
        }
        const rehostJson = await res.json();
        const batch: RehostResult = rehostJson.result;
        totals.total += batch.total;
        totals.rehosted += batch.rehosted;
        totals.skipped += batch.skipped;
        totals.failed += batch.failed;
        totals.errors.push(...batch.errors);

        // Refresh stats so the progress bar updates live
        refetch();

        if (batch.total === 0) {
          break;
        }
      }

      return totals;
    },
    onSuccess: () => {
      refetch();
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const allDone = status !== undefined && status.external === 0;
  const pct = status && status.total > 0 ? (status.rehosted / status.total) * 100 : 0;
  const diskBySet = new Map(status?.disk.sets.map((s) => [s.setId, s]));

  return (
    <div className="space-y-6">
      {/* Summary + action */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="size-5 shrink-0" />
                  Rehost Images
                </CardTitle>
                <CardDescription className="mt-1.5">
                  Download external card images and serve them locally as pre-generated WebP
                  variants
                </CardDescription>
              </div>
              {status && (
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between text-sm">
                    <span>
                      {status.rehosted} / {status.total} rehosted
                    </span>
                    <span className="text-muted-foreground">{Math.round(pct)}%</span>
                  </div>
                  <Progress value={pct} />
                </div>
              )}
            </div>
            <Button
              size="sm"
              disabled={mutation.isPending || allDone}
              onClick={() => mutation.mutate()}
              className="shrink-0"
            >
              {mutation.isPending ? <LoaderIcon className="size-4 animate-spin" /> : "Run"}
            </Button>
          </div>
          {mutation.isSuccess && (
            <div>
              <p className="mt-2 flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                <CheckIcon className="size-4" />
                Completed successfully
              </p>
              <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                <p>
                  Rehosted: {mutation.data.rehosted}, Skipped: {mutation.data.skipped}, Failed:{" "}
                  {mutation.data.failed}
                </p>
                {mutation.data.errors.length > 0 && (
                  <ul className="ml-3 list-disc text-red-600 dark:text-red-400">
                    {mutation.data.errors.slice(0, 10).map((err) => (
                      <li key={err}>{err}</li>
                    ))}
                    {mutation.data.errors.length > 10 && (
                      <li>...and {mutation.data.errors.length - 10} more</li>
                    )}
                  </ul>
                )}
              </div>
            </div>
          )}
          {mutation.isError && (
            <p className="mt-2 flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
              <XIcon className="size-4" />
              {mutation.error.message}
            </p>
          )}
        </CardHeader>
      </Card>

      {/* Regenerate from originals */}
      {status && status.disk.totalBytes > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <CardTitle className="flex items-center gap-2">
                  <RefreshCwIcon className="size-5 shrink-0" />
                  Regenerate WebP
                </CardTitle>
                <CardDescription className="mt-1.5">
                  Re-generate all WebP variants from stored originals (e.g. after changing quality
                  settings)
                </CardDescription>
                {regenProgress && (
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-baseline justify-between text-sm">
                      <span>
                        {regenProgress.processed} / {regenProgress.totalFiles} processed
                      </span>
                      <span className="text-muted-foreground">
                        {Math.round((regenProgress.processed / regenProgress.totalFiles) * 100)}%
                      </span>
                    </div>
                    <Progress value={(regenProgress.processed / regenProgress.totalFiles) * 100} />
                  </div>
                )}
              </div>
              <Button
                size="sm"
                disabled={regenerateMutation.isPending || mutation.isPending}
                onClick={() => regenerateMutation.mutate()}
                className="shrink-0"
              >
                {regenerateMutation.isPending ? (
                  <LoaderIcon className="size-4 animate-spin" />
                ) : (
                  "Run"
                )}
              </Button>
            </div>
            {regenerateMutation.isSuccess && (
              <div>
                <p className="mt-2 flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                  <CheckIcon className="size-4" />
                  Regenerated {regenerateMutation.data.regenerated} /{" "}
                  {regenerateMutation.data.total} images
                </p>
                {regenerateMutation.data.errors.length > 0 && (
                  <ul className="ml-3 mt-1 list-disc text-xs text-red-600 dark:text-red-400">
                    {regenerateMutation.data.errors.slice(0, 10).map((err) => (
                      <li key={err}>{err}</li>
                    ))}
                    {regenerateMutation.data.errors.length > 10 && (
                      <li>...and {regenerateMutation.data.errors.length - 10} more</li>
                    )}
                  </ul>
                )}
              </div>
            )}
            {regenerateMutation.isError && (
              <p className="mt-2 flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
                <XIcon className="size-4" />
                {regenerateMutation.error.message}
              </p>
            )}
          </CardHeader>
        </Card>
      )}

      {/* Per-set breakdown */}
      {status && status.sets.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <HardDriveIcon className="size-4 shrink-0" />
              Sets
            </CardTitle>
            {status.disk.totalBytes > 0 && (
              <CardDescription>
                {status.disk.sets.reduce((sum, s) => sum + s.fileCount, 0)} files &middot;{" "}
                {formatBytes(status.disk.totalBytes)}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {status.sets.map((s) => {
                const setPct = s.total > 0 ? (s.rehosted / s.total) * 100 : 0;
                const disk = diskBySet.get(s.setId);
                return (
                  <div key={s.setId} className="space-y-1">
                    <div className="flex items-baseline justify-between text-sm">
                      <span>
                        <span className="font-medium">{s.setName}</span>
                        <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                          {s.setId}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {s.rehosted} / {s.total}
                        {disk ? ` · ${disk.fileCount} files · ${formatBytes(disk.bytes)}` : ""}
                      </span>
                    </div>
                    <Progress value={setPct} className="h-1.5" />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
