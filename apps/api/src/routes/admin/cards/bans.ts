import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { idParamSchema } from "@openrift/shared/schemas";
import { z } from "zod";

import { AppError, ERROR_CODES } from "../../../errors.js";
import type { Variables } from "../../../types.js";

// ── Schemas ─────────────────────────────────────────────────────────────────

const createBanSchema = z.object({
  formatId: z.string().min(1),
  bannedAt: z.string().date(),
  reason: z.string().min(1).nullable().optional(),
});

const updateBanSchema = z.object({
  formatId: z.string().min(1),
  bannedAt: z.string().date().optional(),
  reason: z.string().min(1).nullable().optional(),
});

const removeBanSchema = z.object({
  formatId: z.string().min(1),
});

const banResponseSchema = z.object({
  id: z.string(),
  cardId: z.string(),
  formatId: z.string(),
  formatName: z.string(),
  bannedAt: z.string(),
  reason: z.string().nullable(),
  createdAt: z.string(),
});

// ── Route definitions ───────────────────────────────────────────────────────

const listBans = createRoute({
  method: "get",
  path: "/{id}/bans",
  tags: ["Admin - Cards"],
  request: { params: idParamSchema },
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ bans: z.array(banResponseSchema) }) },
      },
      description: "Active bans for the card",
    },
  },
});

const createBan = createRoute({
  method: "post",
  path: "/{id}/bans",
  tags: ["Admin - Cards"],
  request: {
    params: idParamSchema,
    body: { content: { "application/json": { schema: createBanSchema } } },
  },
  responses: {
    201: {
      content: { "application/json": { schema: z.object({ ban: banResponseSchema }) } },
      description: "Ban created",
    },
  },
});

const updateBan = createRoute({
  method: "patch",
  path: "/{id}/bans",
  tags: ["Admin - Cards"],
  request: {
    params: idParamSchema,
    body: { content: { "application/json": { schema: updateBanSchema } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ ban: banResponseSchema }) } },
      description: "Ban updated",
    },
  },
});

const removeBan = createRoute({
  method: "delete",
  path: "/{id}/bans",
  tags: ["Admin - Cards"],
  request: {
    params: idParamSchema,
    body: { content: { "application/json": { schema: removeBanSchema } } },
  },
  responses: {
    204: { description: "Ban removed" },
  },
});

// ── Route ───────────────────────────────────────────────────────────────────

export const cardBansRoute = new OpenAPIHono<{ Variables: Variables }>()

  // ── GET /admin/cards/:id/bans ── ───────────────────────────────────────────

  .openapi(listBans, async (c) => {
    const { cardBans } = c.get("repos");
    const { id } = c.req.valid("param");

    const rows = await cardBans.listByCard(id);
    return c.json({
      bans: rows.map((r) => ({
        id: r.id,
        cardId: r.cardId,
        formatId: r.formatId,
        formatName: r.formatName,
        bannedAt: r.bannedAt,
        reason: r.reason,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  })

  // ── POST /admin/cards/:id/bans ──────────────────────────────────────────

  .openapi(createBan, async (c) => {
    const { cardBans, catalog } = c.get("repos");
    const { id } = c.req.valid("param");
    const { formatId, bannedAt, reason } = c.req.valid("json");

    // Verify card exists
    const card = await catalog.cardById(id);
    if (!card) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Card not found");
    }

    // Check for duplicate active ban
    const existing = await cardBans.findActiveBan(id, formatId);
    if (existing) {
      throw new AppError(409, ERROR_CODES.CONFLICT, `Card is already banned in ${formatId}`);
    }

    const row = await cardBans.create({
      cardId: id,
      formatId,
      bannedAt,
      reason: reason ?? null,
    });

    return c.json(
      {
        ban: {
          id: row.id,
          cardId: row.cardId,
          formatId: row.formatId,
          formatName: row.formatName,
          bannedAt: row.bannedAt,
          reason: row.reason,
          createdAt: row.createdAt.toISOString(),
        },
      },
      201,
    );
  })

  // ── PATCH /admin/cards/:id/bans ─────────────────────────────────────────

  .openapi(updateBan, async (c) => {
    const { cardBans } = c.get("repos");
    const { id } = c.req.valid("param");
    const { formatId, bannedAt, reason } = c.req.valid("json");

    const fields: { bannedAt?: string; reason?: string | null } = {};
    if (bannedAt !== undefined) {
      fields.bannedAt = bannedAt;
    }
    if (reason !== undefined) {
      fields.reason = reason;
    }

    const row = await cardBans.update(id, formatId, fields);
    if (!row) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `No active ban found for format ${formatId}`);
    }

    return c.json({
      ban: {
        id: row.id,
        cardId: row.cardId,
        formatId: row.formatId,
        formatName: row.formatName,
        bannedAt: row.bannedAt,
        reason: row.reason,
        createdAt: row.createdAt.toISOString(),
      },
    });
  })

  // ── DELETE /admin/cards/:id/bans ────────────────────────────────────────

  .openapi(removeBan, async (c) => {
    const { cardBans } = c.get("repos");
    const { id } = c.req.valid("param");
    const { formatId } = c.req.valid("json");

    const removed = await cardBans.unban(id, formatId);
    if (!removed) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `No active ban found for format ${formatId}`);
    }

    return c.body(null, 204);
  });
