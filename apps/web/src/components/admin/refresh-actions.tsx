import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { client, rpc } from "@/lib/rpc-client";
// ── Types ─────────────────────────────────────────────────────────────────────

export interface CronStatus {
  tcgplayer: { nextRun: string | null } | null;
  cardmarket: { nextRun: string | null } | null;
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
    post: () => client.api.admin["refresh-tcgplayer-prices"].$post(),
    cronKey: "tcgplayer" as const,
  },
  cardmarket: {
    key: "cardmarket",
    title: "Refresh Cardmarket Prices",
    description: "Fetch latest prices from Cardmarket",
    post: () => client.api.admin["refresh-cardmarket-prices"].$post(),
    cronKey: "cardmarket" as const,
  },
} as const;

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

// ── Hook ────────────────────────────────────────────────────────────────────

export function useCronStatus() {
  return useQuery({
    queryKey: queryKeys.admin.cronStatus,
    queryFn: () => rpc(client.api.admin["cron-status"].$get()),
    refetchInterval: 60_000,
  });
}
