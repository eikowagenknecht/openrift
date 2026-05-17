import type { PublicTradeListDetailResponse } from "@openrift/shared";
import { createFileRoute, notFound } from "@tanstack/react-router";

import { RouteErrorFallback, RouteNotFoundFallback } from "@/components/error-message";
import { Skeleton } from "@/components/ui/skeleton";
import { publicTradeListQueryOptions } from "@/hooks/use-trade-lists";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { CONTAINER_WIDTH, PAGE_PADDING } from "@/lib/utils";

export const Route = createFileRoute("/_app/trade-lists_/share/$token")({
  head: ({ loaderData, params }) => {
    const siteUrl = getSiteUrl();
    const path = `/trade-lists/share/${params.token}`;
    const data = loaderData as PublicTradeListDetailResponse | undefined;
    if (!data) {
      return seoHead({ siteUrl, title: "Shared trade list", path });
    }
    const { tradeList, owner } = data;
    const title = `${tradeList.name} (trade list)`;
    const description = `A Riftbound trade list shared by ${owner.displayName}.`;
    return seoHead({ siteUrl, title, description, path });
  },
  loader: async ({ context, params }): Promise<PublicTradeListDetailResponse> => {
    try {
      return await context.queryClient.ensureQueryData(publicTradeListQueryOptions(params.token));
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_FOUND") {
        throw notFound();
      }
      throw error;
    }
  },
  pendingComponent: SharedTradeListPending,
  errorComponent: RouteErrorFallback,
  notFoundComponent: RouteNotFoundFallback,
});

function SharedTradeListPending() {
  return (
    <div className={`${PAGE_PADDING} ${CONTAINER_WIDTH} flex flex-col gap-4 py-4`}>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
