import { createLazyFileRoute } from "@tanstack/react-router";

import { KeywordsPage } from "@/features/admin/components/keywords-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/keywords")({
  component: KeywordsPage,
});
