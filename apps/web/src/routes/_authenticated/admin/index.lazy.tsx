import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createLazyFileRoute } from "@tanstack/react-router";
import { CheckIcon, LoaderIcon, XIcon } from "lucide-react";
import { useState } from "react";

import {
  clearActions,
  formatRelativeTime,
  refreshActions,
  useCronStatus,
} from "@/components/admin/refresh-actions";
import type { CronStatus } from "@/components/admin/refresh-actions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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

function ConfirmClearButton({
  title,
  description,
  onConfirm,
  disabled,
  isPending,
}: {
  title: string;
  description: string;
  onConfirm: () => void;
  disabled?: boolean;
  isPending?: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger disabled={disabled} render={<Button size="sm" variant="destructive" />}>
        {isPending ? <LoaderIcon className="size-4 animate-spin" /> : "Clear"}
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogPrimitive.Close render={<Button variant="destructive" />} onClick={onConfirm}>
            Clear
          </AlertDialogPrimitive.Close>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
              <ConfirmClearButton
                title="Clear all rehosted images?"
                description="This will delete all locally cached images. They can be re-fetched by running rehost again."
                onConfirm={() => clearMutation.mutate()}
                disabled={anyPending || !status.rehosted}
                isPending={clearMutation.isPending}
              />
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

// ── Price action types ────────────────────────────────────────────────────────

interface PriceResult {
  fetched: {
    groups: number;
    mapped: number;
    unmapped: number;
    products: number;
    prices: number;
  };
  upserted: {
    sources: { total: number; new: number; updated: number; unchanged: number };
    snapshots: { total: number; new: number; updated: number; unchanged: number };
    staging: { total: number; new: number; updated: number; unchanged: number };
  };
}

interface ClearPriceResult {
  source: string;
  deleted: { snapshots: number; sources: number; staging: number };
}

function PriceSection({
  label,
  groups,
  mapped,
  staged,
  cronKey,
  cronStatus,
}: {
  label: "TCGplayer" | "Cardmarket";
  groups: number;
  mapped: number;
  staged: number;
  cronKey: keyof CronStatus;
  cronStatus?: CronStatus;
}) {
  const key = cronKey; // "tcgplayer" | "cardmarket"
  const refreshAction = refreshActions[key];
  const clearAction = clearActions[key];
  const nextRun = cronStatus?.[cronKey]?.nextRun;

  const refreshMutation = useMutation({
    mutationFn: async (): Promise<PriceResult | null> => {
      const body = await api.post<{ result?: PriceResult }>(refreshAction.endpoint);
      return body.result ?? null;
    },
  });

  const clearMutation = useMutation({
    mutationFn: async (): Promise<ClearPriceResult> => {
      const body = await api.post<{ result: ClearPriceResult }>("/api/admin/clear-prices", {
        source: clearAction.source,
      });
      return body.result;
    },
  });

  const anyPending = refreshMutation.isPending || clearMutation.isPending;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">{label}</h2>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base">{label} Prices</CardTitle>
              <CardDescription>
                {groups} groups · {mapped} mapped · {staged} staged
                {nextRun && ` · next refresh ${formatRelativeTime(nextRun)}`}
              </CardDescription>
            </div>
            <div className="flex shrink-0 gap-2">
              <ConfirmClearButton
                title={`Clear all ${label} price data?`}
                description="This will delete all price sources, snapshots, and staging data. Prices will be repopulated on the next refresh."
                onConfirm={() => clearMutation.mutate()}
                disabled={anyPending}
                isPending={clearMutation.isPending}
              />
              <Button size="sm" disabled={anyPending} onClick={() => refreshMutation.mutate()}>
                {refreshMutation.isPending ? (
                  <LoaderIcon className="size-4 animate-spin" />
                ) : (
                  "Refresh"
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        {(refreshMutation.isSuccess ||
          refreshMutation.isError ||
          clearMutation.isSuccess ||
          clearMutation.isError) && (
          <CardContent className="pt-0">
            {refreshMutation.isSuccess && refreshMutation.data && (
              <PriceRefreshResult result={refreshMutation.data} />
            )}
            {refreshMutation.isError && (
              <p className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
                <XIcon className="size-4" />
                {refreshMutation.error.message}
              </p>
            )}
            {clearMutation.isSuccess && (
              <p className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                <CheckIcon className="size-4" />
                Cleared {clearMutation.data.deleted.sources} sources,{" "}
                {clearMutation.data.deleted.snapshots} snapshots,{" "}
                {clearMutation.data.deleted.staging} staging rows
              </p>
            )}
            {clearMutation.isError && (
              <p className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
                <XIcon className="size-4" />
                {clearMutation.error.message}
              </p>
            )}
          </CardContent>
        )}
      </Card>
    </section>
  );
}

function PriceRefreshResult({ result }: { result: PriceResult }) {
  const { fetched, upserted } = result;

  const insertedParts = [
    upserted.sources.new > 0 ? `${upserted.sources.new} sources` : null,
    upserted.snapshots.new > 0 ? `${upserted.snapshots.new} snapshots` : null,
    upserted.staging.new > 0 ? `${upserted.staging.new} staged` : null,
  ].filter(Boolean);

  const updatedParts = [
    upserted.sources.updated > 0 ? `${upserted.sources.updated} sources` : null,
    upserted.snapshots.updated > 0 ? `${upserted.snapshots.updated} snapshots` : null,
    upserted.staging.updated > 0 ? `${upserted.staging.updated} staged` : null,
  ].filter(Boolean);

  return (
    <div className="space-y-0.5 text-xs text-muted-foreground">
      <p className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
        <CheckIcon className="size-4" />
        Fetched {fetched.products} products, {fetched.prices} prices
      </p>
      <p>
        {fetched.groups} groups ({fetched.mapped} mapped, {fetched.unmapped} unmapped)
      </p>
      {insertedParts.length > 0 && <p>Inserted: {insertedParts.join(", ")}</p>}
      {updatedParts.length > 0 && <p>Updated: {updatedParts.join(", ")}</p>}
    </div>
  );
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

      <PriceSection
        label="TCGplayer"
        groups={tcgGroups.length}
        mapped={tcgAssigned}
        staged={tcgStaged}
        cronKey="tcgplayer"
        cronStatus={cronStatus}
      />

      <PriceSection
        label="Cardmarket"
        groups={cmGroups.length}
        mapped={cmAssigned}
        staged={cmStaged}
        cronKey="cardmarket"
        cronStatus={cronStatus}
      />
    </div>
  );
}
