import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod/v4";

import type { Variables } from "../../types.js";

// ── Schemas ─────────────────────────────────────────────────────────────────

const ignoreCardSourceSchema = z.object({
  source: z.string().min(1),
  sourceEntityId: z.string().min(1),
});

const ignorePrintingSourceSchema = z.object({
  source: z.string().min(1),
  sourceEntityId: z.string().min(1),
  finish: z.string().min(1).nullable().optional(),
});

const unignorePrintingSourceSchema = z.object({
  source: z.string().min(1),
  sourceEntityId: z.string().min(1),
  finish: z.string().min(1).nullable(),
});

// ── Route ───────────────────────────────────────────────────────────────────

export const ignoredSourcesRoute = new Hono<{ Variables: Variables }>()

  // ── GET /admin/ignored-sources ──────────────────────────────────────────────

  .get("/admin/ignored-sources", async (c) => {
    const { ignoredSources } = c.get("repos");

    const [cards, printings] = await Promise.all([
      ignoredSources.listIgnoredCards(),
      ignoredSources.listIgnoredPrintings(),
    ]);

    return c.json({
      cards: cards.map((r) => ({
        id: r.id,
        source: r.source,
        sourceEntityId: r.sourceEntityId,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      })),
      printings: printings.map((r) => ({
        id: r.id,
        source: r.source,
        sourceEntityId: r.sourceEntityId,
        finish: r.finish,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      })),
    });
  })

  // ── POST /admin/ignored-sources/cards ─────────────────────────────────────

  .post("/admin/ignored-sources/cards", zValidator("json", ignoreCardSourceSchema), async (c) => {
    const { ignoredSources } = c.get("repos");
    const { source, sourceEntityId } = c.req.valid("json");

    await ignoredSources.ignoreCard({ source, sourceEntityId });
    return c.body(null, 204);
  })

  // ── DELETE /admin/ignored-sources/cards ───────────────────────────────────

  .delete("/admin/ignored-sources/cards", zValidator("json", ignoreCardSourceSchema), async (c) => {
    const { ignoredSources } = c.get("repos");
    const { source, sourceEntityId } = c.req.valid("json");

    await ignoredSources.unignoreCard(source, sourceEntityId);
    return c.body(null, 204);
  })

  // ── POST /admin/ignored-sources/printings ─────────────────────────────────

  .post(
    "/admin/ignored-sources/printings",
    zValidator("json", ignorePrintingSourceSchema),
    async (c) => {
      const { ignoredSources } = c.get("repos");
      const { source, sourceEntityId, finish } = c.req.valid("json");

      await ignoredSources.ignorePrinting({ source, sourceEntityId, finish: finish ?? null });
      return c.body(null, 204);
    },
  )

  // ── DELETE /admin/ignored-sources/printings ───────────────────────────────

  .delete(
    "/admin/ignored-sources/printings",
    zValidator("json", unignorePrintingSourceSchema),
    async (c) => {
      const { ignoredSources } = c.get("repos");
      const { source, sourceEntityId, finish } = c.req.valid("json");

      await ignoredSources.unignorePrinting(source, sourceEntityId, finish);
      return c.body(null, 204);
    },
  );
