import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";

import { AppError, ERROR_CODES } from "../../errors.js";
import type { Variables } from "../../types.js";

// ── Schemas ─────────────────────────────────────────────────────────────────

const importRulesSchema = z.object({
  version: z.string().min(1),
  sourceType: z.enum(["pdf", "text", "html", "manual"]),
  sourceUrl: z.string().nullable().optional(),
  publishedAt: z.string().nullable().optional(),
  content: z.string().min(1),
});

// ── Route definitions ───────────────────────────────────────────────────────

const importRules = createRoute({
  method: "post",
  path: "/rules/import",
  tags: ["Admin - Rules"],
  request: {
    body: { content: { "application/json": { schema: importRulesSchema } } },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: z.object({
            version: z.string().openapi({ example: "1.2.0" }),
            rulesCount: z.number().openapi({ example: 248 }),
            added: z.number().openapi({ example: 12 }),
            modified: z.number().openapi({ example: 5 }),
            removed: z.number().openapi({ example: 2 }),
          }),
        },
      },
      description: "Rules imported",
    },
  },
});

const deleteVersion = createRoute({
  method: "delete",
  path: "/rules/versions/{version}",
  tags: ["Admin - Rules"],
  request: {
    params: z.object({ version: z.string() }),
  },
  responses: {
    204: { description: "Version deleted" },
  },
});

// ── Parser ──────────────────────────────────────────────────────────────────

interface ParsedRule {
  ruleNumber: string;
  ruleType: "title" | "subtitle" | "text";
  content: string;
  depth: number;
  sortOrder: number;
}

/**
 * Computes the depth of a rule number based on its dot-separated segments.
 *
 * @returns 0 for "100", 1 for "100.1", 2 for "100.1.a", 3 for "100.1.a.1".
 */
function computeDepth(ruleNumber: string): number {
  const parts = ruleNumber.split(".");
  return Math.min(parts.length - 1, 3);
}

const RULE_LINE_REGEX = /^(\d+(?:\.[A-Za-z0-9]+)*)\.\s+(.*)$/;

/**
 * Parses the markdown rule format into rule rows. Each non-blank line is
 * `<rule_number>. <markdown_content>`, where a leading `# ` marks a title and
 * `## ` a subtitle. Literal `\n` sequences in the content become real newlines
 * so a single line can hold a multi-paragraph rule.
 *
 * @returns Array of parsed rules.
 */
export function parseRulesText(text: string): ParsedRule[] {
  const rules: ParsedRule[] = [];
  const lines = text.split("\n");
  let sortOrder = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("===")) {
      continue;
    }

    const match = RULE_LINE_REGEX.exec(line);
    if (!match) {
      continue;
    }

    const ruleNumber = match[1];
    // Tolerate a leading "| " column-separator from sources that mirror the
    // legacy pipe-delimited format.
    const rest = match[2].replace(/^\|\s*/, "");
    if (!ruleNumber || !rest) {
      continue;
    }

    let ruleType: ParsedRule["ruleType"] = "text";
    let content = rest;
    if (rest.startsWith("## ")) {
      ruleType = "subtitle";
      content = rest.slice(3);
    } else if (rest.startsWith("# ")) {
      ruleType = "title";
      content = rest.slice(2);
    }

    content = content.replaceAll(String.raw`\n`, "\n").trim();
    if (!content) {
      continue;
    }

    rules.push({
      ruleNumber,
      ruleType,
      content,
      depth: computeDepth(ruleNumber),
      sortOrder,
    });
    sortOrder++;
  }

  return rules;
}

// ── Route ───────────────────────────────────────────────────────────────────

export const adminRulesRoute = new OpenAPIHono<{ Variables: Variables }>()

  // ── POST /admin/rules/import ──────────────────────────────────────────
  .openapi(importRules, async (c) => {
    const { rules: repo } = c.get("repos");
    const transact = c.get("transact");
    const body = c.req.valid("json");

    const existing = await repo.getVersion(body.version);
    if (existing) {
      throw new AppError(409, ERROR_CODES.CONFLICT, `Version "${body.version}" already exists`);
    }

    const parsed = parseRulesText(body.content);
    if (parsed.length === 0) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "No valid rules found in content");
    }

    // Get the previous version's rules to compute diffs
    const versions = await repo.listVersions();
    const previousVersion = versions.at(-1)?.version;

    let previousRulesMap = new Map<string, string>();
    if (previousVersion) {
      const previousRules = await repo.listLatest();
      previousRulesMap = new Map(previousRules.map((r) => [r.ruleNumber, r.content]));
    }

    // Compute change types
    const newRuleNumbers = new Set(parsed.map((r) => r.ruleNumber));
    const rulesWithChanges: {
      version: string;
      ruleNumber: string;
      sortOrder: number;
      depth: number;
      ruleType: string;
      content: string;
      changeType: string;
    }[] = [];

    let added = 0;
    let modified = 0;
    let removed = 0;

    if (previousVersion) {
      // Detect added and modified rules
      for (const rule of parsed) {
        const previousContent = previousRulesMap.get(rule.ruleNumber);
        if (previousContent === undefined) {
          rulesWithChanges.push({
            version: body.version,
            ...rule,
            changeType: "added",
          });
          added++;
        } else if (previousContent !== rule.content) {
          rulesWithChanges.push({
            version: body.version,
            ...rule,
            changeType: "modified",
          });
          modified++;
        }
        // Unchanged rules: no new row needed
      }

      // Detect removed rules
      for (const [ruleNumber] of previousRulesMap) {
        if (!newRuleNumbers.has(ruleNumber)) {
          rulesWithChanges.push({
            version: body.version,
            ruleNumber,
            sortOrder: parsed.length + removed,
            depth: 0,
            ruleType: "text",
            content: "",
            changeType: "removed",
          });
          removed++;
        }
      }
    } else {
      // First version: all rules are "added"
      for (const rule of parsed) {
        rulesWithChanges.push({
          version: body.version,
          ruleNumber: rule.ruleNumber,
          sortOrder: rule.sortOrder,
          depth: rule.depth,
          ruleType: rule.ruleType,
          content: rule.content,
          changeType: "added",
        });
        added++;
      }
    }

    await transact(async (txRepos) => {
      await txRepos.rules.createVersion({
        version: body.version,
        sourceType: body.sourceType,
        sourceUrl: body.sourceUrl ?? null,
        publishedAt: body.publishedAt ?? null,
      });

      if (rulesWithChanges.length > 0) {
        await txRepos.rules.insertRules(rulesWithChanges);
      }
    });

    return c.json(
      {
        version: body.version,
        rulesCount: rulesWithChanges.length,
        added,
        modified,
        removed,
      },
      201,
    );
  })

  // ── DELETE /admin/rules/versions/:version ─────────────────────────────
  .openapi(deleteVersion, async (c) => {
    const { rules: repo } = c.get("repos");
    const { version } = c.req.valid("param");

    const existing = await repo.getVersion(version);
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Version "${version}" not found`);
    }

    await repo.deleteVersion(version);
    return c.body(null, 204);
  });
