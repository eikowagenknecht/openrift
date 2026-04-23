import type { PriceRefreshResponse } from "@openrift/shared";
import { CheckIcon, LoaderIcon, XIcon } from "lucide-react";

import { formatRelativeTime, refreshActions } from "@/components/admin/refresh-actions";
import type { CronStatus } from "@/components/admin/refresh-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useClearPrices,
  useLatestJobRun,
  useReconcileSnapshots,
  useRefreshPrices,
} from "@/hooks/use-admin-prices";
import { useCronStatus } from "@/hooks/use-cron-status";
import { useMarketplaceGroups } from "@/hooks/use-marketplace-groups";
import type { JobRunView } from "@/lib/server-fns/api-types";

import { ConfirmClearButton } from "./confirm-clear-button";

// ── Sub-components ───────────────────────────────────────────────────────────

function isPriceRefreshResult(value: unknown): value is PriceRefreshResponse {
  return (
    typeof value === "object" && value !== null && "transformed" in value && "upserted" in value
  );
}

function PriceRefreshResult({ result }: { result: PriceRefreshResponse }) {
  const { transformed, upserted } = result;
  const insertedParts = [
    upserted.snapshots.new > 0 ? `${upserted.snapshots.new} snapshots` : null,
    upserted.staging.new > 0 ? `${upserted.staging.new} staged` : null,
  ].filter(Boolean);
  const updatedParts = [
    upserted.snapshots.updated > 0 ? `${upserted.snapshots.updated} snapshots` : null,
    upserted.staging.updated > 0 ? `${upserted.staging.updated} staged` : null,
  ].filter(Boolean);

  return (
    <div className="text-muted-foreground space-y-0.5">
      <p className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
        <CheckIcon className="size-4" />
        Fetched {transformed.groups} groups, {transformed.products} products, {transformed.prices}{" "}
        prices
      </p>
      {insertedParts.length > 0 && <p>Inserted: {insertedParts.join(", ")}</p>}
      {updatedParts.length > 0 && <p>Updated: {updatedParts.join(", ")}</p>}
    </div>
  );
}

function JobRunDisplay({ run }: { run: JobRunView }) {
  if (run.status === "running") {
    return (
      <p className="text-muted-foreground flex items-center gap-1 text-sm">
        <LoaderIcon className="size-4 animate-spin" />
        Running since {formatRelativeTime(run.startedAt)}
      </p>
    );
  }
  if (run.status === "failed") {
    return (
      <p className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
        <XIcon className="size-4" />
        {run.errorMessage ?? "Refresh failed"}
      </p>
    );
  }
  if (isPriceRefreshResult(run.result)) {
    return <PriceRefreshResult result={run.result} />;
  }
  return (
    <p className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
      <CheckIcon className="size-4" />
      Completed
    </p>
  );
}

function PriceSection({
  label,
  groups,
  mapped,
  staged,
  cronKey,
  cronStatus,
}: {
  label: "TCGplayer" | "Cardmarket" | "CardTrader";
  groups: number;
  mapped: number;
  staged: number;
  cronKey: keyof CronStatus;
  cronStatus?: CronStatus;
}) {
  const nextRun = cronStatus?.[cronKey]?.nextRun;

  const refreshMutation = useRefreshPrices(cronKey);
  const clearMutation = useClearPrices(cronKey);
  const reconcileMutation = useReconcileSnapshots(cronKey);
  const latestRun = useLatestJobRun(refreshActions[cronKey].jobKind);

  const isRefreshRunning = refreshMutation.isPending || latestRun.data?.status === "running";
  const anyPending = isRefreshRunning || clearMutation.isPending || reconcileMutation.isPending;

  return (
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
            <Button
              variant="outline"
              disabled={anyPending}
              onClick={() => reconcileMutation.mutate()}
              title="Fill in snapshots for staging rows whose variants were added later. Run after a price refresh."
            >
              {reconcileMutation.isPending ? (
                <LoaderIcon className="size-4 animate-spin" />
              ) : (
                "Reconcile"
              )}
            </Button>
            <Button
              disabled={anyPending}
              onClick={() =>
                refreshMutation.mutate(undefined, {
                  onSuccess: () => latestRun.refetch(),
                })
              }
            >
              {isRefreshRunning ? <LoaderIcon className="size-4 animate-spin" /> : "Refresh"}
            </Button>
          </div>
        </div>
      </CardHeader>
      {(latestRun.data ||
        refreshMutation.isError ||
        clearMutation.isSuccess ||
        clearMutation.isError ||
        reconcileMutation.isSuccess ||
        reconcileMutation.isError) && (
        <CardContent className="pt-0">
          {latestRun.data && <JobRunDisplay run={latestRun.data} />}
          {refreshMutation.isError && (
            <p className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
              <XIcon className="size-4" />
              {refreshMutation.error.message}
            </p>
          )}
          {clearMutation.isSuccess && (
            <p className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
              <CheckIcon className="size-4" />
              Cleared {clearMutation.data.deleted.products} products,{" "}
              {clearMutation.data.deleted.snapshots} snapshots, {clearMutation.data.deleted.staging}{" "}
              staging rows
            </p>
          )}
          {clearMutation.isError && (
            <p className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
              <XIcon className="size-4" />
              {clearMutation.error.message}
            </p>
          )}
          {reconcileMutation.isSuccess && (
            <p className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
              <CheckIcon className="size-4" />
              {reconcileMutation.data.snapshotsInserted === 0
                ? "No snapshots to reconcile"
                : `Inserted ${reconcileMutation.data.snapshotsInserted} snapshots from staging`}
            </p>
          )}
          {reconcileMutation.isError && (
            <p className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
              <XIcon className="size-4" />
              {reconcileMutation.error.message}
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export function MarketplaceOverviewPage() {
  const { data: cronStatus } = useCronStatus();
  const { data: groupsData } = useMarketplaceGroups();

  const allGroups = groupsData.groups;
  const tcgGroups = allGroups.filter((g) => g.marketplace === "tcgplayer");
  const cmGroups = allGroups.filter((g) => g.marketplace === "cardmarket");
  const ctGroups = allGroups.filter((g) => g.marketplace === "cardtrader");
  const tcgAssigned = tcgGroups.reduce((sum, g) => sum + g.assignedCount, 0);
  const tcgStaged = tcgGroups.reduce((sum, g) => sum + g.stagedCount, 0);
  const cmAssigned = cmGroups.reduce((sum, g) => sum + g.assignedCount, 0);
  const cmStaged = cmGroups.reduce((sum, g) => sum + g.stagedCount, 0);
  const ctAssigned = ctGroups.reduce((sum, g) => sum + g.assignedCount, 0);
  const ctStaged = ctGroups.reduce((sum, g) => sum + g.stagedCount, 0);

  return (
    <div className="space-y-4">
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
      <PriceSection
        label="CardTrader"
        groups={ctGroups.length}
        mapped={ctAssigned}
        staged={ctStaged}
        cronKey="cardtrader"
        cronStatus={cronStatus}
      />
    </div>
  );
}
