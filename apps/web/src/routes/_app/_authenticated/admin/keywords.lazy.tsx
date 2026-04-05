import { createLazyFileRoute } from "@tanstack/react-router";

import { KeywordsPage } from "@/components/admin/keywords-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/keywords")({
  component: KeywordsPage,
});
