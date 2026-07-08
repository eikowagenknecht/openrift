import { createLazyFileRoute } from "@tanstack/react-router";

import { LoansPage } from "@/components/loans/loans-page";

export const Route = createLazyFileRoute("/_app/_authenticated/loans")({
  component: LoansPage,
});
