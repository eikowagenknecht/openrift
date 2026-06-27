import { ERROR_CODES } from "@openrift/shared";
import type { RuleKind } from "@openrift/shared";
import { adminRulesContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(adminRulesContract).$context<ApiContext>().use(requireAuthedUser);

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

const RULE_LINE_REGEX = /^(?<number>\d+(?:\.[A-Za-z0-9]+)*)\.\s+(?<rest>.*)$/u;

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
    const rest = match[2].replace(/^\|\s*/u, "");
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

/**
 * Admin rules management. Conflict / bad-request / not-found states are thrown
 * as `AppError` and mapped by the handler's {@link appErrorInterceptor}.
 */
export const adminRulesRouter = {
  import: os.import.handler(async ({ input, context }) => {
    const { rules: repo } = context.repos;
    const transact = context.transact;
    const body = input;

    const existing = await repo.getVersion(body.kind, body.version);
    if (existing) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        `Version "${body.version}" already exists for kind "${body.kind}"`,
      );
    }

    const parsed = parseRulesText(body.content);
    if (parsed.length === 0) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "No valid rules found in content");
    }

    // Get the previous version's rules (within this kind) to compute diffs.
    // Versions are ordered ASC so `at(-1)` is the highest existing version.
    const versions = await repo.listVersions(body.kind);
    const previousVersion = versions.at(-1)?.version;

    // The diff model assumes versions arrive in chronological order. Importing
    // a version older than what's already on file would corrupt reads of the
    // existing newer versions. Reject up front.
    if (previousVersion && body.version < previousVersion) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        `Version "${body.version}" is older than the latest "${previousVersion}" for kind "${body.kind}". Imports must arrive in chronological order — delete newer versions first if you need to insert an older one.`,
      );
    }

    let previousRulesMap = new Map<string, string>();
    if (previousVersion) {
      const previousRules = await repo.listLatest(body.kind);
      previousRulesMap = new Map(previousRules.map((r) => [r.ruleNumber, r.content]));
    }

    // Compute change types
    const newRuleNumbers = new Set(parsed.map((r) => r.ruleNumber));
    const rulesWithChanges: {
      kind: typeof body.kind;
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
            kind: body.kind,
            version: body.version,
            ...rule,
            changeType: "added",
          });
          added++;
        } else if (previousContent !== rule.content) {
          rulesWithChanges.push({
            kind: body.kind,
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
            kind: body.kind,
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
      // First version (for this kind): all rules are "added"
      for (const rule of parsed) {
        rulesWithChanges.push({
          kind: body.kind,
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
        kind: body.kind,
        version: body.version,
        comments: body.comments ?? null,
      });

      if (rulesWithChanges.length > 0) {
        await txRepos.rules.insertRules(rulesWithChanges);
      }
    });

    return {
      kind: body.kind,
      version: body.version,
      rulesCount: rulesWithChanges.length,
      added,
      modified,
      removed,
    };
  }),

  removeVersion: os.removeVersion.handler(async ({ input, context }): Promise<void> => {
    const { rules: repo } = context.repos;
    const { kind, version } = input;

    const existing = await repo.getVersion(kind, version);
    if (!existing) {
      throw new AppError(
        404,
        ERROR_CODES.NOT_FOUND,
        `Version "${version}" not found for kind "${kind}"`,
      );
    }

    await repo.deleteVersion(kind, version);
  }),

  updateVersion: os.updateVersion.handler(async ({ input, context }) => {
    const { rules: repo } = context.repos;
    const { kind, version, comments } = input;

    const updated = await repo.updateComments(kind, version, comments);
    if (!updated) {
      throw new AppError(
        404,
        ERROR_CODES.NOT_FOUND,
        `Version "${version}" not found for kind "${kind}"`,
      );
    }

    return {
      kind: updated.kind as RuleKind,
      version: updated.version,
      comments: updated.comments,
    };
  }),
};
