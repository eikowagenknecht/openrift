import { createLazyFileRoute } from "@tanstack/react-router";

import { PriceMappingsPage } from "@/components/admin/price-mappings-page";
import { TCG_CONFIG } from "@/components/admin/source-configs";

export const Route = createLazyFileRoute("/_authenticated/admin/tcgplayer-mappings")({
  component: () => <PriceMappingsPage config={TCG_CONFIG} />,
});
