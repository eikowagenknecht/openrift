import type { Cron } from "croner";

export const cronJobs = {
  tcgplayer: null as Cron | null,
  cardmarket: null as Cron | null,
  cardtrader: null as Cron | null,
};
