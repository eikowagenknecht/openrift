import type { RuleKind } from "@openrift/shared";
import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { ruleVersionsQueryOptions } from "@/hooks/use-rules";
import { ruleKindTitle, VALID_RULE_KINDS } from "@/lib/rules-kinds";
import { rulesSearchSchema } from "@/lib/rules-search-schema";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/rules_/$kind")({
  validateSearch: rulesSearchSchema,
  // Before `head`, not after: a `head` that reads route data in between breaks
  // the builder's inference chain and the loader's `deps` collapses to `{}`.
  loaderDeps: ({ search }) => ({ q: search.q }),
  head: ({ params }) => {
    if (!VALID_RULE_KINDS.has(params.kind as RuleKind)) {
      return {};
    }
    const kind = params.kind as RuleKind;
    return seoHead({
      siteUrl: getSiteUrl(),
      title: ruleKindTitle(kind),
      description:
        kind === "tournament"
          ? "Read the official Riftbound tournament rules and event policy."
          : "Read the official Riftbound core game rules with version history and keyword reference.",
      path: `/rules/${kind}`,
    });
  },
  loader: async ({ params, context, location, deps }) => {
    if (!VALID_RULE_KINDS.has(params.kind as RuleKind)) {
      throw notFound();
    }
    const kind = params.kind as RuleKind;
    const versions = await context.queryClient.ensureQueryData(ruleVersionsQueryOptions(kind));
    const latest = versions.versions.at(-1);
    if (latest) {
      throw redirect({
        to: "/rules/$kind/$version",
        params: { kind, version: latest.version },
        // Carried through: /rules/core?q=might is the shareable form, and the
        // command palette's "Search rules" row produces exactly that.
        search: deps.q === undefined ? {} : { q: deps.q },
        hash: location.hash || undefined,
        replace: true,
      });
    }
    return { kind };
  },
  errorComponent: RouteErrorFallback,
});
