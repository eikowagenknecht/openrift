import { createLazyFileRoute } from "@tanstack/react-router";

import { UnifiedMappingsPage } from "@/components/admin/unified-mappings-page";

export const Route = createLazyFileRoute("/_authenticated/admin/marketplace-mappings")({
  component: UnifiedMappingsPage,
});
