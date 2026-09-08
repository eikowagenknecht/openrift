import type { Logger } from "@openrift/shared/logger";
import type { Kysely } from "kysely";

import type { Database } from "./db/tables.js";
import type { Repos } from "./deps.js";
import { createTransact } from "./deps.js";
import type { createEmailSender } from "./email.js";
import {
  flushPendingPrintingEvents,
  isPrintingFlushNoop,
} from "./modules/catalog/services/flush-printing-events.js";
import {
  extractDigestWatermark,
  isTradeMatchDigestNoop,
  sendTradeMatchDigest,
} from "./modules/groups/services/trade-match-digest.js";
import {
  flushCoalescedTradeRequests,
  isTradeRequestFlushNoop,
} from "./modules/groups/services/trade-notifications.js";
import {
  flushTradeStatusEmails,
  isTradeStatusFlushNoop,
} from "./modules/groups/services/trade-status-notifications.js";
import { refreshCardmarketPrices } from "./modules/marketplace/services/price-refresh/cardmarket.js";
import { refreshCardtraderPrices } from "./modules/marketplace/services/price-refresh/cardtrader.js";
import { refreshTcgplayerPrices } from "./modules/marketplace/services/price-refresh/tcgplayer.js";
import {
  createMetaSyncDeps,
  createPlayloltcgSyncDeps,
  createTopdeckSyncDeps,
  isCatalogSyncNoop,
  isPlayloltcgRecheckNoop,
  isPlayloltcgSyncNoop,
  isRecheckNoop,
  isTopdeckSyncNoop,
  playloltcgCoolingDown,
  PLAYLOLTCG_RECHECK_BATCH_SIZE,
  processPlayloltcgRechecks,
  processRechecks,
  RECHECK_BATCH_SIZE,
  syncCatalog,
  syncPlayloltcgCatalog,
  syncTopdeckCatalog,
} from "./modules/meta/services/meta-sync/index.js";
import {
  extractWatermark,
  postChangelogToDiscord,
} from "./modules/system/services/changelog-discord.js";
import type { AnyJobDefinition } from "./modules/system/services/job-scheduler.js";
import { defineJob } from "./modules/system/services/job-scheduler.js";
import type { Config } from "./types.js";

const JOB_RUNS_RETENTION_DAYS = 30;

interface JobDefinitionDeps {
  config: Config;
  repos: Repos;
  db: Kysely<Database>;
  sendEmail: ReturnType<typeof createEmailSender>;
  log: Logger;
}

/** In `SCHEDULED_JOB_KINDS` order; `list()` shows them in this order. */
export function createJobDefinitions(deps: JobDefinitionDeps): AnyJobDefinition[] {
  const { config, repos, db, sendEmail, log } = deps;
  const transact = createTransact(db);

  const tcgLog = log.child({ service: "tcgplayer" });
  const cmLog = log.child({ service: "cardmarket" });
  const ctLog = log.child({ service: "cardtrader" });
  const clLog = log.child({ service: "changelog" });
  const peLog = log.child({ service: "printing-events" });
  const jrLog = log.child({ service: "job-runs-cleanup" });
  const cteLog = log.child({ service: "card-trades-expire" });
  const tdLog = log.child({ service: "trade-match-digest" });
  const trfLog = log.child({ service: "trade-request-flush" });
  const tsfLog = log.child({ service: "trade-status-flush" });
  const metaLog = log.child({ service: "meta-sync" });

  const metaDeps = () =>
    createMetaSyncDeps({
      repos,
      transact,
      fetch: globalThis.fetch,
      log: metaLog,
      baseUrl: config.metaSync.baseUrl,
    });

  const playloltcgDeps = () =>
    createPlayloltcgSyncDeps({
      repos,
      transact,
      fetch: globalThis.fetch,
      log: metaLog,
      baseUrl: config.metaSync.playloltcgBaseUrl,
    });

  const topdeckApiKey = config.metaSync.topdeckApiKey;
  const topdeckDeps = () =>
    createTopdeckSyncDeps({
      repos,
      transact,
      fetch: globalThis.fetch,
      log: metaLog,
      baseUrl: config.metaSync.topdeckBaseUrl,
      apiKey: topdeckApiKey ?? "",
    });

  return [
    defineJob({
      kind: "tcgplayer.refresh",
      title: "TCGPlayer price refresh",
      description: "Fetches the current TCGPlayer prices for every mapped printing.",
      suggestedSchedule: "0 6 * * *",
      log: tcgLog,
      execute: () => refreshTcgplayerPrices(globalThis.fetch, repos, tcgLog),
      summarize: (result) => result,
    }),
    defineJob({
      kind: "cardmarket.refresh",
      title: "Cardmarket price refresh",
      description: "Fetches the current Cardmarket prices for every mapped printing.",
      suggestedSchedule: "15 6 * * *",
      log: cmLog,
      execute: () => refreshCardmarketPrices(globalThis.fetch, repos, cmLog),
      summarize: (result) => result,
    }),
    defineJob({
      kind: "cardtrader.refresh",
      title: "CardTrader price refresh",
      description: "Fetches the current CardTrader prices for every mapped printing.",
      suggestedSchedule: "30 6 * * *",
      unavailableReason: config.cardtraderApiToken ? undefined : "CARDTRADER_API_TOKEN is not set.",
      log: ctLog,
      execute: () =>
        refreshCardtraderPrices(globalThis.fetch, repos, ctLog, config.cardtraderApiToken),
      summarize: (result) => result,
    }),
    defineJob({
      kind: "discord.post_changelog",
      title: "Changelog Discord post",
      description: "Posts new changelog entries to the announcements channel on Discord.",
      suggestedSchedule: "0 20 * * *",
      unavailableReason: config.discordWebhooks.changelog
        ? undefined
        : "DISCORD_WEBHOOK_CHANGELOG is not set.",
      log: clLog,
      execute: async (runId) => {
        const prior = await repos.jobRuns.findLatestForResume("discord.post_changelog");
        return await postChangelogToDiscord({
          webhookUrl: config.discordWebhooks.changelog,
          changelogPath: config.changelogPath,
          jobRuns: repos.jobRuns,
          runId,
          fromDate: extractWatermark(prior?.result),
          log: clLog,
        });
      },
      summarize: (result) => result,
    }),
    defineJob({
      kind: "discord.flush_printing_events",
      title: "New-printing Discord posts",
      description: "Posts the cards added since the last run to the new-printings channel.",
      suggestedSchedule: "*/15 * * * *",
      unavailableReason: config.discordWebhooks.newPrintings
        ? undefined
        : "DISCORD_WEBHOOK_NEW_PRINTINGS is not set.",
      log: peLog,
      execute: () =>
        flushPendingPrintingEvents(
          repos,
          { newPrintings: config.discordWebhooks.newPrintings },
          config.appBaseUrl,
          peLog,
        ),
      summarize: (result) => result,
      classifyNoop: isPrintingFlushNoop,
    }),
    defineJob({
      kind: "job_runs.cleanup",
      title: "Job history cleanup",
      description: `Deletes job runs older than ${JOB_RUNS_RETENTION_DAYS} days.`,
      suggestedSchedule: "0 4 * * *",
      log: jrLog,
      execute: async () => {
        const cutoff = new Date(Date.now() - JOB_RUNS_RETENTION_DAYS * 24 * 60 * 60 * 1000);
        const deleted = await repos.jobRuns.purgeOlderThan(cutoff);
        return { deleted, cutoff: cutoff.toISOString() };
      },
      summarize: (summary) => summary,
      classifyNoop: (summary) => summary.deleted === 0,
    }),
    defineJob({
      kind: "card_trades.expire_pending",
      title: "Expire pending trades",
      description: "Closes trade offers nobody answered before their deadline.",
      suggestedSchedule: "*/15 * * * *",
      log: cteLog,
      execute: () => repos.cardTrades.expirePending(),
      summarize: (result) => result,
      classifyNoop: (result) => result.expired === 0,
    }),
    defineJob({
      kind: "email.trade_match_digest",
      title: "Trade match digest",
      description: "Emails each member the new trade matches found since the last digest.",
      suggestedSchedule: "0 8 * * *",
      log: tdLog,
      execute: async () => {
        const prior = await repos.jobRuns.findLatestForResume("email.trade_match_digest");
        const sinceTimestamp = extractDigestWatermark(prior?.result);
        // Watermark from the run start, not its end, so matches created mid-run
        // aren't skipped (at worst re-sent next day).
        const runStartedAt = new Date();
        const result = await sendTradeMatchDigest({
          repos,
          log: tdLog,
          sendEmail,
          appBaseUrl: config.appBaseUrl,
          unsubscribeSecret: config.auth.secret,
          sinceTimestamp,
        });
        return { ...result, lastRunAt: runStartedAt.toISOString() };
      },
      summarize: (result) => result,
      classifyNoop: isTradeMatchDigestNoop,
    }),
    defineJob({
      kind: "email.flush_trade_requests",
      title: "Trade request emails",
      description: "Sends the follow-up email once a burst of trade requests has settled.",
      suggestedSchedule: "* * * * *",
      log: trfLog,
      execute: () =>
        flushCoalescedTradeRequests({
          repos,
          log: trfLog,
          sendEmail,
          appBaseUrl: config.appBaseUrl,
          unsubscribeSecret: config.auth.secret,
        }),
      summarize: (result) => result,
      classifyNoop: isTradeRequestFlushNoop,
    }),
    defineJob({
      kind: "email.flush_trade_status",
      title: "Trade status emails",
      description: "Tells the other party a trade was accepted, declined or cancelled.",
      suggestedSchedule: "* * * * *",
      log: tsfLog,
      execute: () =>
        flushTradeStatusEmails({
          repos,
          log: tsfLog,
          sendEmail,
          appBaseUrl: config.appBaseUrl,
          unsubscribeSecret: config.auth.secret,
        }),
      summarize: (result) => result,
      classifyNoop: isTradeStatusFlushNoop,
    }),
    defineJob({
      kind: "meta.uvsgames_sync",
      title: "UVS Games event sync",
      description: "Reads the UVS Games event list and queues anything new for a full fetch.",
      suggestedSchedule: "0 6 * * *",
      log: metaLog,
      execute: (runId) => syncCatalog(metaDeps(), runId),
      summarize: (result) => result,
      classifyNoop: isCatalogSyncNoop,
    }),
    defineJob({
      kind: "meta.uvsgames_recheck",
      title: "UVS Games event recheck",
      description: "Re-fetches queued UVS Games events until their results are published.",
      suggestedSchedule: "*/10 * * * *",
      log: metaLog,
      execute: (runId) => processRechecks(metaDeps(), RECHECK_BATCH_SIZE, runId),
      summarize: (result) => result,
      classifyNoop: isRecheckNoop,
    }),
    defineJob({
      kind: "meta.playloltcg_sync",
      title: "PlayLoLTCG event sync",
      description: "Reads the PlayLoLTCG event list and queues anything new for a full fetch.",
      suggestedSchedule: "0 7 * * *",
      log: metaLog,
      skipCronTick: async () => {
        const cooling = await playloltcgCoolingDown(
          playloltcgDeps(),
          "meta.playloltcg_sync",
          new Date(),
        );
        return cooling ? "playloltcg sync cooling down after a WAF block; skipping" : null;
      },
      execute: () => syncPlayloltcgCatalog(playloltcgDeps()),
      summarize: (result) => result,
      classifyNoop: isPlayloltcgSyncNoop,
    }),
    defineJob({
      kind: "meta.playloltcg_recheck",
      title: "PlayLoLTCG event recheck",
      description: "Re-fetches queued PlayLoLTCG events until their results are published.",
      suggestedSchedule: "*/10 * * * *",
      log: metaLog,
      skipCronTick: async () => {
        const cooling = await playloltcgCoolingDown(
          playloltcgDeps(),
          "meta.playloltcg_recheck",
          new Date(),
        );
        return cooling ? "playloltcg recheck cooling down after a WAF block; skipping" : null;
      },
      execute: () => processPlayloltcgRechecks(playloltcgDeps(), PLAYLOLTCG_RECHECK_BATCH_SIZE),
      summarize: (result) => result,
      classifyNoop: isPlayloltcgRecheckNoop,
    }),
    defineJob({
      kind: "meta.topdeck_sync",
      title: "Topdeck event sync",
      description:
        "Reads the last month of Topdeck tournaments, with their standings and decklists.",
      suggestedSchedule: "30 7 * * *",
      log: metaLog,
      skipCronTick: () =>
        Promise.resolve(topdeckApiKey === null ? "TOPDECK_API_KEY is unset; skipping" : null),
      execute: () => syncTopdeckCatalog(topdeckDeps()),
      summarize: (result) => result,
      classifyNoop: isTopdeckSyncNoop,
    }),
  ];
}
