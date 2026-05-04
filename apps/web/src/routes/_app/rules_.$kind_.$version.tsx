import type { RuleKind } from "@openrift/shared";
import { createFileRoute, notFound } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { rulesAtVersionQueryOptions, ruleVersionsQueryOptions } from "@/hooks/use-rules";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

const VALID_KINDS: ReadonlySet<RuleKind> = new Set(["core", "tournament"]);

function kindTitle(kind: RuleKind): string {
  return kind === "tournament" ? "Tournament Rules" : "Core Rules";
}

export const Route = createFileRoute("/_app/rules_/$kind_/$version")({
  head: ({ params }) => {
    if (!VALID_KINDS.has(params.kind as RuleKind)) {
      return {};
    }
    const kind = params.kind as RuleKind;
    return seoHead({
      siteUrl: getSiteUrl(),
      title: `${kindTitle(kind)} (v${params.version})`,
      description:
        kind === "tournament"
          ? `Riftbound tournament rules, version ${params.version}.`
          : `Riftbound core game rules, version ${params.version}.`,
      path: `/rules/${kind}/${params.version}`,
    });
  },
  loader: async ({ params, context }) => {
    if (!VALID_KINDS.has(params.kind as RuleKind)) {
      throw notFound();
    }
    const kind = params.kind as RuleKind;
    await Promise.all([
      context.queryClient.ensureQueryData(ruleVersionsQueryOptions(kind)),
      context.queryClient.ensureQueryData(rulesAtVersionQueryOptions(kind, params.version)),
    ]);
    return { kind, version: params.version };
  },
  errorComponent: RouteErrorFallback,
});
