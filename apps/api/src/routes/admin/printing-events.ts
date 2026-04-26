import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { createLogger } from "@openrift/shared/logger";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { flushPendingPrintingEvents } from "../../services/flush-printing-events.js";
import { runJob } from "../../services/run-job.js";
import type { Variables } from "../../types.js";

const log = createLogger("admin");

const FLUSH_KIND = "discord.flush_printing_events";

// ── Schemas ─────────────────────────────────────────────────────────────────

const webhookFailureSchema = z.object({
  channel: z.enum(["newPrintings", "printingChanges"]),
  status: z.number().optional(),
  detail: z.string(),
});

const flushResponseSchema = z.object({
  sent: z.number().openapi({ example: 5 }),
  failed: z.number().openapi({ example: 0 }),
  failures: z.array(webhookFailureSchema).optional(),
});

const fieldChangeSchema = z.object({
  field: z.string(),
  from: z.unknown(),
  to: z.unknown(),
});

const printingEventViewSchema = z.object({
  id: z.string().uuid(),
  eventType: z.enum(["new", "changed"]),
  status: z.enum(["pending", "sent", "failed"]),
  retryCount: z.number(),
  printingId: z.string(),
  cardName: z.string().nullable(),
  cardSlug: z.string().nullable(),
  setName: z.string().nullable(),
  shortCode: z.string().nullable(),
  rarity: z.string().nullable(),
  finish: z.string().nullable(),
  finishLabel: z.string().nullable(),
  artist: z.string().nullable(),
  language: z.string().nullable(),
  languageName: z.string().nullable(),
  frontImageUrl: z.string().nullable(),
  changes: z.array(fieldChangeSchema).nullable(),
  createdAt: z.string(),
});

const printingEventsListResponseSchema = z.object({
  events: z.array(printingEventViewSchema),
});

const retryRequestSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

const retryResponseSchema = z.object({
  retried: z.number(),
});

// ── Route definitions ───────────────────────────────────────────────────────

const flushRoute = createRoute({
  method: "post",
  path: "/printing-events/flush",
  tags: ["Admin - Operations"],
  responses: {
    200: {
      content: { "application/json": { schema: flushResponseSchema } },
      description: "Pending printing events flushed to Discord",
    },
  },
});

const listRoute = createRoute({
  method: "get",
  path: "/printing-events",
  tags: ["Admin - Operations"],
  responses: {
    200: {
      content: { "application/json": { schema: printingEventsListResponseSchema } },
      description: "Pending and failed printing events in the Discord queue",
    },
  },
});

const retryRoute = createRoute({
  method: "post",
  path: "/printing-events/retry",
  tags: ["Admin - Operations"],
  request: {
    body: { content: { "application/json": { schema: retryRequestSchema } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: retryResponseSchema } },
      description: "Failed events reset to pending so the next flush picks them up",
    },
  },
});

// ── Route ───────────────────────────────────────────────────────────────────

export const adminPrintingEventsRoute = new OpenAPIHono<{ Variables: Variables }>()
  .openapi(flushRoute, async (c) => {
    const repos = c.get("repos");
    const config = c.get("config");

    const result = await runJob({ repos, log }, FLUSH_KIND, "admin", () =>
      flushPendingPrintingEvents(
        repos,
        {
          newPrintings: config.discordWebhooks.newPrintings,
          printingChanges: config.discordWebhooks.printingChanges,
        },
        config.appBaseUrl,
        log,
      ),
    );

    if (result === null) {
      // runJob swallowed the error and recorded it in job_runs. Surface the
      // recorded error_message to the HTTP caller so the toast shows what
      // Discord actually said.
      const recent = await repos.jobRuns.listRecent({ kind: FLUSH_KIND, limit: 1 });
      const message = recent[0]?.errorMessage ?? "Flush failed (already running?)";
      throw new HTTPException(500, { message });
    }

    return c.json(result);
  })
  .openapi(listRoute, async (c) => {
    const { printingEvents } = c.get("repos");
    const events = await printingEvents.listByStatus(["pending", "failed"]);
    return c.json({
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
        frontImageUrl: e.frontImageUrl,
        changes: e.changes,
        createdAt: e.createdAt.toISOString(),
      })),
    });
  })
  .openapi(retryRoute, async (c) => {
    const { printingEvents } = c.get("repos");
    const { ids } = c.req.valid("json");
    await printingEvents.retryFailed(ids);
    return c.json({ retried: ids.length });
  });
