import { useMutation } from "@tanstack/react-query";
import { CheckIcon, LoaderIcon, XIcon } from "lucide-react";

import {
  clearActions,
  formatRelativeTime,
  refreshActions,
  useCronStatus,
} from "@/components/admin/refresh-actions";
import type { CronStatus } from "@/components/admin/refresh-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMarketplaceGroups } from "@/hooks/use-marketplace-groups";
import { client, rpc } from "@/lib/rpc-client";

import { ConfirmClearButton } from "./confirm-clear-button";

// ── Types ────────────────────────────────────────────────────────────────────

interface PriceResult {
  transformed: {
    groups: number;
    products: number;
    prices: number;
  };
  upserted: {
    snapshots: { total: number; new: number; updated: number; unchanged: number };
    staging: { total: number; new: number; updated: number; unchanged: number };
  };
}

interface ClearPriceResult {
  source: string;
  deleted: { snapshots: number; sources: number; staging: number };
}

// ── Sub-components ───────────────────────────────────────────────────────────

function PriceRefreshResult({ result }: { result: PriceResult }) {
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
    <div className="space-y-0.5 text-xs text-muted-foreground">
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
  const key = cronKey;
  const refreshAction = refreshActions[key];
  const clearAction = clearActions[key];
  const nextRun = cronStatus?.[cronKey]?.nextRun;

  const refreshMutation = useMutation({
    mutationFn: async (): Promise<PriceResult | null> => {
      const body = await rpc<{ result?: PriceResult }>(refreshAction.post());
      return body.result ?? null;
    },
  });

  const clearMutation = useMutation({
    mutationFn: async (): Promise<ClearPriceResult> => {
      const body = await rpc<{ result: ClearPriceResult }>(
        client.api.admin["clear-prices"].$post({ json: { source: clearAction.source } }),
      );
      return body.result;
    },
  });

  const anyPending = refreshMutation.isPending || clearMutation.isPending;

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
        </CardContent>
      )}
    </Card>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export function MarketplaceOverviewPage() {
  const { data: cronStatus } = useCronStatus();
  const { data: groupsData } = useMarketplaceGroups();

  const allGroups = groupsData?.groups ?? [];
  const tcgGroups = allGroups.filter((g) => g.marketplace === "tcgplayer");
  const cmGroups = allGroups.filter((g) => g.marketplace === "cardmarket");
  const tcgAssigned = tcgGroups.reduce((sum, g) => sum + g.assignedCount, 0);
  const tcgStaged = tcgGroups.reduce((sum, g) => sum + g.stagedCount, 0);
  const cmAssigned = cmGroups.reduce((sum, g) => sum + g.assignedCount, 0);
  const cmStaged = cmGroups.reduce((sum, g) => sum + g.stagedCount, 0);

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
    </div>
  );
}
