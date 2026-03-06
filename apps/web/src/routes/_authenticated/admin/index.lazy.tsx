import { useMutation, useQuery } from "@tanstack/react-query";
import { createLazyFileRoute } from "@tanstack/react-router";
import { CheckIcon, LoaderIcon, RefreshCwIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { API_BASE } from "@/lib/api-base";

export const Route = createLazyFileRoute("/_authenticated/admin/")({
  component: AdminIndexPage,
});

// ── Cron status query ───────────────────────────────────────────────────────

interface CronStatus {
  tcgplayer: { nextRun: string | null } | null;
  cardmarket: { nextRun: string | null } | null;
  catalog: null;
}

function formatRelativeTime(iso: string): string {
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

// ── Action cards config ─────────────────────────────────────────────────────

const actions = [
  {
    key: "catalog",
    title: "Refresh Catalog",
    description: "Re-import sets, cards, and printings from JSON data",
    endpoint: "/api/admin/refresh-catalog",
    cronKey: "catalog" as const,
  },
  {
    key: "tcgplayer",
    title: "Refresh TCGPlayer Prices",
    description: "Fetch latest prices from TCGPlayer",
    endpoint: "/api/admin/refresh-tcgplayer-prices",
    cronKey: "tcgplayer" as const,
  },
  {
    key: "cardmarket",
    title: "Refresh Cardmarket Prices",
    description: "Fetch latest prices from Cardmarket",
    endpoint: "/api/admin/refresh-cardmarket-prices",
    cronKey: "cardmarket" as const,
  },
];

// ── Components ──────────────────────────────────────────────────────────────

function ActionCard({
  action,
  cronStatus,
}: {
  action: (typeof actions)[number];
  cronStatus?: CronStatus;
}) {
  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}${action.endpoint}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
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
          <p className="mt-2 flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
            <CheckIcon className="size-4" />
            Completed successfully
          </p>
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

function AdminIndexPage() {
  const { data: cronStatus } = useQuery<CronStatus>({
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

  return (
    <div className="space-y-4">
      <section className="space-y-3">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
          {actions.map((action) => (
            <ActionCard key={action.key} action={action} cronStatus={cronStatus} />
          ))}
        </div>
      </section>
    </div>
  );
}
