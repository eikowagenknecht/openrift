import { createLazyFileRoute } from "@tanstack/react-router";

import { CardSourceUnmatchedPage } from "@/components/admin/card-source-unmatched-page";

export const Route = createLazyFileRoute("/_authenticated/admin/cards_/new/$name")({
  component: CardSourceUnmatchedPage,
});
