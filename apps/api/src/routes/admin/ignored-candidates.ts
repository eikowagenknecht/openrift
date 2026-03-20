import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod/v4";

import type { Variables } from "../../types.js";

// ── Schemas ─────────────────────────────────────────────────────────────────

const ignoreCandidateCardSchema = z.object({
  provider: z.string().min(1),
  externalId: z.string().min(1),
});

const ignoreCandidatePrintingSchema = z.object({
  provider: z.string().min(1),
  externalId: z.string().min(1),
  finish: z.string().min(1).nullable().optional(),
});

const unignoreCandidatePrintingSchema = z.object({
  provider: z.string().min(1),
  externalId: z.string().min(1),
  finish: z.string().min(1).nullable(),
});

// ── Route ───────────────────────────────────────────────────────────────────

export const ignoredCandidatesRoute = new Hono<{ Variables: Variables }>()

  // ── GET /admin/ignored-candidates ──────────────────────────────────────────────

  .get("/ignored-candidates", async (c) => {
    const { ignoredCandidates } = c.get("repos");

    const [cards, printings] = await Promise.all([
      ignoredCandidates.listIgnoredCards(),
      ignoredCandidates.listIgnoredPrintings(),
    ]);

    return c.json({
      cards: cards.map((r) => ({
        id: r.id,
        provider: r.provider,
        externalId: r.externalId,
        createdAt: r.createdAt.toISOString(),
      })),
      printings: printings.map((r) => ({
        id: r.id,
        provider: r.provider,
        externalId: r.externalId,
        finish: r.finish,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  })

  // ── POST /admin/ignored-candidates/cards ─────────────────────────────────────

  .post("/ignored-candidates/cards", zValidator("json", ignoreCandidateCardSchema), async (c) => {
    const { ignoredCandidates } = c.get("repos");
    const { provider, externalId } = c.req.valid("json");

    await ignoredCandidates.ignoreCard({ provider, externalId });
    return c.body(null, 204);
  })

  // ── DELETE /admin/ignored-candidates/cards ───────────────────────────────────

  .delete("/ignored-candidates/cards", zValidator("json", ignoreCandidateCardSchema), async (c) => {
    const { ignoredCandidates } = c.get("repos");
    const { provider, externalId } = c.req.valid("json");

    await ignoredCandidates.unignoreCard(provider, externalId);
    return c.body(null, 204);
  })

  // ── POST /admin/ignored-candidates/printings ─────────────────────────────────

  .post(
    "/ignored-candidates/printings",
    zValidator("json", ignoreCandidatePrintingSchema),
    async (c) => {
      const { ignoredCandidates } = c.get("repos");
      const { provider, externalId, finish } = c.req.valid("json");

      await ignoredCandidates.ignorePrinting({ provider, externalId, finish: finish ?? null });
      return c.body(null, 204);
    },
  )

  // ── DELETE /admin/ignored-candidates/printings ───────────────────────────────

  .delete(
    "/ignored-candidates/printings",
    zValidator("json", unignoreCandidatePrintingSchema),
    async (c) => {
      const { ignoredCandidates } = c.get("repos");
      const { provider, externalId, finish } = c.req.valid("json");

      await ignoredCandidates.unignorePrinting(provider, externalId, finish);
      return c.body(null, 204);
    },
  );
