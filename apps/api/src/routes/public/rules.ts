import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type {
  RuleKind,
  RuleResponse,
  RulesListResponse,
  RuleVersionResponse,
  RuleVersionsListResponse,
} from "@openrift/shared";
import {
  rulesListResponseSchema,
  ruleVersionsListResponseSchema,
} from "@openrift/shared/response-schemas";
import { z } from "zod";

import type { Variables } from "../../types.js";

const ruleKindEnum = z.enum(["core", "tournament"]);

// ── Route definitions ───────────────────────────────────────────────────────

const listRules = createRoute({
  method: "get",
  path: "/rules",
  tags: ["Rules"],
  request: {
    query: z.object({
      kind: ruleKindEnum,
      version: z.string().optional(),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: rulesListResponseSchema } },
      description: "List of rules",
    },
  },
});

const listVersions = createRoute({
  method: "get",
  path: "/rules/versions",
  tags: ["Rules"],
  request: {
    query: z.object({
      kind: ruleKindEnum.optional(),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: ruleVersionsListResponseSchema } },
      description: "List of rule versions",
    },
  },
});

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Maps a database rule row to a response shape.
 *
 * @returns Formatted rule response.
 */
function toRuleResponse(row: {
  id: string;
  kind: string;
  version: string;
  ruleNumber: string;
  sortOrder: number;
  depth: number;
  ruleType: string;
  content: string;
  changeType: string;
}): RuleResponse {
  return {
    id: row.id,
    kind: row.kind as RuleKind,
    version: row.version,
    ruleNumber: row.ruleNumber,
    sortOrder: row.sortOrder,
    depth: row.depth,
    ruleType: row.ruleType as RuleResponse["ruleType"],
    content: row.content,
    changeType: row.changeType as RuleResponse["changeType"],
  };
}

// ── Route ───────────────────────────────────────────────────────────────────

export const rulesRoute = new OpenAPIHono<{ Variables: Variables }>()

  // ── GET /rules ──────────────────────────────────────────────────────────
  .openapi(listRules, async (c) => {
    const { rules: repo } = c.get("repos");
    const { kind, version } = c.req.valid("query");

    const rows = version ? await repo.listAtVersion(kind, version) : await repo.listLatest(kind);

    const versions = await repo.listVersions(kind);
    const latestVersion = versions.at(-1)?.version ?? "";
    const effectiveVersion = version ?? latestVersion;

    const changes = version ? await repo.listChangesAtVersion(kind, version) : null;

    c.header("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
    return c.json({
      kind,
      rules: rows.map((row) => toRuleResponse(row)),
      version: effectiveVersion,
      ...(changes
        ? {
            changes: {
              added: changes.added,
              modifiedPrev: changes.modifiedPrev,
              removed: changes.removed.map((row) => toRuleResponse(row)),
            },
          }
        : {}),
    } satisfies RulesListResponse);
  })

  // ── GET /rules/versions ─────────────────────────────────────────────────
  .openapi(listVersions, async (c) => {
    const { rules: repo } = c.get("repos");
    const { kind } = c.req.valid("query");
    const rows = await repo.listVersions(kind);

    c.header("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
    return c.json({
      versions: rows.map(
        (r): RuleVersionResponse => ({
          kind: r.kind as RuleKind,
          version: r.version,
          comments: r.comments,
          importedAt: r.importedAt.toISOString(),
        }),
      ),
    } satisfies RuleVersionsListResponse);
  });
