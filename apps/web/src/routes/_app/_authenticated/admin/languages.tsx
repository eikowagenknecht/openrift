import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminLanguagesQueryOptions } from "@/hooks/use-languages";

export const Route = createFileRoute("/_app/_authenticated/admin/languages")({
  loader: ({ context }) => context.queryClient.ensureQueryData(adminLanguagesQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
