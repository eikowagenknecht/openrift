import type { RuleKind } from "@openrift/shared";
import { createLazyFileRoute } from "@tanstack/react-router";

import { RulesPage } from "@/components/rules/rules-page";

export const Route = createLazyFileRoute("/_app/rules_/$kind_/$version")({
  component: RulesVersionPage,
});

function RulesVersionPage() {
  const { kind, version } = Route.useLoaderData() as { kind: RuleKind; version: string };
  return <RulesPage kind={kind} version={version} />;
}
