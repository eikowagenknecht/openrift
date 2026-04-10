import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";

import type { Variables } from "../../types.js";
import {
  ignoreCandidateCardSchema,
  ignoreCandidatePrintingSchema,
  unignoreCandidatePrintingSchema,
} from "./schemas.js";

// ── Route definitions ───────────────────────────────────────────────────────

const listIgnoredCandidates = createRoute({
  method: "get",
  path: "/ignored-candidates",
  tags: ["Admin - Ignored Candidates"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            cards: z.array(
              z.object({
                id: z.string().openapi({ example: "019d0b86-f893-7a8c-b408-5286a5a5fe00" }),
                provider: z.string().openapi({ example: "riftcore" }),
                externalId: z.string().openapi({ example: "OGN-RUNE-BACK" }),
                createdAt: z.string().openapi({ example: "2026-03-20T13:54:48.083Z" }),
              }),
            ),
            printings: z.array(
              z.object({
                id: z.string().openapi({ example: "019d0b87-070a-7216-8765-a69eb3c81e17" }),
                provider: z.string().openapi({ example: "riftcore" }),
                externalId: z.string().openapi({ example: "OGN-MAIN-DECK-BACK" }),
                finish: z.string().nullable().openapi({ example: "foil" }),
                createdAt: z.string().openapi({ example: "2026-03-20T13:54:51.784Z" }),
              }),
            ),
          }),
        },
      },
      description: "List ignored candidates",
    },
  },
});

const ignoreCard = createRoute({
  method: "post",
  path: "/ignored-candidates/cards",
  tags: ["Admin - Ignored Candidates"],
  request: {
    body: { content: { "application/json": { schema: ignoreCandidateCardSchema } } },
  },
  responses: {
    204: { description: "Card ignored" },
  },
});

const unignoreCard = createRoute({
  method: "delete",
  path: "/ignored-candidates/cards",
  tags: ["Admin - Ignored Candidates"],
  request: {
    body: { content: { "application/json": { schema: ignoreCandidateCardSchema } } },
  },
  responses: {
    204: { description: "Card unignored" },
  },
});

const ignorePrinting = createRoute({
  method: "post",
  path: "/ignored-candidates/printings",
  tags: ["Admin - Ignored Candidates"],
  request: {
    body: { content: { "application/json": { schema: ignoreCandidatePrintingSchema } } },
  },
  responses: {
    204: { description: "Printing ignored" },
  },
});

const unignorePrinting = createRoute({
  method: "delete",
  path: "/ignored-candidates/printings",
  tags: ["Admin - Ignored Candidates"],
  request: {
    body: { content: { "application/json": { schema: unignoreCandidatePrintingSchema } } },
  },
  responses: {
    204: { description: "Printing unignored" },
  },
});

// ── Route ───────────────────────────────────────────────────────────────────

export const ignoredCandidatesRoute = new OpenAPIHono<{ Variables: Variables }>()

  // ── GET /admin/ignored-candidates ──────────────────────────────────────────────

  .openapi(listIgnoredCandidates, async (c) => {
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

  .openapi(ignoreCard, async (c) => {
    const { ignoredCandidates } = c.get("repos");
    const { provider, externalId } = c.req.valid("json");

    await ignoredCandidates.ignoreCard({ provider, externalId });
    return c.body(null, 204);
  })

  // ── DELETE /admin/ignored-candidates/cards ───────────────────────────────────

  .openapi(unignoreCard, async (c) => {
    const { ignoredCandidates } = c.get("repos");
    const { provider, externalId } = c.req.valid("json");

    await ignoredCandidates.unignoreCard(provider, externalId);
    return c.body(null, 204);
  })

  // ── POST /admin/ignored-candidates/printings ─────────────────────────────────

  .openapi(ignorePrinting, async (c) => {
    const { ignoredCandidates } = c.get("repos");
    const { provider, externalId, finish } = c.req.valid("json");

    await ignoredCandidates.ignorePrinting({ provider, externalId, finish: finish ?? null });
    return c.body(null, 204);
  })

  // ── DELETE /admin/ignored-candidates/printings ───────────────────────────────

  .openapi(unignorePrinting, async (c) => {
    const { ignoredCandidates } = c.get("repos");
    const { provider, externalId, finish } = c.req.valid("json");

    await ignoredCandidates.unignorePrinting(provider, externalId, finish);
    return c.body(null, 204);
  });
