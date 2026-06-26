import { oc } from "@orpc/contract";
import { z } from "zod";

const TAG = "Admin - Keywords";

const BASE = "/api/admin/v1";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/u);

const keywordStatsSchema = z.object({
  counts: z.array(z.object({ keyword: z.string(), count: z.number() })),
  styles: z.array(z.object({ name: z.string(), color: z.string(), darkText: z.boolean() })),
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

/**
 * oRPC contract for the admin keyword tooling (mounted under `/api/admin/v1`,
 * admin-gated by the mount): keyword usage stats, per-keyword display styles,
 * a recompute job, and keyword translations (auto-discovery + manual
 * upsert/delete, keyed by `{keywordName}/{language}`).
 */
export const adminKeywordsContract = {
  stats: oc
    .route({ method: "GET", path: `${BASE}/keyword-stats`, tags: [TAG] })
    .output(keywordStatsSchema),
  createStyle: oc
    .route({ method: "POST", path: `${BASE}/keywords`, tags: [TAG], successStatus: 204 })
    .input(z.object({ name: z.string().min(1), color: hexColor, darkText: z.boolean() })),
  updateStyle: oc
    .route({ method: "PUT", path: `${BASE}/keywords/{name}`, tags: [TAG], successStatus: 204 })
    .input(nameParamSchema.extend({ color: hexColor, darkText: z.boolean() })),
  removeStyle: oc
    .route({ method: "DELETE", path: `${BASE}/keywords/{name}`, tags: [TAG], successStatus: 204 })
    .input(nameParamSchema),
  recompute: oc
    .route({ method: "POST", path: `${BASE}/recompute-keywords`, tags: [TAG] })
    .output(recomputeResultSchema),
  discoverTranslations: oc
    .route({ method: "POST", path: `${BASE}/discover-keyword-translations`, tags: [TAG] })
    .output(discoverResultSchema),
  upsertTranslation: oc
    .route({
      method: "PUT",
      path: `${BASE}/keyword-translations/{keywordName}/{language}`,
      tags: [TAG],
      successStatus: 204,
    })
    .input(translationParamSchema.extend({ label: z.string().min(1) })),
  removeTranslation: oc
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
