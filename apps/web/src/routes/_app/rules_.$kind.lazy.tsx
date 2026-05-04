import type { RuleKind } from "@openrift/shared";
import { createLazyFileRoute } from "@tanstack/react-router";

import { RulesPage } from "@/components/rules/rules-page";

export const Route = createLazyFileRoute("/_app/rules_/$kind")({
  component: RulesEmptyPage,
});

function RulesEmptyPage() {
  // Reached only when no versions exist yet for this kind — the loader
  // redirects to the latest version otherwise.
  const { kind } = Route.useLoaderData() as { kind: RuleKind };
  return <RulesPage kind={kind} version={null} />;
}
