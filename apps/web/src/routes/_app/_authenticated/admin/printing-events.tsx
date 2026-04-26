import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminPrintingEventsQueryOptions } from "@/hooks/use-flush-printing-events";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/printing-events")({
  staticData: { title: "Printing Events" },
  head: () => adminSeoHead("Printing Events"),
  loader: ({ context }) => context.queryClient.ensureQueryData(adminPrintingEventsQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
