import { useMutation, useQuery } from "@tanstack/react-query";
import { createLazyFileRoute } from "@tanstack/react-router";
import { CheckIcon, LoaderIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { formatRelativeTime, useCronStatus } from "@/components/admin/refresh-actions";
import type { CronStatus } from "@/components/admin/refresh-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useCardmarketGroups } from "@/hooks/use-cardmarket-groups";
import { useSets } from "@/hooks/use-sets";
import { useTcgplayerGroups } from "@/hooks/use-tcgplayer-groups";
import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

export const Route = createLazyFileRoute("/_authenticated/admin/")({
  component: AdminOverviewPage,
});

// ── Image rehost types & hooks ──────────────────────────────────────────────

interface RehostStatus {
  total: number;
  rehosted: number;
  external: number;
  disk: { totalBytes: number; sets: { setId: string; bytes: number; fileCount: number }[] };
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
    queryKey: queryKeys.admin.rehostStatus,
    queryFn: () => api.get<RehostStatus>("/api/admin/rehost-status"),
  });
}

function StatCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string | number;
  description?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      {description && (
        <CardContent>
          <p className="text-xs text-muted-foreground">{description}</p>
        </CardContent>
      )}
    </Card>
  );
}

function ScheduleCard({
  label,
  cronKey,
  cronStatus,
}: {
  label: string;
  cronKey: keyof CronStatus;
  cronStatus?: CronStatus;
}) {
  const entry = cronStatus?.[cronKey];
  const nextRun = entry?.nextRun;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-sm font-medium">
          {nextRun ? formatRelativeTime(nextRun) : "No schedule"}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}

function ImagesSection() {
  const { data: status, refetch } = useRehostStatus();

  const [regenProgress, setRegenProgress] = useState<{
    processed: number;
    totalFiles: number;
  } | null>(null);

  const rehostMutation = useMutation({
    mutationFn: async (): Promise<RehostResult> => {
      const totals: RehostResult = { total: 0, rehosted: 0, skipped: 0, failed: 0, errors: [] };
      for (;;) {
        const json = await api.post<{ result: RehostResult }>("/api/admin/rehost-images");
        const batch = json.result;
        totals.total += batch.total;
        totals.rehosted += batch.rehosted;
        totals.skipped += batch.skipped;
        totals.failed += batch.failed;
        totals.errors.push(...batch.errors);
        refetch();
        if (batch.total === 0) {
          break;
        }
      }
      return totals;
    },
    onSuccess: () => refetch(),
  });

  const regenMutation = useMutation({
    mutationFn: async (): Promise<RegenerateResult> => {
      const totals: RegenerateResult = { total: 0, regenerated: 0, failed: 0, errors: [] };
      let offset = 0;
      for (;;) {
        const json = await api.post<{
          result: RegenerateResult & { totalFiles: number; hasMore: boolean };
        }>(`/api/admin/regenerate-images?offset=${offset}`);
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

  const clearMutation = useMutation({
    mutationFn: () => api.post<{ result: { cleared: number } }>("/api/admin/clear-rehosted"),
    onSuccess: () => refetch(),
  });

  if (!status) {
    return null;
  }

  const pct = status.total > 0 ? (status.rehosted / status.total) * 100 : 0;
  const allDone = status.external === 0;
  const anyPending = rehostMutation.isPending || regenMutation.isPending || clearMutation.isPending;
  const totalFiles = status.disk.sets.reduce((sum, s) => sum + s.fileCount, 0);

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">Images</h2>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base">Rehosted Images</CardTitle>
              <CardDescription>
                {status.rehosted} / {status.total} images
                {status.disk.totalBytes > 0 &&
                  ` · ${totalFiles} files · ${formatBytes(status.disk.totalBytes)}`}
              </CardDescription>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={anyPending || !status.rehosted}
                onClick={() => clearMutation.mutate()}
              >
                {clearMutation.isPending ? (
                  <LoaderIcon className="size-4 animate-spin" />
                ) : (
                  "Clear all"
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={anyPending || !status.disk.totalBytes}
                onClick={() => regenMutation.mutate()}
              >
                {regenMutation.isPending ? (
                  <LoaderIcon className="size-4 animate-spin" />
                ) : (
                  "Regenerate"
                )}
              </Button>
              <Button
                size="sm"
                disabled={anyPending || allDone}
                onClick={() => rehostMutation.mutate()}
              >
                {rehostMutation.isPending ? (
                  <LoaderIcon className="size-4 animate-spin" />
                ) : (
                  "Rehost"
                )}
              </Button>
            </div>
          </div>
          <Progress value={pct} className="h-1.5" />
        </CardHeader>
        {(regenProgress ||
          rehostMutation.isSuccess ||
          rehostMutation.isError ||
          regenMutation.isSuccess ||
          regenMutation.isError) && (
          <CardContent className="pt-0">
            {regenProgress && (
              <div className="space-y-1.5">
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
            <MutationStatus mutation={rehostMutation} label="rehost" />
            <MutationStatus mutation={regenMutation} label="regenerate" />
          </CardContent>
        )}
      </Card>
    </section>
  );
}

function MutationStatus({
  mutation,
  label,
}: {
  mutation: {
    isSuccess: boolean;
    isError: boolean;
    data?: RehostResult | RegenerateResult;
    error?: Error | null;
  };
  label: string;
}) {
  if (mutation.isSuccess && mutation.data) {
    const d = mutation.data;
    const count = "rehosted" in d ? d.rehosted : "regenerated" in d ? d.regenerated : 0;
    const errors = d.errors;
    return (
      <div>
        <p className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
          <CheckIcon className="size-4" />
          {label === "rehost" ? `Rehosted ${count}` : `Regenerated ${count}`} / {d.total} images
        </p>
        {errors.length > 0 && (
          <ul className="ml-5 mt-1 list-disc text-xs text-red-600 dark:text-red-400">
            {errors.slice(0, 5).map((err) => (
              <li key={err}>{err}</li>
            ))}
            {errors.length > 5 && <li>...and {errors.length - 5} more</li>}
          </ul>
        )}
      </div>
    );
  }
  if (mutation.isError) {
    return (
      <p className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
        <XIcon className="size-4" />
        {mutation.error?.message}
      </p>
    );
  }
  return null;
}

function AdminOverviewPage() {
  const { data: cronStatus } = useCronStatus();
  const { data: setsData, isLoading: setsLoading } = useSets();
  const { data: tcgData, isLoading: tcgLoading } = useTcgplayerGroups();
  const { data: cmData, isLoading: cmLoading } = useCardmarketGroups();

  const sets = setsData?.sets ?? [];
  const totalCards = sets.reduce((sum, s) => sum + s.cardCount, 0);
  const totalPrintings = sets.reduce((sum, s) => sum + s.printingCount, 0);

  const tcgGroups = tcgData?.groups ?? [];
  const tcgAssigned = tcgGroups.reduce((sum, g) => sum + g.assignedCount, 0);
  const tcgStaged = tcgGroups.reduce((sum, g) => sum + g.stagedCount, 0);

  const cmGroups = cmData?.expansions ?? [];
  const cmAssigned = cmGroups.reduce((sum, e) => sum + e.assignedCount, 0);
  const cmStaged = cmGroups.reduce((sum, e) => sum + e.stagedCount, 0);

  const isLoading = setsLoading || tcgLoading || cmLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Catalog</h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
          <StatCard title="Sets" value={sets.length} />
          <StatCard title="Cards" value={totalCards} />
          <StatCard title="Printings" value={totalPrintings} />
        </div>
      </section>

      <ImagesSection />

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">TCGplayer</h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
          <StatCard title="Groups" value={tcgGroups.length} />
          <StatCard title="Products mapped" value={tcgAssigned} />
          <StatCard title="Products staged" value={tcgStaged} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Cardmarket</h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
          <StatCard title="Groups" value={cmGroups.length} />
          <StatCard title="Products mapped" value={cmAssigned} />
          <StatCard title="Products staged" value={cmStaged} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Next automatic refresh</h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
          <ScheduleCard label="TCGplayer" cronKey="tcgplayer" cronStatus={cronStatus} />
          <ScheduleCard label="Cardmarket" cronKey="cardmarket" cronStatus={cronStatus} />
        </div>
      </section>
    </div>
  );
}
