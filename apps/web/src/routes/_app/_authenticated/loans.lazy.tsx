import { createLazyFileRoute } from "@tanstack/react-router";

import { LoansPage } from "@/features/groups/components/loans-page";

export const Route = createLazyFileRoute("/_app/_authenticated/loans")({
  component: LoansPage,
});
