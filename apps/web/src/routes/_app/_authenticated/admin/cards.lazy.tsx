import { createLazyFileRoute } from "@tanstack/react-router";

import { AdminCardListPage } from "@/features/admin/components/admin-card-list-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/cards")({
  component: AdminCardListPage,
});
