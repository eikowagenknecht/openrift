import { client } from "@/lib/rpc-client";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CronStatus {
  tcgplayer: { nextRun: string | null } | null;
  cardmarket: { nextRun: string | null } | null;
  cardtrader: { nextRun: string | null } | null;
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
    post: () => client.api.v1.admin["refresh-tcgplayer-prices"].$post(),
    cronKey: "tcgplayer" as const,
  },
  cardmarket: {
    key: "cardmarket",
    title: "Refresh Cardmarket Prices",
    description: "Fetch latest prices from Cardmarket",
    post: () => client.api.v1.admin["refresh-cardmarket-prices"].$post(),
    cronKey: "cardmarket" as const,
  },
  cardtrader: {
    key: "cardtrader",
    title: "Refresh CardTrader Prices",
    description: "Fetch latest prices from CardTrader",
    post: () => client.api.v1.admin["refresh-cardtrader-prices"].$post(),
    cronKey: "cardtrader" as const,
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
  cardtrader: {
    key: "clear-cardtrader",
    source: "cardtrader" as const,
    title: "Clear CardTrader Prices",
    description: "Delete all CardTrader price sources, snapshots, and staging data",
  },
} as const;
