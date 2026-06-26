import { adminPrintingEventsContract } from "@openrift/shared/contracts";
import { createLogger } from "@openrift/shared/logger";
import type { DiffValue } from "@openrift/shared/response-schemas";
import { implement } from "@orpc/server";

import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { flushPendingPrintingEvents } from "../../services/flush-printing-events.js";
import { runJobAsync } from "../../services/run-job.js";

const log = createLogger("admin");

const FLUSH_KIND = "discord.flush_printing_events";

const os = implement(adminPrintingEventsContract).$context<ApiContext>().use(requireUser);

/**
 * oRPC implementation of the admin printing-events Discord queue. Logic
 * unchanged from the previous `@hono/zod-openapi` handlers; any thrown
 * `AppError` is mapped by the handler's {@link appErrorInterceptor}.
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
          {
            newPrintings: config.discordWebhooks.newPrintings,
            printingChanges: config.discordWebhooks.printingChanges,
          },
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
        eventType: e.eventType,
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
        // The DB column is opaque JSON (FieldChange.from/to are `unknown`); the
        // API contract narrows it to the serializable diff values it holds.
        changes: e.changes as { field: string; from: DiffValue; to: DiffValue }[] | null,
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
