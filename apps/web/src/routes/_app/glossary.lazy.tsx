import { createLazyFileRoute } from "@tanstack/react-router";

import { GlossaryPage } from "@/features/rules/components/glossary-page";

export const Route = createLazyFileRoute("/_app/glossary")({
  component: GlossaryPage,
});
