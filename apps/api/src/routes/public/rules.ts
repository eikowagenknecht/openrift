import type {
  RuleChangeType,
  RuleKind,
  RuleResponse,
  RulesListResponse,
  RuleType,
  RuleVersionResponse,
  RuleVersionsListResponse,
} from "@openrift/shared";
import { rulesContract } from "@openrift/shared/contracts/rules";
import { implement } from "@orpc/server";

import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

function toRuleResponse(row: {
  id: string;
  kind: RuleKind;
  version: string;
  ruleNumber: string;
  sortOrder: number;
  depth: number;
  ruleType: RuleType;
  content: string;
  changeType: RuleChangeType;
}): RuleResponse {
  return {
    id: row.id,
    kind: row.kind,
    version: row.version,
    ruleNumber: row.ruleNumber,
    sortOrder: row.sortOrder,
    depth: row.depth,
    ruleType: row.ruleType,
    content: row.content,
    changeType: row.changeType,
  };
}

const os = implement(rulesContract).$context<ApiContext>().use(requireUser);

export const rulesRouter = {
  list: os.list.handler(async ({ input, context }): Promise<RulesListResponse> => {
    const { rules: repo } = context.repos;
    const { kind, version } = input;

    const rows = version ? await repo.listAtVersion(kind, version) : await repo.listLatest(kind);

    const versions = await repo.listVersions(kind);
    const latestVersion = versions.at(-1)?.version ?? "";
    const effectiveVersion = version ?? latestVersion;

    const changes = version ? await repo.listChangesAtVersion(kind, version) : null;

    return {
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
    };
  }),

  versions: os.versions.handler(async ({ input, context }): Promise<RuleVersionsListResponse> => {
    const { rules: repo } = context.repos;
    const rows = await repo.listVersions(input.kind);
    return {
      versions: rows.map((r): RuleVersionResponse => ({
        kind: r.kind as RuleKind,
        version: r.version,
        comments: r.comments,
        importedAt: r.importedAt.toISOString(),
      })),
    };
  }),
};
