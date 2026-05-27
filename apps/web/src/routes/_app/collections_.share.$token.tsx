import type { PublicCollectionDetailResponse } from "@openrift/shared";
import { createFileRoute, notFound } from "@tanstack/react-router";

import { NotFoundFallback, RouteErrorFallback } from "@/components/error-message";
import { Skeleton } from "@/components/ui/skeleton";
import { publicCollectionQueryOptions } from "@/hooks/use-collections";
import { filterSearchSchema } from "@/lib/search-schemas";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { CONTAINER_WIDTH, PAGE_PADDING } from "@/lib/utils";

export const Route = createFileRoute("/_app/collections_/share/$token")({
  validateSearch: filterSearchSchema,
  head: ({ loaderData, params }) => {
    const siteUrl = getSiteUrl();
    const path = `/collections/share/${params.token}`;
    const data = loaderData as PublicCollectionDetailResponse | undefined;
    if (!data) {
      return seoHead({ siteUrl, title: "Shared collection", path });
    }
    const { collection, owner } = data;
    const title = `${collection.name} (collection)`;
    const description =
      collection.description ?? `A Riftbound card collection shared by ${owner.displayName}.`;
    return seoHead({ siteUrl, title, description, path });
  },
  loader: async ({ context, params }): Promise<PublicCollectionDetailResponse> => {
    try {
      return await context.queryClient.ensureQueryData(publicCollectionQueryOptions(params.token));
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_FOUND") {
        throw notFound();
      }
      throw error;
    }
  },
  pendingComponent: SharedCollectionPending,
  errorComponent: RouteErrorFallback,
  notFoundComponent: NotFoundFallback,
});

function SharedCollectionPending() {
  return (
    <div className={`${PAGE_PADDING} ${CONTAINER_WIDTH} flex flex-col gap-4 py-4`}>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
