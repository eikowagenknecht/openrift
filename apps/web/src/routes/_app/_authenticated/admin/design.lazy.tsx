import { createLazyFileRoute } from "@tanstack/react-router";

import { DesignPage } from "@/components/admin/design-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/design")({
  component: DesignPage,
});
