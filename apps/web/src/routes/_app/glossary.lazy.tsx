import { createLazyFileRoute } from "@tanstack/react-router";

import { GlossaryPage } from "@/components/glossary/glossary-page";

export const Route = createLazyFileRoute("/_app/glossary")({
  component: GlossaryPage,
});
