import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { oc } from "@orpc/contract";
import { z } from "zod";

extendZodWithOpenApi(z);

export const ruleKindSchema = z.enum(["core", "tournament"]);

export const ruleResponseSchema = z.object({
  id: z.string().openapi({ example: "019cfc3b-0369-7000-8000-000000000100" }),
  kind: ruleKindSchema,
  version: z.string().openapi({ example: "1.2.0" }),
  ruleNumber: z.string().openapi({ example: "3.4.1" }),
  sortOrder: z.number().openapi({ example: 120 }),
  depth: z.number().openapi({ example: 2 }),
  ruleType: z.enum(["title", "subtitle", "text"]),
  content: z.string().openapi({
    example: "A player loses the game if they would draw a card from an empty deck.",
  }),
  changeType: z.enum(["added", "modified", "removed"]),
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

const ruleKindEnum = z.enum(["core", "tournament"]);

/**
 * oRPC contract for the public rules endpoints.
 *
 * `GET /api/v1/rules?kind&version` — rules for a kind, at a version (or latest).
 * `GET /api/v1/rules/versions?kind` — the list of available versions.
 *
 * The input fields map to query parameters (the paths carry no params); an
 * invalid `kind` is an oRPC-native 400.
 */
export const rulesContract = {
  list: oc
    .route({ method: "GET", path: "/api/v1/rules", tags: ["Rules"] })
    .meta({ auth: "public", cache: "long", etag: true })
    .input(z.object({ kind: ruleKindEnum, version: z.string().optional() }))
    .output(rulesListResponseSchema),
  versions: oc
    .route({ method: "GET", path: "/api/v1/rules/versions", tags: ["Rules"] })
    .meta({ auth: "public", cache: "long", etag: true })
    .input(z.object({ kind: ruleKindEnum.optional() }))
    .output(ruleVersionsListResponseSchema),
};

export type RulesContract = typeof rulesContract;
