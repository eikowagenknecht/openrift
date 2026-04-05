import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type {
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

// ── Route definitions ───────────────────────────────────────────────────────

const listRules = createRoute({
  method: "get",
  path: "/rules",
  tags: ["Rules"],
  request: {
    query: z.object({
      version: z.string().optional(),
      q: z.string().optional(),
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
    const { version, q } = c.req.valid("query");

    let rows;
    if (q) {
      rows = await repo.search(q);
    } else if (version) {
      rows = await repo.listAtVersion(version);
    } else {
      rows = await repo.listLatest();
    }

    const versions = await repo.listVersions();
    const latestVersion = versions.at(-1)?.version ?? "";
    const effectiveVersion = version ?? latestVersion;

    c.header("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
    return c.json({
      rules: rows.map((row) => toRuleResponse(row)),
      version: effectiveVersion,
    } satisfies RulesListResponse);
  })

  // ── GET /rules/versions ─────────────────────────────────────────────────
  .openapi(listVersions, async (c) => {
    const { rules: repo } = c.get("repos");
    const rows = await repo.listVersions();

    c.header("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
    return c.json({
      versions: rows.map(
        (r): RuleVersionResponse => ({
          version: r.version,
          sourceType: r.sourceType,
          sourceUrl: r.sourceUrl,
          publishedAt: r.publishedAt,
          importedAt: r.importedAt.toISOString(),
        }),
      ),
    } satisfies RuleVersionsListResponse);
  });
