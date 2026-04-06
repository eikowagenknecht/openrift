import { createLazyFileRoute } from "@tanstack/react-router";

import { FinishesPage } from "@/components/admin/finishes-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/finishes")({
  component: FinishesPage,
});
