import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { AdminPending } from "@/features/admin/components/admin-route-components";
import { adminLanguagesQueryOptions } from "@/hooks/use-languages";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/languages")({
  head: () => adminSeoHead("Languages"),
  loader: ({ context }) =>
    context.queryClient.query({ ...adminLanguagesQueryOptions, staleTime: "static" }),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
