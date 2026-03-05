import { createLazyFileRoute } from "@tanstack/react-router";

import { PriceMappingsPage } from "@/components/admin/price-mappings-page";
import { CM_CONFIG } from "@/components/admin/source-configs";

export const Route = createLazyFileRoute("/_authenticated/admin/cm-mappings")({
  component: () => <PriceMappingsPage config={CM_CONFIG} />,
});
