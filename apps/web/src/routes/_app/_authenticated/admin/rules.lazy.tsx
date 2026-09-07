import { createLazyFileRoute } from "@tanstack/react-router";

import { RulesImportPage } from "@/features/admin/components/rules-import-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/rules")({
  component: RulesImportPage,
});
