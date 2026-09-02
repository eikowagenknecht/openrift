import type { RuleKind } from "@openrift/shared";
import { createFileRoute, notFound } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { rulesAtVersionQueryOptions, ruleVersionsQueryOptions } from "@/hooks/use-rules";
import { ruleKindTitle, VALID_RULE_KINDS } from "@/lib/rules-kinds";
import { rulesSearchSchema } from "@/lib/rules-search-schema";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/rules_/$kind_/$version")({
  validateSearch: rulesSearchSchema,
  head: ({ params }) => {
    if (!VALID_RULE_KINDS.has(params.kind as RuleKind)) {
      return {};
    }
    const kind = params.kind as RuleKind;
    return seoHead({
      siteUrl: getSiteUrl(),
      title: `${ruleKindTitle(kind)} (v${params.version})`,
      description:
        kind === "tournament"
          ? `Riftbound tournament rules, version ${params.version}.`
          : `Riftbound core game rules, version ${params.version}.`,
      path: `/rules/${kind}/${params.version}`,
    });
  },
  loader: async ({ params, context }) => {
    if (!VALID_RULE_KINDS.has(params.kind as RuleKind)) {
      throw notFound();
    }
    const kind = params.kind as RuleKind;
    await Promise.all([
      context.queryClient.query({ ...ruleVersionsQueryOptions(kind), staleTime: "static" }),
      context.queryClient.query({
        ...rulesAtVersionQueryOptions(kind, params.version),
        staleTime: "static",
      }),
    ]);
    return { kind, version: params.version };
  },
  errorComponent: RouteErrorFallback,
});
