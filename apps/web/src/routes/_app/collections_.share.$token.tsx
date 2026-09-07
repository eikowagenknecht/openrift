import type { PublicCollectionDetailResponse } from "@openrift/shared/types/api/collection";
import { createFileRoute, notFound } from "@tanstack/react-router";

import { NotFoundFallback, RouteErrorFallback } from "@/components/error-message";
import { Skeleton } from "@/components/ui/skeleton";
import { filterSearchSchema } from "@/features/cards/lib/search-schemas";
import { publicCollectionQueryOptions } from "@/features/collections/hooks/use-collections";
import { seoHead } from "@/lib/seo";
import { collectionShareImageUrl, shareImageVersion } from "@/lib/share-image";
import { getSiteUrl } from "@/lib/site-config";
import { cn, PAGE_WIDTH, PAGE_PADDING } from "@/lib/utils";

export const Route = createFileRoute("/_app/collections_/share/$token")({
  validateSearch: filterSearchSchema,
  head: ({ loaderData, params }) => {
    const siteUrl = getSiteUrl();
    const path = `/collections/share/${params.token}`;
    const data = loaderData as PublicCollectionDetailResponse | undefined;
    if (!data) {
      return seoHead({ siteUrl, title: "Shared collection", path, unlisted: true });
    }
    const { collection, owner } = data;
    const title = `${collection.name} (collection)`;
    const description =
      collection.description ?? `A Riftbound card collection shared by ${owner.displayName}.`;
    // Copies changing does not bump collections.updatedAt, so fold copyCount
    // into the version to bust the immutably-cached og:image on add/remove.
    const version = `${shareImageVersion(collection.updatedAt)}-${collection.copyCount}`;
    const ogImage = collectionShareImageUrl(siteUrl, params.token, version);
    return seoHead({ siteUrl, title, description, path, ogImage, oembed: true, unlisted: true });
  },
  loader: async ({ context, params }): Promise<PublicCollectionDetailResponse> => {
    try {
      return await context.queryClient.query({
        ...publicCollectionQueryOptions(params.token),
        staleTime: "static",
      });
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
    <div className={cn(PAGE_PADDING, PAGE_WIDTH.full, "flex flex-col gap-4 py-4")}>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
