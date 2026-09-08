import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { AdminPending } from "@/features/admin/components/admin-route-components";
import { deskCardPrintingsQueryOptions } from "@/features/admin/hooks/use-printing-desk";
import { initQueryOptions } from "@/hooks/use-init";
import { adminMarkersQueryOptions } from "@/hooks/use-markers";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/printing-desk_/cards/$cardSlug")({
  head: () => adminSeoHead("Card printings"),
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.query({
        ...deskCardPrintingsQueryOptions(params.cardSlug),
        staleTime: "static",
      }),
      context.queryClient.query({ ...adminMarkersQueryOptions, staleTime: "static" }),
      context.queryClient.query({ ...initQueryOptions, staleTime: "static" }),
    ]);
  },
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
