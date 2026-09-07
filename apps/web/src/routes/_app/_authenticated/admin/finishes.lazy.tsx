import { createLazyFileRoute } from "@tanstack/react-router";

import { FinishesPage } from "@/features/admin/components/finishes-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/finishes")({
  component: FinishesPage,
});
