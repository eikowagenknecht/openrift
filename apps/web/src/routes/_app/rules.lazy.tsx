import { createLazyFileRoute } from "@tanstack/react-router";

import { RulesPage } from "@/components/rules/rules-page";

export const Route = createLazyFileRoute("/_app/rules")({
  component: RulesPage,
});
