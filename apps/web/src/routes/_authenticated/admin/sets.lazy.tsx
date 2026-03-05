import { createLazyFileRoute } from "@tanstack/react-router";

import { SetsPage } from "@/components/admin/sets-page";

export const Route = createLazyFileRoute("/_authenticated/admin/sets")({
  component: SetsPage,
});
