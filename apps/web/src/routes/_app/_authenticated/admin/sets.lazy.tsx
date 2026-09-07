import { createLazyFileRoute } from "@tanstack/react-router";

import { SetsPage } from "@/features/admin/components/sets-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/sets")({
  component: SetsPage,
});
