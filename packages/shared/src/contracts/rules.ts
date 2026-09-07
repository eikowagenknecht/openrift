import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { oc } from "@orpc/contract";
import { z } from "zod";

extendZodWithOpenApi(z);

/** Which rulebook a rule belongs to. Mirrors the `rules.kind` CHECK. */
export const RULE_KINDS = ["core", "tournament"] as const;
/** A rule's role in the document outline. Mirrors the `rules.rule_type` CHECK. */
export const RULE_TYPES = ["title", "subtitle", "text"] as const;
/** How a rule differs from the previous version. Mirrors the `rules.change_type` CHECK. */
export const RULE_CHANGE_TYPES = ["added", "modified", "removed"] as const;

export const ruleKindSchema = z.enum(RULE_KINDS);
export const ruleTypeSchema = z.enum(RULE_TYPES);
export const ruleChangeTypeSchema = z.enum(RULE_CHANGE_TYPES);

export const ruleResponseSchema = z.object({
  id: z.string().openapi({ example: "019cfc3b-0369-7000-8000-000000000100" }),
  kind: ruleKindSchema,
  version: z.string().openapi({ example: "1.2.0" }),
  ruleNumber: z.string().openapi({ example: "3.4.1" }),
  sortOrder: z.number().openapi({ example: 120 }),
  depth: z.number().openapi({ example: 2 }),
  ruleType: ruleTypeSchema,
  content: z.string().openapi({
    example: "A player loses the game if they would draw a card from an empty deck.",
  }),
  changeType: ruleChangeTypeSchema,
});

export const ruleVersionResponseSchema = z.object({
  kind: ruleKindSchema,
  version: z.string().openapi({ example: "1.2.0" }),
  comments: z.string().nullable().openapi({ example: "First public release." }),
  importedAt: z.string().openapi({ example: "2026-02-16T08:30:00Z" }),
});

export const ruleChangesResponseSchema = z.object({
  added: z.array(z.string()),
  modifiedPrev: z.record(z.string(), z.string()),
  removed: z.array(ruleResponseSchema),
});

export const rulesListResponseSchema = z
  .object({
    kind: ruleKindSchema,
    rules: z.array(ruleResponseSchema),
    version: z.string(),
    changes: ruleChangesResponseSchema.optional(),
  })
  .openapi("RulesListResponse");

export const ruleVersionsListResponseSchema = z
  .object({ versions: z.array(ruleVersionResponseSchema) })
  .openapi("RuleVersionsListResponse");

export const rulesContract = {
  list: oc
    .route({ method: "GET", path: "/api/v1/rules", tags: ["Rules"] })
    .meta({ auth: "public", cache: "long", etag: true })
    .input(z.object({ kind: ruleKindSchema, version: z.string().optional() }))
    .output(rulesListResponseSchema),
  versions: oc
    .route({ method: "GET", path: "/api/v1/rules/versions", tags: ["Rules"] })
    .meta({ auth: "public", cache: "long", etag: true })
    .input(z.object({ kind: ruleKindSchema.optional() }))
    .output(ruleVersionsListResponseSchema),
};

export type RulesContract = typeof rulesContract;
