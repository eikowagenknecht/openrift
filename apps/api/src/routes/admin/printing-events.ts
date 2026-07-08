import { adminPrintingEventsContract } from "@openrift/shared/contracts";
import { createLogger } from "@openrift/shared/logger";
import { implement } from "@orpc/server";

import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { flushPendingPrintingEvents } from "../../services/flush-printing-events.js";
import { runJobAsync } from "../../services/run-job.js";

const log = createLogger("admin");

const FLUSH_KIND = "discord.flush_printing_events";

const os = implement(adminPrintingEventsContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * Admin printing-events Discord queue. Any thrown `AppError` is mapped by the
 * handler's {@link appErrorInterceptor}.
 */
export const adminPrintingEventsRouter = {
  flush: os.flush.handler(async ({ context }) => {
    const repos = context.repos;
    const config = context.config;

    return await runJobAsync(
      { repos, log },
      FLUSH_KIND,
      "admin",
      () =>
        flushPendingPrintingEvents(
          repos,
          { newPrintings: config.discordWebhooks.newPrintings },
          config.appBaseUrl,
          log,
        ),
      { summarize: (result) => result },
    );
  }),

  list: os.list.handler(async ({ context }) => {
    const { printingEvents } = context.repos;
    const events = await printingEvents.listByStatus(["pending", "failed"]);
    return {
      events: events.map((e) => ({
        id: e.id,
        status: e.status,
        retryCount: e.retryCount,
        printingId: e.printingId,
        cardName: e.cardName,
        cardSlug: e.cardSlug,
        setName: e.setName,
        shortCode: e.shortCode,
        rarity: e.rarity,
        finish: e.finish,
        finishLabel: e.finishLabel,
        artist: e.artist,
        language: e.language,
        languageName: e.languageName,
        frontImageId: e.frontImageId,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }),

  retry: os.retry.handler(async ({ input, context }) => {
    const { printingEvents } = context.repos;
    const { ids } = input;
    await printingEvents.retryFailed(ids);
    return { retried: ids.length };
  }),
};
