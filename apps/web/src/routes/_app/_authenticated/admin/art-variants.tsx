import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminArtVariantsQueryOptions } from "@/hooks/use-art-variants";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/art-variants")({
  head: () => adminSeoHead("Art Variants"),
  loader: ({ context }) => context.queryClient.ensureQueryData(adminArtVariantsQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
