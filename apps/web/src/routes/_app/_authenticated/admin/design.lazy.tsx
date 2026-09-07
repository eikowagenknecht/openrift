import { createLazyFileRoute } from "@tanstack/react-router";

import { DesignPage } from "@/features/admin/components/design/design-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/design")({
  component: DesignPage,
});
