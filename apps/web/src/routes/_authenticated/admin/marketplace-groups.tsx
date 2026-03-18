import { createFileRoute } from "@tanstack/react-router";

import { marketplaceGroupsQueryOptions } from "@/hooks/use-marketplace-groups";

export const Route = createFileRoute("/_authenticated/admin/marketplace-groups")({
  loader: ({ context }) => context.queryClient.ensureQueryData(marketplaceGroupsQueryOptions),
});
