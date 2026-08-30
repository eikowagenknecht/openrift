import type { Cron } from "croner";

export const cronJobs = {
  tcgplayer: null as Cron | null,
  cardmarket: null as Cron | null,
  cardtrader: null as Cron | null,
  printingEvents: null as Cron | null,
  changelog: null as Cron | null,
  jobRunsCleanup: null as Cron | null,
  cardTradesExpire: null as Cron | null,
  tradeMatchDigest: null as Cron | null,
  tradeRequestFlush: null as Cron | null,
  tradeStatusFlush: null as Cron | null,
  metaUvsgamesSync: null as Cron | null,
  metaUvsgamesRecheck: null as Cron | null,
  metaPlayloltcgSync: null as Cron | null,
  metaPlayloltcgRecheck: null as Cron | null,
};
