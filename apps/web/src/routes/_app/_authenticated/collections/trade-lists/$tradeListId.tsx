import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import { CollectionPending } from "@/components/collection/collection-pending";
import { RouteErrorFallback } from "@/components/error-message";
import { tradeListDetailQueryOptions } from "@/hooks/use-trade-lists";
import { featureFlagsQueryOptions } from "@/lib/feature-flags";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/collections/trade-lists/$tradeListId")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Trade list", noIndex: true }),
  loader: async ({ context, params }) => {
    const flags = await context.queryClient.ensureQueryData(featureFlagsQueryOptions);
    if (flags["trade-lists"] !== true) {
      throw redirect({ to: "/collections" });
    }
    try {
      await context.queryClient.ensureQueryData(
        tradeListDetailQueryOptions(context.userId, params.tradeListId),
      );
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_FOUND") {
        throw notFound();
      }
      throw error;
    }
  },
  pendingComponent: CollectionPending,
  errorComponent: RouteErrorFallback,
});
