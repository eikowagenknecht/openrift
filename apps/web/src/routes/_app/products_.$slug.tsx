import type { ProductDetailResponse } from "@openrift/shared/contracts";
import { createFileRoute, notFound } from "@tanstack/react-router";

import { NotFoundFallback, RouteErrorFallback } from "@/components/error-message";
import { Skeleton } from "@/components/ui/skeleton";
import { productDetailQueryOptions } from "@/hooks/use-products";
import { filterSearchSchema } from "@/lib/search-schemas";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { cn, CONTAINER_WIDTH, PAGE_PADDING } from "@/lib/utils";

export const Route = createFileRoute("/_app/products_/$slug")({
  validateSearch: filterSearchSchema,
  head: ({ loaderData, params }) => {
    const siteUrl = getSiteUrl();
    const path = `/products/${params.slug}`;
    const data = loaderData as ProductDetailResponse | undefined;
    if (!data) {
      return seoHead({ siteUrl, title: "Product", path, unlisted: true });
    }
    const { product } = data;
    return seoHead({
      siteUrl,
      title: product.name,
      description:
        product.description ??
        `Every card in ${product.name}, a fixed-content Riftbound product (${product.cardTotal} cards).`,
      path,
    });
  },
  loader: async ({ context, params }): Promise<ProductDetailResponse> => {
    try {
      return await context.queryClient.ensureQueryData(productDetailQueryOptions(params.slug));
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_FOUND") {
        throw notFound();
      }
      throw error;
    }
  },
  pendingComponent: ProductDetailPending,
  errorComponent: RouteErrorFallback,
  notFoundComponent: NotFoundFallback,
});

function ProductDetailPending() {
  return (
    <div className={cn(PAGE_PADDING, CONTAINER_WIDTH, "flex flex-col gap-4 py-4")}>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
