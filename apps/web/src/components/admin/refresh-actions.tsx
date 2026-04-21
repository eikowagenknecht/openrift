import type { PriceRefreshResponse } from "@openrift/shared";
import { createServerFn } from "@tanstack/react-start";

import { fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";

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

// ── Server functions for refresh actions ───────────────────────────────────

const refreshTcgplayerPricesFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(({ context }) =>
    fetchApiJson<PriceRefreshResponse>({
      errorTitle: "Couldn't refresh TCGPlayer prices",
      cookie: context.cookie,
      path: "/api/v1/admin/refresh-tcgplayer-prices",
      method: "POST",
    }),
  );

const refreshCardmarketPricesFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(({ context }) =>
    fetchApiJson<PriceRefreshResponse>({
      errorTitle: "Couldn't refresh Cardmarket prices",
      cookie: context.cookie,
      path: "/api/v1/admin/refresh-cardmarket-prices",
      method: "POST",
    }),
  );

const refreshCardtraderPricesFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(({ context }) =>
    fetchApiJson<PriceRefreshResponse>({
      errorTitle: "Couldn't refresh CardTrader prices",
      cookie: context.cookie,
      path: "/api/v1/admin/refresh-cardtrader-prices",
      method: "POST",
    }),
  );

// ── Action configs ──────────────────────────────────────────────────────────

export const refreshActions = {
  tcgplayer: {
    key: "tcgplayer",
    title: "Refresh TCGPlayer Prices",
    description: "Fetch latest prices from TCGPlayer",
    post: refreshTcgplayerPricesFn,
    cronKey: "tcgplayer" as const,
  },
  cardmarket: {
    key: "cardmarket",
    title: "Refresh Cardmarket Prices",
    description: "Fetch latest prices from Cardmarket",
    post: refreshCardmarketPricesFn,
    cronKey: "cardmarket" as const,
  },
  cardtrader: {
    key: "cardtrader",
    title: "Refresh CardTrader Prices",
    description: "Fetch latest prices from CardTrader",
    post: refreshCardtraderPricesFn,
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
