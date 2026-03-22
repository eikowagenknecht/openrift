import { createLazyFileRoute } from "@tanstack/react-router";

import { SetsPage } from "@/components/admin/sets-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/sets")({
  component: SetsPage,
});
