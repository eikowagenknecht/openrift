import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckIcon, LoaderIcon, RefreshCwIcon, Trash2Icon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
// ── Types ─────────────────────────────────────────────────────────────────────

export interface CronStatus {
  tcgplayer: { nextRun: string | null } | null;
  cardmarket: { nextRun: string | null } | null;
}

interface UpsertRowCounts {
  total: number;
  new: number;
  updated: number;
  unchanged: number;
}

interface PriceResult {
  fetched: {
    groups: number;
    mapped: number;
    unmapped: number;
    products: number;
    prices: number;
  };
  upserted: {
    sources: UpsertRowCounts;
    snapshots: UpsertRowCounts;
    staging: UpsertRowCounts;
  };
}

type RefreshResult = PriceResult;

interface ClearPriceResult {
  source: string;
  deleted: { snapshots: number; sources: number; staging: number };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function formatRelativeTime(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) {
    return "any moment now";
  }
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  if (hours > 0) {
    return `in ${hours}h ${minutes}m`;
  }
  return `in ${minutes}m`;
}

// ── Action configs ──────────────────────────────────────────────────────────

export const refreshActions = {
  tcgplayer: {
    key: "tcgplayer",
    title: "Refresh TCGPlayer Prices",
    description: "Fetch latest prices from TCGPlayer",
    endpoint: "/api/admin/refresh-tcgplayer-prices",
    cronKey: "tcgplayer" as const,
  },
  cardmarket: {
    key: "cardmarket",
    title: "Refresh Cardmarket Prices",
    description: "Fetch latest prices from Cardmarket",
    endpoint: "/api/admin/refresh-cardmarket-prices",
    cronKey: "cardmarket" as const,
  },
} as const;

type RefreshActionKey = keyof typeof refreshActions;
type RefreshAction = (typeof refreshActions)[RefreshActionKey];

export const clearActions = {
  tcgplayer: {
    key: "clear-tcgplayer",
    source: "tcgplayer" as const,
    title: "Clear TCGPlayer Prices",
    description: "Delete all TCGPlayer price sources, snapshots, and staging data",
  },
  cardmarket: {
    key: "clear-cardmarket",
    source: "cardmarket" as const,
    title: "Clear Cardmarket Prices",
    description: "Delete all Cardmarket price sources, snapshots, and staging data",
  },
} as const;

type ClearActionKey = keyof typeof clearActions;
type ClearAction = (typeof clearActions)[ClearActionKey];

// ── Hook ────────────────────────────────────────────────────────────────────

export function useCronStatus() {
  return useQuery<CronStatus>({
    queryKey: queryKeys.admin.cronStatus,
    queryFn: () => api.get<CronStatus>("/api/admin/cron-status"),
    refetchInterval: 60_000,
  });
}

// ── Result display components ─────────────────────────────────────────────────

function PriceResultDisplay({ result }: { result: PriceResult }) {
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

  const unchangedParts = [
    upserted.sources.unchanged > 0 ? `${upserted.sources.unchanged} sources` : null,
    upserted.snapshots.unchanged > 0 ? `${upserted.snapshots.unchanged} snapshots` : null,
    upserted.staging.unchanged > 0 ? `${upserted.staging.unchanged} staged` : null,
  ].filter(Boolean);

  return (
    <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
      <p>
        Fetched: {fetched.groups} groups ({fetched.mapped} mapped, {fetched.unmapped} unmapped),{" "}
        {fetched.products} products, {fetched.prices} prices
      </p>
      <p>Inserted: {insertedParts.length > 0 ? insertedParts.join(", ") : "—"}</p>
      <p>Updated: {updatedParts.length > 0 ? updatedParts.join(", ") : "—"}</p>
      <p>Unchanged: {unchangedParts.length > 0 ? unchangedParts.join(", ") : "—"}</p>
    </div>
  );
}

// ── Components ──────────────────────────────────────────────────────────────

async function callRefreshEndpoint(endpoint: string): Promise<RefreshResult | null> {
  const body = await api.post<{ result?: RefreshResult }>(endpoint);
  return body.result ?? null;
}

export function ActionCard({
  action,
  cronStatus,
}: {
  action: RefreshAction;
  cronStatus?: CronStatus;
}) {
  const mutation = useMutation({
    mutationFn: () => callRefreshEndpoint(action.endpoint),
  });

  const cronEntry = cronStatus?.[action.cronKey];
  const nextRun = cronEntry?.nextRun;

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2">
              <RefreshCwIcon className="size-5 shrink-0" />
              {action.title}
            </CardTitle>
            <CardDescription className="mt-1.5">{action.description}</CardDescription>
            {nextRun && (
              <p className="mt-1 text-xs text-muted-foreground">
                Next automatic run: {formatRelativeTime(nextRun)}
              </p>
            )}
          </div>
          <Button
            size="sm"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
            className="shrink-0"
          >
            {mutation.isPending ? <LoaderIcon className="size-4 animate-spin" /> : "Run"}
          </Button>
        </div>
        {mutation.isSuccess && mutation.data && <PriceResultDisplay result={mutation.data} />}
        {mutation.isError && (
          <p className="mt-2 flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
            <XIcon className="size-4" />
            {mutation.error.message}
          </p>
        )}
      </CardHeader>
    </Card>
  );
}

export function ClearPriceCard({ action }: { action: ClearAction }) {
  const mutation = useMutation({
    mutationFn: async (): Promise<ClearPriceResult> => {
      const body = await api.post<{ result: ClearPriceResult }>("/api/admin/clear-prices", {
        source: action.source,
      });
      return body.result;
    },
  });

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2">
              <Trash2Icon className="size-5 shrink-0" />
              {action.title}
            </CardTitle>
            <CardDescription className="mt-1.5">{action.description}</CardDescription>
          </div>
          <Button
            size="sm"
            variant="destructive"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
            className="shrink-0"
          >
            {mutation.isPending ? <LoaderIcon className="size-4 animate-spin" /> : "Clear"}
          </Button>
        </div>
        {mutation.isSuccess && (
          <div>
            <p className="mt-2 flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
              <CheckIcon className="size-4" />
              Cleared successfully
            </p>
            <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              <p>
                Deleted: {mutation.data.deleted.sources} sources, {mutation.data.deleted.snapshots}{" "}
                snapshots, {mutation.data.deleted.staging} staging rows
              </p>
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
  );
}
