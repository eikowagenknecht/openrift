import type { JobRunStartedResponse } from "@openrift/shared";
import { adminJobRunsContract } from "@openrift/shared/contracts/admin/job-runs";
import type { JobRunsListResponse } from "@openrift/shared/contracts/admin/job-runs";
import { adminOperationsContract } from "@openrift/shared/contracts/admin/operations";
import { createServerFn } from "@tanstack/react-start";

import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

// ── Server functions for refresh actions ───────────────────────────────────

const refreshTcgplayerPricesFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(({ context }): Promise<JobRunStartedResponse> =>
    apiOrpcClient(adminOperationsContract, context.cookie).refreshTcgplayer(),
  );

const refreshCardmarketPricesFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(({ context }): Promise<JobRunStartedResponse> =>
    apiOrpcClient(adminOperationsContract, context.cookie).refreshCardmarket(),
  );

const refreshCardtraderPricesFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(({ context }): Promise<JobRunStartedResponse> =>
    apiOrpcClient(adminOperationsContract, context.cookie).refreshCardtrader(),
  );

// ── Server function for polling latest job run for a kind ─────────────────

export const getLatestJobRunFn = createServerFn({ method: "GET" })
  .validator((input: { kind: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<JobRunsListResponse> =>
    apiOrpcClient(adminJobRunsContract, context.cookie).list({ kind: data.kind, limit: 1 }),
  );

// ── Action configs ──────────────────────────────────────────────────────────

export const refreshActions = {
  tcgplayer: {
    key: "tcgplayer",
    title: "Refresh TCGPlayer Prices",
    description: "Fetch latest prices from TCGPlayer",
    post: refreshTcgplayerPricesFn,
    jobKind: "tcgplayer.refresh" as const,
  },
  cardmarket: {
    key: "cardmarket",
    title: "Refresh Cardmarket Prices",
    description: "Fetch latest prices from Cardmarket",
    post: refreshCardmarketPricesFn,
    jobKind: "cardmarket.refresh" as const,
  },
  cardtrader: {
    key: "cardtrader",
    title: "Refresh CardTrader Prices",
    description: "Fetch latest prices from CardTrader",
    post: refreshCardtraderPricesFn,
    jobKind: "cardtrader.refresh" as const,
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
