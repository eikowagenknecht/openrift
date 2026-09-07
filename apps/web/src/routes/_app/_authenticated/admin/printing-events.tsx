import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { AdminPending } from "@/features/admin/components/admin-route-components";
import { adminPrintingEventsQueryOptions } from "@/features/admin/hooks/use-flush-printing-events";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/printing-events")({
  head: () => adminSeoHead("Printing Events"),
  loader: ({ context }) =>
    context.queryClient.query({ ...adminPrintingEventsQueryOptions, staleTime: "static" }),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
