import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";

import { discoverKeywordTranslations } from "../../services/keyword-translation-discovery.js";
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
            counts: z.array(
              z.object({
                keyword: z.string().openapi({ example: "Accelerate" }),
                count: z.number().openapi({ example: 14 }),
              }),
            ),
            styles: z.array(
              z.object({
                name: z.string().openapi({ example: "Accelerate" }),
                color: z.string().openapi({ example: "#24705f" }),
                darkText: z.boolean().openapi({ example: false }),
              }),
            ),
            translations: z.array(
              z.object({
                keywordName: z.string().openapi({ example: "Accelerate" }),
                language: z.string().openapi({ example: "DE" }),
                label: z.string().openapi({ example: "Beschleunigen" }),
              }),
            ),
          }),
        },
      },
      description: "Keyword usage counts, styles, and translations",
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
          schema: z.object({
            totalCards: z.number().openapi({ example: 342 }),
            updated: z.number().openapi({ example: 17 }),
          }),
        },
      },
      description: "Keywords recomputed for all cards",
    },
  },
});

const discoverTranslations = createRoute({
  method: "post",
  path: "/discover-keyword-translations",
  tags: ["Admin - Keywords"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            candidatesExamined: z.number().openapi({ example: 124 }),
            discovered: z.array(
              z.object({
                keyword: z.string().openapi({ example: "Accelerate" }),
                language: z.string().openapi({ example: "DE" }),
                label: z.string().openapi({ example: "Beschleunigen" }),
              }),
            ),
            inserted: z.number().openapi({ example: 8 }),
            conflicts: z.array(
              z.object({
                keyword: z.string().openapi({ example: "Ambush" }),
                language: z.string().openapi({ example: "FR" }),
                labels: z.array(z.string()).openapi({ example: ["Embuscade", "Embuscader"] }),
              }),
            ),
          }),
        },
      },
      description: "Auto-discovered keyword translations from card printings",
    },
  },
});

const upsertTranslation = createRoute({
  method: "put",
  path: "/keyword-translations/{keywordName}/{language}",
  tags: ["Admin - Keywords"],
  request: {
    params: z.object({ keywordName: z.string(), language: z.string() }),
    body: {
      content: {
        "application/json": {
          schema: z.object({ label: z.string().min(1) }),
        },
      },
    },
  },
  responses: { 204: { description: "Translation upserted" } },
});

const deleteTranslation = createRoute({
  method: "delete",
  path: "/keyword-translations/{keywordName}/{language}",
  tags: ["Admin - Keywords"],
  request: {
    params: z.object({ keywordName: z.string(), language: z.string() }),
  },
  responses: { 204: { description: "Translation deleted" } },
});

// ── Router ──────────────────────────────────────────────────────────────────

export const adminKeywordsRoute = new OpenAPIHono<{ Variables: Variables }>()

  .openapi(getKeywordStats, async (c) => {
    const { keywordStyles } = c.get("repos");
    const [counts, allStyles, translations] = await Promise.all([
      keywordStyles.getKeywordCounts(),
      keywordStyles.listAll(),
      keywordStyles.listAllTranslations(),
    ]);
    const styles = allStyles.map((s) => ({ name: s.name, color: s.color, darkText: s.darkText }));
    return c.json({ counts, styles, translations });
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
  })

  .openapi(discoverTranslations, async (c) => {
    const repos = c.get("repos");
    const result = await discoverKeywordTranslations(repos);
    return c.json(result);
  })

  .openapi(upsertTranslation, async (c) => {
    const { keywordName, language } = c.req.valid("param");
    const { label } = c.req.valid("json");
    await c.get("repos").keywordStyles.upsertTranslation({ keywordName, language, label });
    return c.body(null, 204);
  })

  .openapi(deleteTranslation, async (c) => {
    const { keywordName, language } = c.req.valid("param");
    await c.get("repos").keywordStyles.deleteTranslation(keywordName, language);
    return c.body(null, 204);
  });
