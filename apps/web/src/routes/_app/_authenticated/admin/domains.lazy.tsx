import { createLazyFileRoute } from "@tanstack/react-router";

import { DomainsPage } from "@/components/admin/domains-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/domains")({
  component: DomainsPage,
});
