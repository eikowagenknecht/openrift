import { createFileRoute } from "@tanstack/react-router";

import { SourcesPage } from "@/components/collection/sources-page";

export const Route = createFileRoute("/_authenticated/collection/sources")({
  component: SourcesPage,
});
