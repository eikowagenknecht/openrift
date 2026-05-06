import type { PriceRefreshResponse } from "@openrift/shared";
import { CheckIcon, LoaderIcon, XIcon } from "lucide-react";

import { formatRelativeTime, refreshActions } from "@/components/admin/refresh-actions";
import type { CronStatus } from "@/components/admin/refresh-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useClearPrices, useLatestJobRun, useRefreshPrices } from "@/hooks/use-admin-prices";
import { useCronStatus } from "@/hooks/use-cron-status";
import { useMarketplaceGroups } from "@/hooks/use-marketplace-groups";
import type { JobRunView } from "@/lib/server-fns/api-types";

import { ConfirmClearButton } from "./confirm-clear-button";

// ── Sub-components ───────────────────────────────────────────────────────────

// `upserted` was reshaped from `{ snapshots, staging }` to `{ prices }` in the
// per-SKU prices refactor, so old `job_runs.result` rows lack `upserted.prices`.
// Verify the shape we actually render to keep historical rows from crashing.
export function isPriceRefreshResult(value: unknown): value is PriceRefreshResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (!("transformed" in value) || !("upserted" in value)) {
    return false;
  }
  const upserted = (value as { upserted: unknown }).upserted;
  if (typeof upserted !== "object" || upserted === null || !("prices" in upserted)) {
    return false;
  }
  const prices = (upserted as { prices: unknown }).prices;
  return (
    typeof prices === "object" &&
    prices !== null &&
    typeof (prices as { new: unknown }).new === "number" &&
    typeof (prices as { updated: unknown }).updated === "number"
  );
}

function PriceRefreshResult({ result }: { result: PriceRefreshResponse }) {
  const { transformed, upserted } = result;
  return (
    <div className="text-muted-foreground space-y-0.5">
      <p className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
        <CheckIcon className="size-4" />
        Fetched {transformed.groups} groups, {transformed.products} products, {transformed.prices}{" "}
        prices
      </p>
      {upserted.prices.new > 0 && <p>Inserted: {upserted.prices.new} prices</p>}
      {upserted.prices.updated > 0 && <p>Updated: {upserted.prices.updated} prices</p>}
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
  const latestRun = useLatestJobRun(refreshActions[cronKey].jobKind);

  const isRefreshRunning = refreshMutation.isPending || latestRun.data?.status === "running";
  const anyPending = isRefreshRunning || clearMutation.isPending;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <CardTitle>{label} Prices</CardTitle>
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
        clearMutation.isError) && (
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
              {clearMutation.data.deleted.variants} variants, {clearMutation.data.deleted.prices}{" "}
              prices
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
