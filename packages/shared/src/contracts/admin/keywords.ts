import { withParams } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "../_base.js";

const TAG = "Admin - Keywords";

const BASE = "/api/admin/v1";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/u);

const keywordStatsSchema = z.object({
  counts: z.array(z.object({ keyword: z.string(), count: z.number() })),
  styles: z.array(
    z.object({
      name: z.string(),
      color: z.string(),
      darkText: z.boolean(),
      costKeyword: z.boolean(),
    }),
  ),
  translations: z.array(
    z.object({ keywordName: z.string(), language: z.string(), label: z.string() }),
  ),
});

const recomputeResultSchema = z.object({ totalCards: z.number(), updated: z.number() });

const discoverResultSchema = z.object({
  candidatesExamined: z.number(),
  discovered: z.array(z.object({ keyword: z.string(), language: z.string(), label: z.string() })),
  inserted: z.number(),
  conflicts: z.array(
    z.object({ keyword: z.string(), language: z.string(), labels: z.array(z.string()) }),
  ),
});

const nameParamSchema = z.object({ name: z.string() });
const translationParamSchema = z.object({ keywordName: z.string(), language: z.string() });

/** Admin-gated by the `/api/admin/v1` mount, not enforced here. */
export const adminKeywordsContract = {
  stats: authedRoute
    .route({ method: "GET", path: `${BASE}/keyword-stats`, tags: [TAG] })
    .output(keywordStatsSchema),
  createStyle: authedRoute
    .route({ method: "POST", path: `${BASE}/keywords`, tags: [TAG], successStatus: 204 })
    .input(
      z.object({
        name: z.string().min(1),
        color: hexColor,
        darkText: z.boolean(),
        costKeyword: z.boolean(),
      }),
    ),
  updateStyle: authedRoute
    .route({ method: "PUT", path: `${BASE}/keywords/{name}`, tags: [TAG], successStatus: 204 })
    .input(
      withParams(nameParamSchema, {
        color: hexColor,
        darkText: z.boolean(),
        costKeyword: z.boolean(),
      }),
    ),
  removeStyle: authedRoute
    .route({ method: "DELETE", path: `${BASE}/keywords/{name}`, tags: [TAG], successStatus: 204 })
    .input(nameParamSchema),
  recompute: authedRoute
    .route({ method: "POST", path: `${BASE}/recompute-keywords`, tags: [TAG] })
    .output(recomputeResultSchema),
  discoverTranslations: authedRoute
    .route({ method: "POST", path: `${BASE}/discover-keyword-translations`, tags: [TAG] })
    .output(discoverResultSchema),
  upsertTranslation: authedRoute
    .route({
      method: "PUT",
      path: `${BASE}/keyword-translations/{keywordName}/{language}`,
      tags: [TAG],
      successStatus: 204,
    })
    .input(withParams(translationParamSchema, { label: z.string().min(1) })),
  removeTranslation: authedRoute
    .route({
      method: "DELETE",
      path: `${BASE}/keyword-translations/{keywordName}/{language}`,
      tags: [TAG],
      successStatus: 204,
    })
    .input(translationParamSchema),
};

export type AdminKeywordsContract = typeof adminKeywordsContract;
export type KeywordStatsResponse = z.infer<typeof keywordStatsSchema>;
