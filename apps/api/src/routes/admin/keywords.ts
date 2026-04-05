import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";

import type { Variables } from "../../types.js";

// ── Route definitions ───────────────────────────────────────────────────────

const getKeywordStats = createRoute({
  method: "get",
  path: "/keyword-stats",
  tags: ["Admin - Keywords"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            counts: z.array(z.object({ keyword: z.string(), count: z.number() })),
            styles: z.array(
              z.object({
                name: z.string(),
                color: z.string(),
                darkText: z.boolean(),
              }),
            ),
          }),
        },
      },
      description: "Keyword usage counts and styles",
    },
  },
});

const updateKeywordStyle = createRoute({
  method: "put",
  path: "/keyword-styles/{name}",
  tags: ["Admin - Keywords"],
  request: {
    params: z.object({ name: z.string() }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
            darkText: z.boolean(),
          }),
        },
      },
    },
  },
  responses: { 204: { description: "Style updated" } },
});

const createKeywordStyle = createRoute({
  method: "post",
  path: "/keyword-styles",
  tags: ["Admin - Keywords"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            name: z.string().min(1),
            color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
            darkText: z.boolean(),
          }),
        },
      },
    },
  },
  responses: { 204: { description: "Style created" } },
});

const deleteKeywordStyle = createRoute({
  method: "delete",
  path: "/keyword-styles/{name}",
  tags: ["Admin - Keywords"],
  request: { params: z.object({ name: z.string() }) },
  responses: { 204: { description: "Style deleted" } },
});

const recomputeKeywords = createRoute({
  method: "post",
  path: "/recompute-keywords",
  tags: ["Admin - Keywords"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ totalCards: z.number(), updated: z.number() }),
        },
      },
      description: "Keywords recomputed for all cards",
    },
  },
});

// ── Router ──────────────────────────────────────────────────────────────────

export const adminKeywordsRoute = new OpenAPIHono<{ Variables: Variables }>()

  .openapi(getKeywordStats, async (c) => {
    const { keywordStyles } = c.get("repos");
    const [counts, allStyles] = await Promise.all([
      keywordStyles.getKeywordCounts(),
      keywordStyles.listAll(),
    ]);
    const styles = allStyles.map((s) => ({ name: s.name, color: s.color, darkText: s.darkText }));
    return c.json({ counts, styles });
  })

  .openapi(updateKeywordStyle, async (c) => {
    const { name } = c.req.valid("param");
    const { color, darkText } = c.req.valid("json");
    await c.get("repos").keywordStyles.upsertStyle({ name, color, darkText });
    return c.body(null, 204);
  })

  .openapi(createKeywordStyle, async (c) => {
    const body = c.req.valid("json");
    await c.get("repos").keywordStyles.createStyle(body);
    return c.body(null, 204);
  })

  .openapi(deleteKeywordStyle, async (c) => {
    const { name } = c.req.valid("param");
    await c.get("repos").keywordStyles.deleteStyle(name);
    return c.body(null, 204);
  })

  .openapi(recomputeKeywords, async (c) => {
    const { candidateMutations } = c.get("repos");
    const result = await candidateMutations.recomputeAllKeywords();
    return c.json(result);
  });
