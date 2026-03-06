import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckIcon, LoaderIcon, RefreshCwIcon, Trash2Icon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { API_BASE } from "@/lib/api-base";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CronStatus {
  tcgplayer: { nextRun: string | null } | null;
  cardmarket: { nextRun: string | null } | null;
  catalog: null;
}

interface CatalogChange {
  kind: "added" | "updated" | "stale";
  entity: "set" | "card" | "printing";
  id: string;
  name?: string;
  fields?: string[];
}

interface CatalogResult {
  sets: { total: number; names: string[] };
  cards: { total: number };
  printings: { total: number };
  changes: CatalogChange[];
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

type RefreshResult = CatalogResult | PriceResult;

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

function isCatalogResult(result: RefreshResult): result is CatalogResult {
  return "changes" in result;
}

// ── Action configs ──────────────────────────────────────────────────────────

export const refreshActions = {
  catalog: {
    key: "catalog",
    title: "Refresh Catalog",
    description: "Re-import sets, cards, and printings from JSON data",
    endpoint: "/api/admin/refresh-catalog",
    cronKey: "catalog" as const,
  },
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
    queryKey: ["admin", "cron-status"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/cron-status`, { credentials: "include" });
      if (!res.ok) {
        throw new Error("Failed to fetch cron status");
      }
      return res.json();
    },
    refetchInterval: 60_000,
  });
}

// ── Result display components ─────────────────────────────────────────────────

function CatalogResultDisplay({ result }: { result: CatalogResult }) {
  const added = result.changes.filter((c) => c.kind === "added");
  const updated = result.changes.filter((c) => c.kind === "updated");
  const stale = result.changes.filter((c) => c.kind === "stale");

  return (
    <div className="mt-2 space-y-1.5 text-xs text-muted-foreground">
      <p>
        {result.sets.total} sets, {result.cards.total} cards, {result.printings.total} printings
      </p>
      {result.changes.length === 0 ? (
        <p className="text-green-600 dark:text-green-400">No changes detected</p>
      ) : (
        <div className="space-y-1">
          {added.length > 0 && (
            <div>
              <p className="font-medium text-blue-600 dark:text-blue-400">+ {added.length} added</p>
              <ul className="ml-3 list-disc">
                {added.map((c) => (
                  <li key={`${c.entity}-${c.id}`}>
                    {c.entity}: {c.name ?? c.id}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {updated.length > 0 && (
            <div>
              <p className="font-medium text-yellow-600 dark:text-yellow-400">
                ~ {updated.length} updated
              </p>
              <ul className="ml-3 list-disc">
                {updated.map((c) => (
                  <li key={`${c.entity}-${c.id}`}>
                    {c.entity}: {c.name ?? c.id}
                    {c.fields && (
                      <span className="text-muted-foreground/70"> ({c.fields.join(", ")})</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {stale.length > 0 && (
            <div>
              <p className="font-medium text-red-600 dark:text-red-400">
                ! {stale.length} stale (in DB but not in seed)
              </p>
              <ul className="ml-3 list-disc">
                {stale.map((c) => (
                  <li key={`${c.entity}-${c.id}`}>
                    {c.entity}: {c.name ?? c.id}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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

export function ActionCard({
  action,
  cronStatus,
}: {
  action: RefreshAction;
  cronStatus?: CronStatus;
}) {
  const mutation = useMutation({
    mutationFn: async (): Promise<RefreshResult | null> => {
      const res = await fetch(`${API_BASE}${action.endpoint}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      const body = await res.json();
      return body.result ?? null;
    },
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
        {mutation.isSuccess && (
          <div>
            <p className="mt-2 flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
              <CheckIcon className="size-4" />
              Completed successfully
            </p>
            {mutation.data &&
              (isCatalogResult(mutation.data) ? (
                <CatalogResultDisplay result={mutation.data} />
              ) : (
                <PriceResultDisplay result={mutation.data} />
              ))}
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

export function ClearPriceCard({ action }: { action: ClearAction }) {
  const mutation = useMutation({
    mutationFn: async (): Promise<ClearPriceResult> => {
      const res = await fetch(`${API_BASE}/api/admin/clear-prices`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: action.source }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      const body = await res.json();
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
