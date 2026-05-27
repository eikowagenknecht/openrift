import type { PublicListDetailResponse } from "@openrift/shared";
import { createFileRoute, notFound } from "@tanstack/react-router";

import { NotFoundFallback, RouteErrorFallback } from "@/components/error-message";
import { Skeleton } from "@/components/ui/skeleton";
import { publicListQueryOptions } from "@/hooks/use-lists";
import { filterSearchSchema } from "@/lib/search-schemas";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { CONTAINER_WIDTH, PAGE_PADDING } from "@/lib/utils";

export const Route = createFileRoute("/_app/lists_/share/$token")({
  validateSearch: filterSearchSchema,
  head: ({ loaderData, params }) => {
    const siteUrl = getSiteUrl();
    const path = `/lists/share/${params.token}`;
    const data = loaderData as PublicListDetailResponse | undefined;
    if (!data) {
      return seoHead({ siteUrl, title: "Shared list", path });
    }
    const { list, owner } = data;
    const title = `${list.name} (${list.intent} list)`;
    const description = `A Riftbound ${list.intent} list shared by ${owner.displayName}.`;
    return seoHead({ siteUrl, title, description, path });
  },
  loader: async ({ context, params }): Promise<PublicListDetailResponse> => {
    try {
      return await context.queryClient.ensureQueryData(publicListQueryOptions(params.token));
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_FOUND") {
        throw notFound();
      }
      throw error;
    }
  },
  pendingComponent: SharedListPending,
  errorComponent: RouteErrorFallback,
  notFoundComponent: NotFoundFallback,
});

function SharedListPending() {
  return (
    <div className={`${PAGE_PADDING} ${CONTAINER_WIDTH} flex flex-col gap-4 py-4`}>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
