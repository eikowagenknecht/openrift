import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { AdminPending } from "@/features/admin/components/admin-route-components";
import { adminAccessQueryOptions } from "@/features/admin/hooks/use-admin";
import { deskPrintingsQueryOptions } from "@/features/admin/hooks/use-printing-desk";
import { catalogQueryOptions } from "@/features/cards/hooks/catalog-query";
import { adminDistributionChannelsQueryOptions } from "@/hooks/use-distribution-channels";
import { initQueryOptions } from "@/hooks/use-init";
import { adminMarkersQueryOptions } from "@/hooks/use-markers";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/printing-desk")({
  head: () => adminSeoHead("Your printings"),
  loader: async ({ context }) => {
    const access = await context.queryClient.query({
      ...adminAccessQueryOptions(context.userId),
      staleTime: "static",
    });
    await Promise.all([
      context.queryClient.query({
        ...deskPrintingsQueryOptions(access.isAdmin ? "all" : "mine"),
        staleTime: "static",
      }),
      context.queryClient.query({
        ...adminDistributionChannelsQueryOptions,
        staleTime: "static",
      }),
      context.queryClient.query({ ...adminMarkersQueryOptions, staleTime: "static" }),
      context.queryClient.query({ ...initQueryOptions, staleTime: "static" }),
      // The "New printing" dialog searches the catalog cache, so it must be warm first.
      context.queryClient.query({ ...catalogQueryOptions, staleTime: "static" }),
    ]);
  },
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
