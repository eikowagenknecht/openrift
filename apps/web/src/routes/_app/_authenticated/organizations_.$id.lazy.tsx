import { createLazyFileRoute } from "@tanstack/react-router";

import { OrganizationPage } from "@/components/organizations/organization-page";

export const Route = createLazyFileRoute("/_app/_authenticated/organizations_/$id")({
  component: OrganizationRoute,
});

function OrganizationRoute() {
  const { id } = Route.useParams();
  return <OrganizationPage id={id} />;
}
