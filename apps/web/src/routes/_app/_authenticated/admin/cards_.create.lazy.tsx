import { createLazyFileRoute } from "@tanstack/react-router";

import { CreateCardPage } from "@/components/admin/create-card-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/cards_/create")({
  component: CreateCardPage,
});
